import { BATTERIES, CATALOG, HOLE_BY_ID, LED_COLORS, type PartType, type PinDef } from "./catalog";
import type { Elem } from "./solver";

export type Rot = 0 | 1 | 2 | 3;

export interface Part {
  id: string;
  type: PartType;
  /** Position of the part's origin in grid units. */
  x: number;
  y: number;
  rot: Rot;
  props: Record<string, number | string>;
}

export interface PinRef {
  part: string;
  pin: string;
}

export interface Wire {
  id: string;
  a: PinRef;
  b: PinRef;
  color: string;
}

export interface Doc {
  parts: Part[];
  wires: Wire[];
}

export const WIRE_COLORS = ["#d63a2f", "#1d1f22", "#e8b10e", "#2f9e44", "#2f6fd6", "#e8742a", "#8a4fc2", "#f1f1ee"];

/* ---------- Geometry ---------- */

export function rotate(x: number, y: number, rot: Rot): [number, number] {
  switch (rot) {
    case 0: return [x, y];
    case 1: return [-y, x];
    case 2: return [-x, -y];
    default: return [y, -x];
  }
}

export function pinPos(part: Part, pin: PinDef): [number, number] {
  const [dx, dy] = rotate(pin.x, pin.y, part.rot);
  return [part.x + dx, part.y + dy];
}

export function findPin(part: Part, pinId: string): PinDef | undefined {
  if (part.type === "breadboard") return HOLE_BY_ID.get(pinId);
  return CATALOG[part.type].pins.find((p) => p.id === pinId);
}

export function refPos(doc: Doc, ref: PinRef): [number, number] | null {
  const part = doc.parts.find((p) => p.id === ref.part);
  if (!part) return null;
  const pin = findPin(part, ref.pin);
  return pin ? pinPos(part, pin) : null;
}

/** Map of "x,y" grid coordinates to the breadboard hole at that spot. */
export function holeMap(doc: Doc): Map<string, { board: Part; holeId: string; strip: string }> {
  const map = new Map<string, { board: Part; holeId: string; strip: string }>();
  for (const board of doc.parts) {
    if (board.type !== "breadboard") continue;
    for (const h of CATALOG.breadboard.pins) {
      const [x, y] = pinPos(board, h);
      map.set(`${x},${y}`, { board, holeId: h.id, strip: (h as { strip?: string }).strip! });
    }
  }
  return map;
}

/** Parts that have at least one lead pushed into the given breadboard. */
export function partsOnBoard(doc: Doc, boardId: string): string[] {
  const holes = holeMap(doc);
  const out: string[] = [];
  for (const p of doc.parts) {
    if (p.type === "breadboard") continue;
    const on = CATALOG[p.type].pins.some((pin) => {
      const [x, y] = pinPos(p, pin);
      return holes.get(`${x},${y}`)?.board.id === boardId;
    });
    if (on) out.push(p.id);
  }
  return out;
}

/**
 * A breadboard hole holds one lead. Returns the set of holes ("x,y") that are
 * taken, by part leads and wire ends, ignoring anything listed in `skip`.
 */
export function occupiedHoles(doc: Doc, skip: { parts?: Set<string>; wire?: string } = {}): Set<string> {
  const holes = holeMap(doc);
  const taken = new Set<string>();
  for (const p of doc.parts) {
    if (p.type === "breadboard" || skip.parts?.has(p.id)) continue;
    for (const pin of CATALOG[p.type].pins) {
      const [x, y] = pinPos(p, pin);
      const key = `${x},${y}`;
      if (holes.has(key)) taken.add(key);
    }
  }
  for (const w of doc.wires) {
    if (w.id === skip.wire) continue;
    for (const end of [w.a, w.b]) {
      const part = doc.parts.find((p) => p.id === end.part);
      if (part?.type !== "breadboard") continue;
      const pos = refPos(doc, end);
      if (pos) taken.add(`${pos[0]},${pos[1]}`);
    }
  }
  return taken;
}

