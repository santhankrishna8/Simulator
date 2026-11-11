import type { Doc, Part, PinRef, Rot, Wire } from "@/sim/model";

/** Small helpers for writing lesson benches. Ids are fixed so a lesson's states can be compared. */
export const BB = "bb";
export const hole = (x: number, y: number): PinRef => ({ part: BB, pin: `${x}_${y}` });
export const pin = (part: string, p: string): PinRef => ({ part, pin: p });

export const RED = "#d63a2f";
export const BLACK = "#1d1f22";
export const YELLOW = "#e8b10e";
export const ORANGE = "#e8742a";
export const GREEN = "#2f9e44";
export const BLUE = "#2f6fd6";

export const part = (id: string, type: Part["type"], x: number, y: number, props: Part["props"] = {}, rot: Rot = 0): Part => ({ id, type, x, y, rot, props });
export const wire = (a: PinRef, b: PinRef, color: string): Wire => ({ id: `lw-${a.part}.${a.pin}-${b.part}.${b.pin}`, a, b, color });
export const breadboard = () => part(BB, "breadboard", 0, 0);

export const doc = (parts: Part[], wires: Wire[] = []): Doc => ({ parts, wires });

/** A copy of `d` with parts and wires added. */
export function add(d: Doc, parts: Part[] = [], wires: Wire[] = []): Doc {
  return { parts: [...d.parts, ...parts], wires: [...d.wires, ...wires] };
}

/** A copy of `d` with one property changed. */
export function withProp(d: Doc, id: string, key: string, value: number | string): Doc {
  return { ...d, parts: d.parts.map((p) => (p.id === id ? { ...p, props: { ...p.props, [key]: value } } : p)) };
}

/** A copy of `d` without these parts, and without wires that end on them. */
export function without(d: Doc, ...ids: string[]): Doc {
  return { parts: d.parts.filter((p) => !ids.includes(p.id)), wires: d.wires.filter((w) => !ids.includes(w.a.part) && !ids.includes(w.b.part)) };
}
