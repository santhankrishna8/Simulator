import { CATALOG, HOLE_BY_ID, type PartType } from "@/sim/catalog";
import type { Doc, Part, Rot, Wire } from "@/sim/model";

export const LIMITS = { parts: 300, wires: 800, code: 60_000, coord: 5000 };

export interface Project {
  doc: Doc;
  code: string;
}

export type Sanitized = { ok: true; project: Project; dropped: string[] } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ID = /^[A-Za-z0-9_.:#-]{1,80}$/;
/** Names that must never be used as keys, whatever the pattern allows. */
const RESERVED = new Set(["__proto__", "prototype", "constructor"]);
const goodId = (v: unknown): v is string => typeof v === "string" && ID.test(v) && !RESERVED.has(v);
const COLOR = /^#[0-9a-fA-F]{6}$/;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Keep a property only if it is the kind of value the part expects, and within sensible bounds. */
function cleanProps(type: PartType, raw: unknown): Record<string, number | string> {
  const def = CATALOG[type];
  const given = isObj(raw) ? raw : {};
  const out: Record<string, number | string> = { ...def.defaults };
  for (const prop of def.props) {
    const v = given[prop.key];
    if (prop.kind === "ohms" || prop.kind === "farads") {
      const n = num(v);
      const [lo, hi] = prop.kind === "ohms" ? [0.1, 1e9] : [1e-12, 1];
      if (n !== null && n >= lo && n <= hi) out[prop.key] = n;
    } else if (prop.kind === "range") {
      const n = num(v);
      if (n !== null && n >= (prop.min ?? 0) && n <= (prop.max ?? 1)) out[prop.key] = n;
    } else if (typeof v === "string" && prop.options?.some((o) => o.value === v)) out[prop.key] = v;
  }
  // Properties that are state rather than settings (a switch's position).
  for (const [key, fallback] of Object.entries(def.defaults)) {
    if (def.props.some((p) => p.key === key)) continue;
    const v = given[key];
    if (typeof fallback === "number" && num(v) !== null && Math.abs(num(v)!) < 1e6) out[key] = num(v)!;
  }
  return out;
}

function pinExists(parts: Map<string, Part>, ref: unknown): { part: string; pin: string } | null {
  if (!isObj(ref) || typeof ref.part !== "string" || typeof ref.pin !== "string") return null;
  const part = parts.get(ref.part);
  if (!part) return null;
  const ok = part.type === "breadboard" ? HOLE_BY_ID.has(ref.pin) : CATALOG[part.type].pins.some((p) => p.id === ref.pin);
  return ok ? { part: ref.part, pin: ref.pin } : null;
}

/**
 * Turn anything that was in a link or file into a bench we are willing to open: only known parts,
 * known pins, values in range, bounded sizes. Anything else is dropped (and counted), never trusted.
 */
export function sanitizeProject(input: unknown): Sanitized {
  if (!isObj(input) || !isObj(input.doc)) return { ok: false, error: "That does not look like a project from this simulator." };
  const rawParts = input.doc.parts;
  const rawWires = input.doc.wires;
  if (!Array.isArray(rawParts) || !Array.isArray(rawWires)) return { ok: false, error: "That does not look like a project from this simulator." };
  if (rawParts.length > LIMITS.parts || rawWires.length > LIMITS.wires) return { ok: false, error: "That project is far larger than the simulator supports." };

  const dropped: string[] = [];
  const parts = new Map<string, Part>();
  for (const p of rawParts) {
    if (!isObj(p) || !goodId(p.id) || typeof p.type !== "string" || !Object.hasOwn(CATALOG, p.type) || parts.has(p.id)) {
      dropped.push("a part that is not recognised");
      continue;
    }
    const type = p.type as PartType;
    const x = num(p.x), y = num(p.y);
    if (x === null || y === null || Math.abs(x) > LIMITS.coord || Math.abs(y) > LIMITS.coord) {
      dropped.push(`${CATALOG[type].name} with a bad position`);
      continue;
    }
    const rot = (Number.isInteger(p.rot) && (p.rot as number) >= 0 && (p.rot as number) <= 3 ? p.rot : 0) as Rot;
    parts.set(p.id, { id: p.id, type, x: Math.round(x), y: Math.round(y), rot, props: cleanProps(type, p.props) });
  }

  const wires: Wire[] = [];
  const wireIds = new Set<string>();
  for (const w of rawWires) {
    const a = isObj(w) ? pinExists(parts, w.a) : null;
    const b = isObj(w) ? pinExists(parts, w.b) : null;
    if (!isObj(w) || !a || !b || !goodId(w.id) || wireIds.has(w.id)) {
      dropped.push("a wire that goes nowhere");
      continue;
    }
    wireIds.add(w.id);
    wires.push({ id: w.id, a, b, color: typeof w.color === "string" && COLOR.test(w.color) ? w.color : "#1d1f22" });
  }

  const code = typeof input.code === "string" ? input.code : "";
  if (code.length > LIMITS.code) return { ok: false, error: "The sketch in that project is too long." };
  if (!parts.size) return { ok: false, error: "That project is empty." };
  return { ok: true, project: { doc: { parts: [...parts.values()], wires }, code }, dropped };
}