/** True if the part's leads would share a hole with something already there. */
export function collides(doc: Doc, part: Part): boolean {
  if (part.type === "breadboard") return false;
  const holes = holeMap(doc);
  const taken = occupiedHoles(doc, { parts: new Set([part.id]) });
  return CATALOG[part.type].pins.some((pin) => {
    const [x, y] = pinPos(part, pin);
    const key = `${x},${y}`;
    return holes.has(key) && taken.has(key);
  });
}

/* ---------- Netlist ---------- */

export interface Runtime {
  /** Ids of push buttons currently held down. */
  pressed: Set<string>;
  /** Parts destroyed during this run (they act as an open circuit). */
  burned: Set<string>;
  /** Motor back-EMF per part id, from the engine's mechanical model. */
  emf: Map<string, number>;
  /** Relays whose coil is currently energised. */
  relays: Set<string>;
}

/** Handles to the Uno's pin elements, so the engine can change them as the sketch runs. */
export interface UnoHandle {
  part: Part;
  drivers: Map<string, Extract<Elem, { k: "V" }>>;
  v5: Extract<Elem, { k: "V" }>;
  v33: Extract<Elem, { k: "V" }>;
  reset: Extract<Elem, { k: "V" }>;
  n5v: number;
  nVin: number;
  nReset: number;
}

export interface Compiled {
  uno?: UnoHandle;
  nodeCount: number;
  elems: Elem[];
  /** Node index for a part pin ("partId.pinId") or a breadboard strip ("boardId#strip"). */
  nodeOf: Map<string, number>;
  /** Resolves any pin reference, including breadboard holes, to a node index. */
  node(ref: PinRef): number | undefined;
}

export const METER_VOLT_OHMS = 10e6;
export const METER_AMP_OHMS = 0.05;
export const MOTOR_OHMS = 6;
export const BUZZER_OHMS = 250;
const VT = 0.02585;

/** Saturation current for a diode that drops `vf` volts at `i0` amps. */
function satCurrent(vf: number, i0: number, nvt: number, rs: number): number {
  return i0 / Math.exp((vf - rs * i0) / nvt);
}

export function ldrOhms(t: number): number {
  return 1e6 * Math.pow(10, -3 * t);
}

