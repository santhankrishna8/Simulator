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
  | { k: "V"; a: number; b: number; v: number; r: number; part: string; pin?: string }
  /** Shockley diode from `a` (anode) to `b` (cathode). */
  | { k: "D"; a: number; b: number; is: number; nvt: number; part: string; tag?: string }
  /** Inductor; current flows from `a` to `b`. */
  | { k: "L"; a: number; b: number; l: number; part: string }
  /** NPN bipolar transistor (Ebers-Moll). `c`, `b` and `e` are collector, base and emitter nodes. */
  | { k: "Q"; c: number; b: number; e: number; is: number; bf: number; br: number; part: string }
  /** Capacitor; `a` is the positive plate. */
  | { k: "C"; a: number; b: number; c: number; part: string };

export const WIRE_OHMS = 0.02;
const GMIN = 1e-10;

export interface SolveState {
  /** Last diode junction voltage per element index (Newton starting point). For a transistor, the base-emitter voltage. */
  vd: Float64Array;
  /** A transistor's base-collector junction voltage. */
  vd2: Float64Array;
  /** Capacitor voltage per element index. */
  vc: Float64Array;
  /** Inductor current per element index. */
  il: Float64Array;
}

export function makeState(elems: Elem[]): SolveState {
  const n = elems.length;
  return { vd: new Float64Array(n), vd2: new Float64Array(n), vc: new Float64Array(n), il: new Float64Array(n) };
}

const VT = 0.02585;

/** Collector and base currents (into the device) for given junction voltages. */
export function bjtCurrents(e: { is: number; bf: number; br: number }, vbe: number, vbc: number) {
  const fe = e.is * (Math.exp(Math.min(vbe / VT, 80)) - 1);
  const fc = e.is * (Math.exp(Math.min(vbc / VT, 80)) - 1);
  return { ic: fe - fc * (1 + 1 / e.br), ib: fe / e.bf + fc / e.br };
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
      case "L": {
        const g = dt / e.l;
        stampG(G0, e.a, e.b, g);
        stampI(I0, e.a, e.b, state.il[idx]);
        break;
      }
      case "D":
      case "Q":
        diodes.push(idx);
        break;
    }
  });

  const G = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  const vd = diodes.map((idx) => state.vd[idx]);
  const vd2 = diodes.map((idx) => state.vd2[idx]);

  /** Add `coef * v[node]` to the row of `row`'s node (skipping ground). */
  const addTerm = (rowNode: number, colNode: number, coef: number) => {
    if (rowNode > 0 && colNode > 0) G[(rowNode - 1) * n + (colNode - 1)] += coef;
  };

  const maxIter = diodes.length ? 80 : 1;
  for (let iter = 0; iter < maxIter; iter++) {
    G.set(G0);
    rhs.set(I0);
    diodes.forEach((idx, j) => {
      const e = elems[idx];
      if (e.k === "D") {
        const x = Math.min(vd[j] / e.nvt, 80);
        const ex = Math.exp(x);
        const id = e.is * (ex - 1);
        const gd = (e.is / e.nvt) * ex + GMIN;
        stampG(G, e.a, e.b, gd);
        stampI(rhs, e.a, e.b, id - gd * vd[j]);
      } else if (e.k === "Q") {
        const vbe = vd[j], vbc = vd2[j];
        const { ic, ib } = bjtCurrents(e, vbe, vbc);
        const gbe = (e.is / VT) * Math.exp(Math.min(vbe / VT, 80)) + GMIN;
        const gbc = (e.is / VT) * Math.exp(Math.min(vbc / VT, 80)) + GMIN;
        // Terminal currents (into the device) and their slopes against Vbe and Vbc.
        const rows = [
          { node: e.c, i: ic, jbe: gbe, jbc: -gbc * (1 + 1 / e.br) },
          { node: e.b, i: ib, jbe: gbe / e.bf, jbc: gbc / e.br },
          { node: e.e, i: -(ic + ib), jbe: -(gbe + gbe / e.bf), jbc: gbc },
        ];
        for (const r of rows) {
          // I = I0 + jbe (vb - ve - vbe0) + jbc (vb - vc - vbc0)
          addTerm(r.node, e.b, r.jbe + r.jbc);
          addTerm(r.node, e.e, -r.jbe);
          addTerm(r.node, e.c, -r.jbc);
          if (r.node > 0) rhs[r.node - 1] -= r.i - r.jbe * vbe - r.jbc * vbc;
        }
      }
    });
    if (!gauss(G, rhs, n)) break;
    for (let k = 0; k < n; k++) v[k + 1] = rhs[k];

    let converged = true;
    diodes.forEach((idx, j) => {
      const e = elems[idx];
      if (e.k === "D") {
        const raw = v[e.a] - v[e.b];
        const vcrit = e.nvt * Math.log(e.nvt / (Math.SQRT2 * e.is));
        const lim = pnjlim(raw, vd[j], e.nvt, vcrit);
        if (Math.abs(lim - vd[j]) > 1e-6 + 1e-4 * Math.abs(lim)) converged = false;
        vd[j] = lim;
      } else if (e.k === "Q") {
        const vcrit = VT * Math.log(VT / (Math.SQRT2 * e.is));
        const be = pnjlim(v[e.b] - v[e.e], vd[j], VT, vcrit);
        const bc = pnjlim(v[e.b] - v[e.c], vd2[j], VT, vcrit);
        if (Math.abs(be - vd[j]) > 1e-6 + 1e-4 * Math.abs(be) || Math.abs(bc - vd2[j]) > 1e-6 + 1e-4 * Math.abs(bc)) converged = false;
        vd[j] = be;
        vd2[j] = bc;
      }
    });
    if (converged) break;
  }

  diodes.forEach((idx, j) => {
    state.vd[idx] = vd[j];
    state.vd2[idx] = vd2[j];
  });
  elems.forEach((e, idx) => {
    if (e.k === "C") state.vc[idx] = v[e.a] - v[e.b];
    else if (e.k === "L") state.il[idx] += (dt / e.l) * (v[e.a] - v[e.b]);
  });
  return v;
}

/** Current through an element, flowing from `a` to `b` inside the element. */
export function currentOf(e: Elem, idx: number, v: Float64Array, state: SolveState, dt: number, vcPrev: number): number {
  if (e.k === "Q") return bjtCurrents(e, state.vd[idx], state.vd2[idx]).ic;
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
    case "L":
      return state.il[idx];
  }
}
