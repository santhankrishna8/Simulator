import { BATTERIES, CATALOG, formatSI } from "@/sim/catalog";
import type { Snapshot } from "@/sim/engine";
import type { Doc } from "@/sim/model";
import { buildNets } from "@/lessons/nets";
import type { Build } from "@/store";

/** What the tutor is told about the learner's current lesson step. */
export interface LessonContext {
  lesson: string;
  step: number;
  steps: number;
  title: string;
  body: string;
  goals: { label: string; done: boolean }[];
}

export interface BenchInput {
  doc: Doc;
  snap: Snapshot | null;
  running: boolean;
  code: string;
  build: Build;
  serial: string;
  lesson?: LessonContext | null;
}

/** The limits keep a prompt small and the cost of one question predictable. */
export const LIMITS = { code: 6000, serial: 700, section: 2400 };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n… (cut)` : s);

/** "LED 1", "Resistor 2": readable names, numbered only when a type appears more than once. */
function labelsFor(doc: Doc): Map<string, string> {
  const counts = new Map<string, number>();
  for (const p of doc.parts) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const p of doc.parts) {
    const n = (seen.get(p.type) ?? 0) + 1;
    seen.set(p.type, n);
    labels.set(p.id, (counts.get(p.type) ?? 0) > 1 ? `${CATALOG[p.type].name} ${n}` : CATALOG[p.type].name);
  }
  return labels;
}

function describeProps(type: string, props: Record<string, number | string>): string {
  const t = type as keyof typeof CATALOG;
  const def = CATALOG[t];
  if (!def) return "";
  const out: string[] = [];
  for (const prop of def.props) {
    const v = props[prop.key];
    if (v === undefined) continue;
    if (prop.kind === "ohms") out.push(formatSI(Number(v), "Ω"));
    else if (prop.kind === "farads") out.push(formatSI(Number(v), "F"));
    else if (prop.kind === "range") out.push(`${prop.label.toLowerCase()} ${prop.unit ? `${v} ${prop.unit}` : Number(v).toFixed(2)}`);
    else out.push(`${prop.label.toLowerCase()} ${prop.options?.find((o) => o.value === String(v))?.label ?? v}`);
  }
  return out.join(", ");
}

/**
 * A plain-text account of the bench for the tutor: what is on it, what is joined to what,
 * what the simulation shows, and (in a lesson) where the learner is. Built only from the circuit
 * and the lesson; nothing about the person.
 */
export function describeBench(input: BenchInput): string {
  const { doc, snap, running, code, build, serial, lesson } = input;
  const out: string[] = [];
  const labels = labelsFor(doc);
  const name = (id: string) => labels.get(id) ?? id;

  if (lesson) {
    out.push(`LESSON: "${lesson.lesson}", step ${lesson.step} of ${lesson.steps}: ${lesson.title}`);
    out.push(`What the step asks: ${clip(lesson.body.replace(/\s+/g, " "), 900)}`);
    out.push("Step goals:");
    for (const g of lesson.goals) out.push(`  [${g.done ? "done" : "not yet"}] ${g.label}`);
    out.push("");
  }

  const parts = doc.parts.filter((p) => p.type !== "breadboard");
  const hasBoard = doc.parts.some((p) => p.type === "breadboard");
  out.push(`PARTS${hasBoard ? " (a breadboard is on the bench)" : ""}:`);
  if (!parts.length) out.push("  (nothing on the bench yet)");
  for (const p of parts) {
    const extra = describeProps(p.type, p.props);
    out.push(`  - ${name(p.id)}${extra ? `: ${extra}` : ""}`);
  }

  // Connections, found from breadboard strips and wires.
  const nets = buildNets(doc);
  const groups = nets.groups();
  const unoPin = (partId: string, pin: string) => doc.parts.find((p) => p.id === partId)?.type === "uno" && /^(d\d+|a\d)$/.test(pin);
  const pinName = (partId: string, pin: string) => `${name(partId)} ${CATALOG[doc.parts.find((p) => p.id === partId)!.type].pins.find((x) => x.id === pin)?.label ?? pin}`;
  const joined = groups.filter((g) => g.pins.filter((p) => !(unoPin(p.partId, p.pin) && g.pins.length === 1)).length >= 2 || (g.rail && g.pins.length >= 1));
  out.push("");
  out.push("CONNECTIONS (pins that are electrically the same point):");
  if (!joined.length) out.push("  (no part is connected to another)");
  for (const g of joined.slice(0, 40)) {
    const pins = g.pins.map((p) => pinName(p.partId, p.pin));
    out.push(`  - ${g.rail ? `[${g.rail === "+" ? "+" : "−"} power rail] ` : ""}${pins.join(" = ")}`);
  }
  // Pins left hanging on ordinary parts are the most common beginner mistake.
  const loose: string[] = [];
  for (const g of groups) {
    if (g.rail || g.pins.length !== 1) continue;
    const { partId, pin } = g.pins[0];
    const part = doc.parts.find((p) => p.id === partId)!;
    if (part.type === "uno" || part.type === "breadboard") continue;
    loose.push(pinName(partId, pin));
  }
  if (loose.length) out.push(`  NOT CONNECTED to anything: ${loose.slice(0, 20).join("; ")}`);

  // Live readings
  out.push("");
  if (!snap) out.push(running ? "SIMULATION: starting…" : "SIMULATION: not running (nothing is measured yet).");
  else {
    out.push(`SIMULATION: ${running ? "running" : "paused"}, ${snap.time.toFixed(1)} s in.`);
    for (const p of parts) {
      const live = snap.parts[p.id];
      if (!live) continue;
      const bits: string[] = [];
      if (p.type in BATTERIES) bits.push(`${formatSI(live.v, "V")} at the terminals, supplying ${formatSI(Math.max(0, live.i), "A")}`);
      else if (live.uno) {
        const u = live.uno;
        bits.push(!u.powered ? "no power" : u.inReset ? "held in reset" : u.running ? "running a sketch" : u.hasProgram ? "idle" : "powered, no sketch uploaded");
        const pins = Object.entries(u.pins).filter(([, x]) => x.mode !== "off").map(([id, x]) => `${id.toUpperCase()} ${x.mode} ${formatSI(x.v, "V")}`);
        if (pins.length) bits.push(`pins in use: ${pins.join(", ")}`);
      } else if (p.type === "meter") bits.push(`reads ${live.reading ?? "–"}`);
      else if (live.extra) bits.push(Object.entries(live.extra).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join("; "));
      else if (live.burned) bits.push("BURNT OUT");
      else bits.push(`${formatSI(live.v, "V")} across, ${formatSI(Math.abs(live.i), "A")} through`);
      if (live.glow !== undefined) bits.push(live.glow > 0.05 ? `lit (${Math.round(live.glow * 100)}%)` : "dark");
      if (live.burned && !bits.includes("BURNT OUT")) bits.push("BURNT OUT");
      out.push(`  - ${name(p.id)}: ${bits.join("; ")}`);
    }
    if (snap.warnings.length) {
      out.push("WARNINGS the simulator is showing:");
      for (const w of snap.warnings.slice(0, 8)) out.push(`  - ${w.title}: ${w.why}`);
    } else out.push("WARNINGS: none");
  }

  // Sketch
  const hasUno = doc.parts.some((p) => p.type === "uno");
  if (hasUno && code.trim()) {
    out.push("");
    out.push("SKETCH in the editor:");
    out.push("```cpp");
    out.push(clip(code, LIMITS.code));
    out.push("```");
    out.push(`Build: ${build.status === "ok" ? "compiled and uploaded" : build.status === "error" ? "FAILED" : build.status === "building" ? "compiling" : "not uploaded yet"}`);
    for (const d of build.diagnostics.slice(0, 5)) out.push(`  - line ${d.line}: ${d.message}`);
    if (build.message) out.push(`  - ${build.message}`);
    if (serial.trim()) out.push(`Serial monitor (latest):\n${clip(serial.slice(-LIMITS.serial), LIMITS.serial)}`);
  }
  return clip(out.join("\n"), 9000 + LIMITS.code);
}