export function compile(doc: Doc, rt: Runtime): Compiled {
  // Union-find over connection keys.
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    const p = parent.get(k);
    if (p === undefined) {
      parent.set(k, k);
      return k;
    }
    let cur: string = p;
    while (cur !== k) {
      const gp: string = parent.get(cur)!;
      parent.set(k, gp);
      k = cur;
      cur = gp;
    }
    return k;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const holes = holeMap(doc);
  const byId = new Map(doc.parts.map((p) => [p.id, p]));

  const keyOf = (ref: PinRef): string | undefined => {
    const part = byId.get(ref.part);
    if (!part) return undefined;
    if (part.type === "breadboard") {
      const hole = HOLE_BY_ID.get(ref.pin);
      return hole ? `${part.id}#${hole.strip}` : undefined;
    }
    return `${ref.part}.${ref.pin}`;
  };

  for (const p of doc.parts) {
    if (p.type === "breadboard") continue;
    for (const pin of CATALOG[p.type].pins) {
      const key = `${p.id}.${pin.id}`;
      find(key);
      const [x, y] = pinPos(p, pin);
      const hole = holes.get(`${x},${y}`);
      if (hole) union(key, `${hole.board.id}#${hole.strip}`);
    }
  }
  for (const w of doc.wires) {
    const a = keyOf(w.a);
    const b = keyOf(w.b);
    if (a) find(a);
    if (b) find(b);
  }

  // A board's grounds, SDA/SCL and IOREF are joined on the PCB.
  for (const p of doc.parts) {
    if (p.type !== "uno") continue;
    union(`${p.id}.gnd1`, `${p.id}.gnd2`);
    union(`${p.id}.gnd1`, `${p.id}.gnd3`);
    union(`${p.id}.a4`, `${p.id}.sda`);
    union(`${p.id}.a5`, `${p.id}.scl`);
    union(`${p.id}.5v`, `${p.id}.ioref`);
  }
  for (const p of doc.parts) if (p.type === "sevenseg") union(`${p.id}.com1`, `${p.id}.com2`);

  // Ground is the Uno's GND if there is one, otherwise the first battery's negative terminal.
  const board = doc.parts.find((p) => p.type === "uno");
  const battery = doc.parts.find((p) => p.type in BATTERIES);
  const groundRoot = board ? find(`${board.id}.gnd1`) : battery ? find(`${battery.id}.neg`) : undefined;

  const index = new Map<string, number>();
  let count = 1;
  if (groundRoot) index.set(groundRoot, 0);
  const nodeOf = new Map<string, number>();
  for (const key of Array.from(parent.keys())) {
    const root = find(key);
    let i = index.get(root);
    if (i === undefined) {
      i = count++;
      index.set(root, i);
    }
    nodeOf.set(key, i);
  }
  const N = (partId: string, pin: string) => nodeOf.get(`${partId}.${pin}`)!;
  const extra = () => count++;

  const elems: Elem[] = [];
  let unoHandle: UnoHandle | undefined;
  for (const w of doc.wires) {
    const a = keyOf(w.a);
    const b = keyOf(w.b);
    if (!a || !b) continue;
    elems.push({ k: "W", a: nodeOf.get(a)!, b: nodeOf.get(b)!, wire: w.id });
  }

  for (const p of doc.parts) {
    const id = p.id;
    switch (p.type) {
      case "breadboard":
        break;
      case "uno": {
        if (unoHandle) break; // one board per circuit
        const gnd = N(id, "gnd1");
        const source = (pin: string): Extract<Elem, { k: "V" }> => {
          const e: Extract<Elem, { k: "V" }> = { k: "V", a: N(id, pin), b: gnd, v: 0, r: 1e9, part: id, pin };
          elems.push(e);
          return e;
        };
        const drivers = new Map<string, Extract<Elem, { k: "V" }>>();
        for (let i = 0; i < 14; i++) drivers.set(`d${i}`, source(`d${i}`));
        for (let i = 0; i < 6; i++) drivers.set(`a${i}`, source(`a${i}`));
        if (rt.pressed.has(id)) elems.push({ k: "R", a: N(id, "reset"), b: gnd, r: 0.05, part: id, tag: "reset" });
        unoHandle = {
          part: p, drivers, v5: source("5v"), v33: source("3v3"), reset: source("reset"),
          n5v: N(id, "5v"), nVin: N(id, "vin"), nReset: N(id, "reset"),
        };
        break;
      }
      case "battery9v":
      case "batteryAA2":
      case "batteryAA4":
      case "coincell": {
        const s = BATTERIES[p.type];
        elems.push({ k: "V", a: N(id, "pos"), b: N(id, "neg"), v: s.volts, r: s.rint, part: id });
        break;
      }
      case "resistor":
        if (!rt.burned.has(id)) elems.push({ k: "R", a: N(id, "a"), b: N(id, "b"), r: Math.max(0.1, Number(p.props.ohms)), part: id });
        break;
      case "led": {
        if (rt.burned.has(id)) break;
        const spec = LED_COLORS[String(p.props.color)] ?? LED_COLORS.red;
        const nvt = 2 * VT;
        const rs = 4;
        const mid = extra();
        elems.push({ k: "D", a: N(id, "anode"), b: mid, is: satCurrent(spec.vf, 0.02, nvt, rs), nvt, part: id });
        elems.push({ k: "R", a: mid, b: N(id, "cathode"), r: rs, part: id, tag: "series" });
        break;
      }
      case "diode": {
        const nvt = 1.8 * VT;
        const mid = extra();
        elems.push({ k: "D", a: N(id, "anode"), b: mid, is: satCurrent(0.75, 0.1, nvt, 0.05), nvt, part: id });
        elems.push({ k: "R", a: mid, b: N(id, "cathode"), r: 0.05, part: id, tag: "series" });
        break;
      }
      case "capacitor":
        elems.push({ k: "C", a: N(id, "pos"), b: N(id, "neg"), c: Math.max(1e-12, Number(p.props.farads)), part: id });
        break;
      case "npn":
        if (!rt.burned.has(id)) elems.push({ k: "Q", c: N(id, "c"), b: N(id, "b"), e: N(id, "e"), is: 1e-14, bf: 200, br: 2, part: id });
        break;
      case "rgbled": {
        const channels: [string, number][] = [["r", 1.9], ["g", 3.0], ["b", 3.0]];
        for (const [ch, vf] of channels) {
          if (rt.burned.has(`${id}:${ch}`)) continue;
          const nvt = 2 * VT;
          const mid = extra();
          elems.push({ k: "D", a: N(id, ch), b: mid, is: satCurrent(vf, 0.02, nvt, 4), nvt, part: id, tag: ch });
          elems.push({ k: "R", a: mid, b: N(id, "k"), r: 4, part: id, tag: "series" });
        }
        break;
      }
      case "sevenseg": {
        for (const seg of ["a", "b", "c", "d", "e", "f", "g", "dp"]) {
          if (rt.burned.has(`${id}:${seg}`)) continue;
          const nvt = 2 * VT;
          const mid = extra();
          elems.push({ k: "D", a: N(id, seg), b: mid, is: satCurrent(2.0, 0.02, nvt, 4), nvt, part: id, tag: seg });
          elems.push({ k: "R", a: mid, b: N(id, "com1"), r: 4, part: id, tag: "series" });
        }
        break;
      }
      case "relay": {
        const mid = extra();
        elems.push({ k: "R", a: N(id, "coila"), b: mid, r: 70, part: id });
        elems.push({ k: "L", a: mid, b: N(id, "coilb"), l: 0.06, part: id });
        elems.push({ k: "R", a: N(id, "com"), b: N(id, rt.relays.has(id) ? "no" : "nc"), r: 0.1, part: id, tag: "contact" });
        break;
      }
      case "button":
        elems.push({ k: "R", a: N(id, "a1"), b: N(id, "a2"), r: 0.01, part: id, tag: "link" });
        elems.push({ k: "R", a: N(id, "b1"), b: N(id, "b2"), r: 0.01, part: id, tag: "link" });
        if (rt.pressed.has(id)) elems.push({ k: "R", a: N(id, "a1"), b: N(id, "b1"), r: 0.05, part: id });
        break;
      case "switch":
        elems.push({ k: "R", a: N(id, "com"), b: N(id, Number(p.props.pos) ? "p2" : "p1"), r: 0.05, part: id });
        break;
      case "pot": {
        const total = Math.max(1, Number(p.props.ohms));
        const t = Math.min(1, Math.max(0, Number(p.props.t)));
        elems.push({ k: "R", a: N(id, "a"), b: N(id, "w"), r: Math.max(1, total * t), part: id, tag: "upper" });
        elems.push({ k: "R", a: N(id, "w"), b: N(id, "b"), r: Math.max(1, total * (1 - t)), part: id, tag: "lower" });
        break;
      }
      case "ldr":
        elems.push({ k: "R", a: N(id, "a"), b: N(id, "b"), r: ldrOhms(Number(p.props.t)), part: id });
        break;
      case "buzzer":
        elems.push({ k: "R", a: N(id, "pos"), b: N(id, "neg"), r: BUZZER_OHMS, part: id });
        break;
      case "motor":
        elems.push({ k: "V", a: N(id, "pos"), b: N(id, "neg"), v: rt.emf.get(id) ?? 0, r: MOTOR_OHMS, part: id });
        break;
      case "meter":
        elems.push({
          k: "R",
          a: N(id, "v"),
          b: N(id, "com"),
          r: p.props.mode === "A" ? METER_AMP_OHMS : METER_VOLT_OHMS,
          part: id,
        });
        break;
    }
  }

  return {
    uno: unoHandle,
    nodeCount: count,
    elems,
    nodeOf,
    node(ref) {
      const key = keyOf(ref);
      return key ? nodeOf.get(key) : undefined;
    },
  };
}
