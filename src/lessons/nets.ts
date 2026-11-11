import { BATTERIES, CATALOG, HOLE_BY_ID } from "@/sim/catalog";
import { holeMap, pinPos, type Doc, type PinRef } from "@/sim/model";
import type { PinSpec } from "./types";

/**
 * Which pins are electrically the same point, found only from how things are plugged in and
 * wired: breadboard strips, jumper wires, and nothing else. Goals use this to ask "is the LED
 * wired to the resistor?" without caring which holes were used.
 */
export interface Nets {
  /** Net id of a part's pin, or undefined if it is not in the document. */
  net(partId: string, pin: string): string | undefined;
  /** Net ids of every pin matching a spec, with the part each belongs to. */
  resolve(spec: PinSpec): { partId: string; pin: string; net: string }[];
}

export function buildNets(doc: Doc): Nets {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let p = parent.get(k);
    if (p === undefined) {
      parent.set(k, k);
      return k;
    }
    while (p !== k) {
      const gp: string = parent.get(p) ?? p;
      parent.set(k, gp);
      k = p;
      p = gp;
    }
    return k;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
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

  for (const part of doc.parts) {
    if (part.type === "breadboard") continue;
    for (const pin of CATALOG[part.type].pins) {
      const key = `${part.id}.${pin.id}`;
      find(key);
      const [x, y] = pinPos(part, pin);
      const hole = holes.get(`${x},${y}`);
      if (hole) union(key, `${hole.board.id}#${hole.strip}`);
    }
  }
  for (const w of doc.wires) {
    const a = keyOf(w.a), b = keyOf(w.b);
    if (a && b) union(a, b);
  }

  const railRoots = (sign: "+" | "-") => {
    const roots = new Set<string>();
    for (const part of doc.parts) {
      if (part.type !== "breadboard") continue;
      for (const strip of sign === "+" ? ["tp", "bp"] : ["tn", "bn"]) roots.add(find(`${part.id}#${strip}`));
    }
    return roots;
  };

  return {
    net: (partId, pin) => (byId.has(partId) ? find(`${partId}.${pin}`) : undefined),
    resolve(spec) {
      if ("rail" in spec) return [...railRoots(spec.rail)].map((net) => ({ partId: "", pin: "", net }));
      const out: { partId: string; pin: string; net: string }[] = [];
      for (const part of doc.parts) {
        const matches = spec.type === "battery" ? part.type in BATTERIES : part.type === spec.type;
        if (!matches || part.type === "breadboard") continue;
        const wanted = spec.pin === undefined ? CATALOG[part.type].pins.map((p) => p.id) : Array.isArray(spec.pin) ? spec.pin : [spec.pin];
        for (const pin of wanted) out.push({ partId: part.id, pin, net: find(`${part.id}.${pin}`) });
      }
      return out;
    },
  };
}
