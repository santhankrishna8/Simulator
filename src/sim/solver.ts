/**
 * Circuit solver: modified nodal analysis with Newton-Raphson for diodes and
 * backward-Euler companion models for capacitors.
 *
 * Node 0 is ground. Every source carries a series resistance, so sources are
 * stamped as Norton equivalents and the system stays a pure nodal matrix.
 */

export type Elem =
  /** Plain resistance between two nodes. */
  | { k: "R"; a: number; b: number; r: number; part?: string; tag?: string }
  /** Jumper wire, modelled as a very small resistance so its current is known. */
  | { k: "W"; a: number; b: number; wire: string }
  /** Voltage source `v` with series resistance `r`; `a` is the positive side. */
  | { k: "V"; a: number; b: number; v: number; r: number; part: string }
  /** Shockley diode from `a` (anode) to `b` (cathode). */
  | { k: "D"; a: number; b: number; is: number; nvt: number; part: string }
  /** Capacitor; `a` is the positive plate. */
  | { k: "C"; a: number; b: number; c: number; part: string };

export const WIRE_OHMS = 0.02;
const GMIN = 1e-10;

export interface SolveState {
  /** Last diode junction voltage per element index (Newton starting point). */
  vd: Float64Array;
  /** Capacitor voltage per element index. */
  vc: Float64Array;
}

export function makeState(elems: Elem[]): SolveState {
  return { vd: new Float64Array(elems.length), vc: new Float64Array(elems.length) };
}

/** SPICE-style junction voltage limiting; keeps exp() from overflowing. */
function pnjlim(vnew: number, vold: number, vt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      vnew = arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    } else {
      vnew = vt * Math.log(vnew / vt);
    }
  }
  return vnew;
}

/** Solve A x = b in place with partial pivoting. Returns false if singular. */
function gauss(A: Float64Array, b: Float64Array, n: number): boolean {
  for (let c = 0; c < n; c++) {
    let p = c;
    let best = Math.abs(A[c * n + c]);
    for (let r = c + 1; r < n; r++) {
      const m = Math.abs(A[r * n + c]);
      if (m > best) {
        best = m;
        p = r;
      }
    }
    if (best < 1e-18) return false;
    if (p !== c) {
      for (let k = c; k < n; k++) {
        const t = A[c * n + k];
        A[c * n + k] = A[p * n + k];
        A[p * n + k] = t;
      }
      const t = b[c];
      b[c] = b[p];
      b[p] = t;
    }
    const piv = A[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / piv;
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
      b[r] -= f * b[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * b[k];
    b[r] = s / A[r * n + r];
  }
  return true;
}

/**
 * Advance the circuit by `dt` seconds and return node voltages (index 0 = ground = 0 V).
 * `state` is updated in place.
 */
export function solve(nodeCount: number, elems: Elem[], state: SolveState, dt: number): Float64Array {
  const n = nodeCount - 1; // unknowns exclude ground
  const v = new Float64Array(nodeCount);
  if (n <= 0) return v;

  const G0 = new Float64Array(n * n);
  const I0 = new Float64Array(n);

  const stampG = (G: Float64Array, a: number, b: number, g: number) => {
    if (a > 0) G[(a - 1) * n + (a - 1)] += g;
    if (b > 0) G[(b - 1) * n + (b - 1)] += g;
    if (a > 0 && b > 0) {
      G[(a - 1) * n + (b - 1)] -= g;
      G[(b - 1) * n + (a - 1)] -= g;
    }
  };
  /** Current `i` leaves node `a` and enters node `b` through the source. */
  const stampI = (I: Float64Array, a: number, b: number, i: number) => {
    if (a > 0) I[a - 1] -= i;
    if (b > 0) I[b - 1] += i;
  };

  for (let k = 0; k < n; k++) G0[k * n + k] += GMIN;

  const diodes: number[] = [];
  elems.forEach((e, idx) => {
    switch (e.k) {
      case "R":
        stampG(G0, e.a, e.b, 1 / e.r);
        break;
      case "W":
        stampG(G0, e.a, e.b, 1 / WIRE_OHMS);
        break;
      case "V":
        stampG(G0, e.a, e.b, 1 / e.r);
        stampI(I0, e.b, e.a, e.v / e.r);
        break;
      case "C": {
        const g = e.c / dt;
        stampG(G0, e.a, e.b, g);
        stampI(I0, e.b, e.a, g * state.vc[idx]);
        break;
      }
      case "D":
        diodes.push(idx);
        break;
    }
  });

  const G = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  const vd = diodes.map((idx) => state.vd[idx]);

  const maxIter = diodes.length ? 60 : 1;
  for (let iter = 0; iter < maxIter; iter++) {
    G.set(G0);
    rhs.set(I0);
    diodes.forEach((idx, j) => {
      const e = elems[idx] as Extract<Elem, { k: "D" }>;
      const x = Math.min(vd[j] / e.nvt, 80);
      const ex = Math.exp(x);
      const id = e.is * (ex - 1);
      const gd = (e.is / e.nvt) * ex + GMIN;
      stampG(G, e.a, e.b, gd);
      stampI(rhs, e.a, e.b, id - gd * vd[j]);
    });
    if (!gauss(G, rhs, n)) break;
    for (let k = 0; k < n; k++) v[k + 1] = rhs[k];

    let converged = true;
    diodes.forEach((idx, j) => {
      const e = elems[idx] as Extract<Elem, { k: "D" }>;
      const raw = v[e.a] - v[e.b];
      const vcrit = e.nvt * Math.log(e.nvt / (Math.SQRT2 * e.is));
      const lim = pnjlim(raw, vd[j], e.nvt, vcrit);
      if (Math.abs(lim - vd[j]) > 1e-6 + 1e-4 * Math.abs(lim)) converged = false;
      vd[j] = lim;
    });
    if (converged) break;
  }

  diodes.forEach((idx, j) => (state.vd[idx] = vd[j]));
  elems.forEach((e, idx) => {
    if (e.k === "C") state.vc[idx] = v[e.a] - v[e.b];
  });
  return v;
}

/** Current through an element, flowing from `a` to `b` inside the element. */
export function currentOf(e: Elem, idx: number, v: Float64Array, state: SolveState, dt: number, vcPrev: number): number {
  const vab = v[e.a] - v[e.b];
  switch (e.k) {
    case "R":
      return vab / e.r;
    case "W":
      return vab / WIRE_OHMS;
    case "V":
      // Positive when the source is being charged; negative when it delivers.
      return (vab - e.v) / e.r;
    case "D":
      return e.is * (Math.exp(Math.min(state.vd[idx] / e.nvt, 80)) - 1);
    case "C":
      return (e.c / dt) * (vab - vcPrev);
  }
}
