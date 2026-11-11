import { BATTERIES, CATALOG } from "@/sim/catalog";
import { holeMap, pinPos } from "@/sim/model";
import type { PartType } from "@/sim/catalog";
import type { Ctx, Frame, Goal, PinSpec } from "./types";

/** At least `min` parts of this type are on the bench. */
export const placed = (type: PartType, label: string, min = 1): Goal => ({
  label,
  test: (c) => c.doc.parts.filter((p) => p.type === type).length >= min,
});

/** A part of this type has every lead pushed into a breadboard hole. */
export const seated = (type: PartType | "battery", label: string): Goal => ({
  label,
  test: (c) => {
    const holes = holeMap(c.doc);
    return c.doc.parts.some(
      (p) =>
        (type === "battery" ? p.type in BATTERIES : p.type === type) &&
        CATALOG[p.type].pins.every((pin) => {
          const [x, y] = pinPos(p, pin);
          return holes.has(`${x},${y}`);
        }),
    );
  },
});

/** Some pin matching `a` is on the same net as some pin matching `b`, on a different part. */
export function connected(c: Ctx, a: PinSpec, b: PinSpec): boolean {
  const left = c.nets.resolve(a);
  const right = c.nets.resolve(b);
  return left.some((x) => right.some((y) => x.net === y.net && (x.partId !== y.partId || x.partId === "")));
}

export const joined = (label: string, a: PinSpec, b: PinSpec): Goal => ({ label, test: (c) => connected(c, a, b) });

/** A part of this type has a property that satisfies `ok`. */
export const prop = (type: PartType, key: string, label: string, ok: (v: number | string) => boolean): Goal => ({
  label,
  test: (c) => c.doc.parts.some((p) => p.type === type && ok(p.props[key])),
});

/** Any custom test on the circuit's shape. */
export const shape = (label: string, test: (c: Ctx) => boolean): Goal => ({ label, test });

/** Something seen while the simulation runs; once seen it stays ticked. */
export const seen = (label: string, test: (c: Ctx) => boolean): Goal => ({ label, test, latch: true });

export const running: Goal = { label: "Press Run", test: (c) => c.running };

/** The program on the board is the program in the editor. */
export const built: Goal = { label: "Upload the sketch", test: (c) => c.build.status === "ok" && c.builtCode === c.code };

/** The sketch with comments removed, so a hint in a comment cannot satisfy a goal. */
export const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export const codeHas = (label: string, re: RegExp): Goal => ({ label, test: (c) => re.test(stripComments(c.code)) });

export const serialHas = (label: string, re: RegExp): Goal => ({ label, latch: true, test: (c) => re.test(c.serial) });

/** No part is overloaded, burnt or shorted. */
export const noTrouble: Goal = {
  label: "Nothing is overloaded or burnt",
  test: (c) => !!c.snap && !c.snap.warnings.some((w) => w.level === "danger"),
};

/* ---------- helpers for writing goals ---------- */

export const partsOf = (c: Ctx, type: PartType) => c.doc.parts.filter((p) => p.type === type);

/** Times a yes/no signal changed in a run of frames. */
export function transitions(frames: Frame[], on: (f: Frame) => boolean): number {
  let n = 0;
  for (let i = 1; i < frames.length; i++) if (on(frames[i]) !== on(frames[i - 1])) n++;
  return n;
}

/** Is any part of this type glowing at least `min` in this frame? */
export const anyLit = (f: Frame, doc: Ctx["doc"], type: PartType, min = 0.3) =>
  doc.parts.some((p) => p.type === type && (f.parts[p.id]?.glow ?? 0) >= min);

/**
 * The pin of a resistor that is NOT on the same net as `other`: the "free end" of a resistor
 * whose other end is already joined to something.
 */
export function freeEndNet(c: Ctx, resistorId: string, other: PinSpec): string | undefined {
  const near = new Set(c.nets.resolve(other).map((x) => x.net));
  for (const pin of ["a", "b"]) {
    const n = c.nets.net(resistorId, pin);
    if (n !== undefined && !near.has(n)) return n;
  }
  return undefined;
}

/** A resistor has one end on `near` and its other end, on a different net, on `far`. */
export function seriesResistor(c: Ctx, near: PinSpec, far: PinSpec): boolean {
  const nearNets = new Set(c.nets.resolve(near).map((x) => x.net));
  const farNets = new Set(c.nets.resolve(far).map((x) => x.net));
  return partsOf(c, "resistor").some((r) => {
    const a = c.nets.net(r.id, "a"), b = c.nets.net(r.id, "b");
    if (a === undefined || b === undefined) return false;
    return (nearNets.has(a) && farNets.has(b) && !nearNets.has(b)) || (nearNets.has(b) && farNets.has(a) && !nearNets.has(a));
  });
}

/** Highest of a list of numbers found in the serial output after a label. */
export function serialNumbers(serial: string, label: RegExp): number[] {
  return [...serial.matchAll(new RegExp(label.source + "\\s*(-?\\d+(?:\\.\\d+)?)", "g"))].map((m) => Number(m[1]));
}
