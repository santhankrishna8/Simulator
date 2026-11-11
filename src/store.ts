"use client";

import { create } from "zustand";
import { buzz } from "./audio";
import { CATALOG, HOLES, type PartType } from "./sim/catalog";
import { sim } from "./sim/client";
import type { Snapshot } from "./sim/engine";
import { EXAMPLES, type Example } from "./sim/examples";
import {
  collides, holeMap, occupiedHoles, partsOnBoard, refPos, WIRE_COLORS,
  type Doc, type Part, type PinRef, type Rot,
} from "./sim/model";

export type Selection = { kind: "part" | "wire"; id: string } | null;

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  message: string;
}

export interface Build {
  status: "idle" | "building" | "ok" | "error";
  diagnostics: Diagnostic[];
  /** A message that is not tied to a line, such as "compile service unreachable". */
  message?: string;
  flash?: number;
  ram?: number;
  flashMax?: number;
  ramMax?: number;
  /** The program came from the bundled examples rather than the compiler. */
  bundled?: boolean;
}

const SERIAL_LIMIT = 30_000;

interface State {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  selection: Selection;
  running: boolean;
  snapshot: Snapshot | null;
  /** Animation phase per wire for the current-flow overlay. */
  flow: Record<string, number>;
  pressed: Set<string>;
  showFlow: boolean;
  sound: boolean;
  /** First end of a wire being drawn. */
  wiring: PinRef | null;
  /** Part type being dragged out of the drawer. */
  placing: PartType | null;
  toast: { text: string; key: number } | null;
  /** Bumped to ask the canvas to frame the whole circuit. */
  fitTick: number;

  /* ----- sketch ----- */
  code: string;
  /** Set while the code is an unchanged example, so its bundled program can be used. */
  exampleId: string | null;
  /** The source that is currently flashed on the board; differs from `code` after edits. */
  builtCode: string | null;
  hex: string | null;
  build: Build;
  serial: string;
  /** Simulated seconds per real second, from the worker (1 is real time). */
  speed: number;
  dockOpen: boolean;
  dockTab: "code" | "serial";
  dockH: number;

  setCode(code: string): void;
  upload(): Promise<void>;
  toggleRun(): Promise<void>;
  loadExample(example: Example): void;
  restore(): void;
  applyFrame(frame: { snapshot: Snapshot; serial: string; speed: number }): void;
  sendSerial(text: string): void;
  clearSerial(): void;

  commit(doc: Doc): void;
  undo(): void;
  redo(): void;
  load(doc: Doc): void;
  select(sel: Selection): void;
  addPart(type: PartType, x: number, y: number): string | null;
  /** Move a part (and anything riding on it) to a new position; false if blocked. */
  movePart(id: string, x: number, y: number, from: Doc): boolean;
  rotateSelected(): void;
  deleteSelected(): void;
  setProp(id: string, key: string, value: number | string, record?: boolean): void;
  setWireColor(id: string, color: string): void;
  pinClicked(ref: PinRef): void;
  cancelWire(): void;
  setPressed(id: string, down: boolean): void;
  setRunning(on: boolean): void;
  resetSim(): void;
  replacePart(id: string): void;
  say(text: string): void;
  set(partial: Partial<State>): void;
}

const STORAGE_KEY = "simulator.doc.v1";
const SKETCH_KEY = "simulator.sketch.v1";
const DEFAULT_CODE = `void setup() {\n  // runs once\n}\n\nvoid loop() {\n  // runs forever\n}\n`;
let idCounter = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;

function initialDoc(): Doc {
  return structuredClone(EXAMPLES[0].doc);
}

export function loadSaved(): Doc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw) as Doc;
    if (!Array.isArray(doc.parts) || !Array.isArray(doc.wires)) return null;
    doc.parts = doc.parts.filter((p) => p.type in CATALOG);
    return doc;
  } catch {
    return null;
  }
}

function saveSketch(s: { code: string; exampleId: string | null; builtCode: string | null; hex: string | null; build?: Build }) {
  try {
    localStorage.setItem(SKETCH_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

function save(doc: Doc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    /* storage unavailable; the circuit still works for this visit */
  }
}

/**
 * A wire end must land in a free hole. If the clicked spot is taken (or is a
 * part lead already seated in the board), use the nearest free hole on the
 * same strip, which is electrically the same point.
 */
function resolveEnd(doc: Doc, ref: PinRef): PinRef | null {
  const pos = refPos(doc, ref);
  if (!pos) return null;
  const holes = holeMap(doc);
  const here = holes.get(`${pos[0]},${pos[1]}`);
  if (!here) return ref; // a free-standing part pin
  const taken = occupiedHoles(doc);
  if (!taken.has(`${pos[0]},${pos[1]}`)) return { part: here.board.id, pin: here.holeId };
  const board = here.board;
  const options = HOLES.filter((h) => h.strip === here.strip && !taken.has(`${board.x + h.x},${board.y + h.y}`));
  if (!options.length) return null;
  options.sort(
    (a, b) =>
      Math.hypot(board.x + a.x - pos[0], board.y + a.y - pos[1]) - Math.hypot(board.x + b.x - pos[0], board.y + b.y - pos[1]),
  );
  return { part: board.id, pin: options[0].id };
}

const EXAMPLE_SKETCHES = new Map(EXAMPLES.filter((e) => e.sketch).map((e) => [e.id, e.sketch!]));

/** The bundled program for an example, if the code is still exactly the example's. */
async function bundledHex(id: string, code: string): Promise<string | null> {
  if (EXAMPLE_SKETCHES.get(id) !== code) return null;
  const { PREBUILT } = await import("./sim/prebuilt.generated");
  return PREBUILT[id] ?? null;
}

export const useStore = create<State>((set, get) => ({
  doc: initialDoc(),
  past: [],
  future: [],
  selection: null,
  running: false,
  snapshot: null,
  flow: {},
  pressed: new Set(),
  showFlow: true,
  sound: true,
  wiring: null,
  placing: null,
  toast: null,
  fitTick: 0,

  code: DEFAULT_CODE,
  exampleId: null,
  builtCode: null,
  hex: null,
  build: { status: "idle", diagnostics: [] },
  serial: "",
  speed: 1,
  dockOpen: false,
  dockTab: "code",
  dockH: 320,

  set: (partial) => set(partial),

  setCode: (code) => {
    const { exampleId, builtCode, hex, build } = get();
    const next = { code, exampleId: exampleId && code === EXAMPLE_SKETCHES.get(exampleId) ? exampleId : null };
    set(next);
    saveSketch({ ...next, builtCode, hex, build: build.status === "ok" ? build : undefined });
  },

  upload: async () => {
    const { code, exampleId, build } = get();
    if (build.status === "building") return;
    set({ build: { status: "building", diagnostics: [] }, dockOpen: true, dockTab: "code" });

    let data: unknown = null;
    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sketch: code }),
      });
      data = await res.json().catch(() => null);
    } catch {
      data = null;
    }
    const reply = data as
      | { ok: true; hex: string; flash: number; ram: number; flashMax: number; ramMax: number }
      | { ok: false; diagnostics?: Diagnostic[]; message?: string }
      | null;

    const finish = (hex: string, build: Build) => {
      const doc = get().doc;
      sim.send({ t: "run", on: false });
      sim.send({ t: "reset" });
      sim.send({ t: "doc", doc });
      sim.send({ t: "program", hex });
      set({ hex, builtCode: code, serial: "", build, flow: {}, snapshot: null });
      saveSketch({ code, exampleId, builtCode: code, hex, build });
      get().setRunning(true);
    };

    if (reply?.ok) {
      finish(reply.hex, { status: "ok", diagnostics: [], flash: reply.flash, ram: reply.ram, flashMax: reply.flashMax, ramMax: reply.ramMax });
      return;
    }
    if (reply && !reply.ok && reply.diagnostics) {
      set({ build: { status: "error", diagnostics: reply.diagnostics } });
      return;
    }
    // No compiler reachable: an unchanged example still runs from its bundled program.
    const bundled = exampleId ? await bundledHex(exampleId, code) : null;
    if (bundled) {
      finish(bundled, { status: "ok", diagnostics: [], bundled: true });
      return;
    }
    set({
      build: {
        status: "error",
        diagnostics: [],
        message: (reply && !reply.ok && reply.message) || "Could not reach the compiler. Check your connection, or run an unchanged example, which works without it.",
      },
    });
  },

  toggleRun: async () => {
    const st = get();
    if (st.running) {
      get().setRunning(false);
      buzz(false);
      return;
    }
    const hasBoard = st.doc.parts.some((p) => p.type === "uno");
    if (hasBoard && st.builtCode !== st.code) {
      await get().upload(); // starts the simulation when it succeeds
      return;
    }
    get().setRunning(true);
  },

  loadExample: (example) => {
    const { doc, sketch } = example;
    sim.send({ t: "run", on: false });
    sim.send({ t: "reset" });
    sim.send({ t: "program", hex: null });
    get().commit(structuredClone(doc));
    set({
      selection: null, wiring: null, snapshot: null, flow: {}, pressed: new Set(), running: false, serial: "",
      fitTick: get().fitTick + 1, hex: null, builtCode: null, build: { status: "idle", diagnostics: [] },
      ...(sketch ? { code: sketch, exampleId: example.id, dockOpen: true, dockTab: "code" as const } : { exampleId: null }),
    });
    if (sketch) {
      void bundledHex(example.id, sketch).then((hex) => {
        if (!hex || get().exampleId !== example.id) return;
        sim.send({ t: "program", hex });
        const build: Build = { status: "ok", diagnostics: [], bundled: true };
        set({ hex, builtCode: sketch, build });
        saveSketch({ code: sketch, exampleId: example.id, builtCode: sketch, hex, build });
      });
    } else saveSketch({ code: get().code, exampleId: null, builtCode: null, hex: null });
  },

  restore: () => {
    const saved = loadSaved();
    if (saved) set((s) => ({ doc: saved, fitTick: s.fitTick + 1 }));
    try {
      const raw = localStorage.getItem(SKETCH_KEY);
      if (raw) {
        const k = JSON.parse(raw) as { code?: string; exampleId?: string | null; builtCode?: string | null; hex?: string | null; build?: Build };
        if (typeof k.code === "string") {
          set({
            code: k.code, exampleId: k.exampleId ?? null, builtCode: k.builtCode ?? null, hex: k.hex ?? null,
            ...(k.hex && k.build?.status === "ok" ? { build: k.build } : {}),
          });
          if (k.hex && k.builtCode) sim.send({ t: "program", hex: k.hex });
        }
      }
    } catch {
      /* ignore damaged saved data */
    }
    sim.send({ t: "doc", doc: get().doc });
  },

  applyFrame: ({ snapshot, serial, speed }) => {
    const st = get();
    const prev = st.snapshot?.time ?? 0;
    const dt = snapshot.time > prev ? Math.min(0.1, snapshot.time - prev) : 0;
    const flow = { ...st.flow };
    for (const [id, amps] of Object.entries(snapshot.wires)) {
      const mag = Math.abs(amps);
      if (mag < 1e-6) continue;
      const rate = 10 + 80 * Math.sqrt(Math.min(1, mag / 0.1));
      flow[id] = ((flow[id] ?? 0) + Math.sign(amps) * rate * dt) % 900;
    }
    set({
      snapshot, flow, speed,
      ...(serial ? { serial: (st.serial + serial).slice(-SERIAL_LIMIT) } : {}),
    });
    buzz(st.sound && Object.values(snapshot.parts).some((p) => p.sounding));
  },

  sendSerial: (text) => sim.send({ t: "serialIn", text }),
  clearSerial: () => set({ serial: "" }),

  say: (text) => set({ toast: { text, key: Date.now() } }),

  commit: (doc) => {
    const { doc: prev, past } = get();
    save(doc);
    set({ doc, past: [...past.slice(-80), prev], future: [] });
  },

  undo: () => {
    const { past, future, doc } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    save(prev);
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], selection: null, wiring: null });
  },

  redo: () => {
    const { past, future, doc } = get();
    if (!future.length) return;
    save(future[0]);
    set({ doc: future[0], past: [...past, doc], future: future.slice(1), selection: null, wiring: null });
  },

  load: (doc) => {
    sim.send({ t: "reset" });
    get().commit(structuredClone(doc));
    set({ selection: null, wiring: null, snapshot: null, flow: {}, pressed: new Set(), fitTick: get().fitTick + 1 });
  },

  select: (selection) => set({ selection }),

  addPart: (type, x, y) => {
    const { doc } = get();
    const part: Part = { id: newId("p"), type, x: Math.round(x), y: Math.round(y), rot: 0, props: { ...CATALOG[type].defaults } };
    if (collides(doc, part)) {
      get().say("Those holes are already taken. Try a free spot.");
      return null;
    }
    get().commit({ ...doc, parts: [...doc.parts, part] });
    set({ selection: { kind: "part", id: part.id } });
    return part.id;
  },

  movePart: (id, x, y, from) => {
    const part = from.parts.find((p) => p.id === id);
    if (!part) return false;
    const dx = Math.round(x) - part.x;
    const dy = Math.round(y) - part.y;
    if (!dx && !dy) {
      set({ doc: from });
      return true;
    }
    // A breadboard carries the parts plugged into it.
    const riders = new Set(part.type === "breadboard" ? partsOnBoard(from, id) : []);
    riders.add(id);
    const parts = from.parts.map((p) => (riders.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p));
    const next = { ...from, parts };
    const moved = parts.filter((p) => riders.has(p.id));
    if (moved.some((p) => collides(next, p))) return false;
    set({ doc: from });
    get().commit(next);
    return true;
  },

  rotateSelected: () => {
    const { selection, doc } = get();
    if (selection?.kind !== "part") return;
    const part = doc.parts.find((p) => p.id === selection.id);
    if (!part || part.type === "breadboard") return;
    const rotated = { ...part, rot: ((part.rot + 1) % 4) as Rot };
    const next = { ...doc, parts: doc.parts.map((p) => (p.id === part.id ? rotated : p)) };
    if (collides(next, rotated)) {
      get().say("No room to turn it here. Move it first.");
      return;
    }
    get().commit(next);
  },

  deleteSelected: () => {
    const { selection, doc } = get();
    if (!selection) return;
    if (selection.kind === "wire") {
      get().commit({ ...doc, wires: doc.wires.filter((w) => w.id !== selection.id) });
    } else {
      get().commit({
        parts: doc.parts.filter((p) => p.id !== selection.id),
        wires: doc.wires.filter((w) => w.a.part !== selection.id && w.b.part !== selection.id),
      });
    }
    set({ selection: null });
  },

  setProp: (id, key, value, record = true) => {
    const { doc } = get();
    const next = { ...doc, parts: doc.parts.map((p) => (p.id === id ? { ...p, props: { ...p.props, [key]: value } } : p)) };
    if (record) get().commit(next);
    else {
      save(next);
      set({ doc: next });
    }
  },

  setWireColor: (id, color) => {
    const { doc } = get();
    get().commit({ ...doc, wires: doc.wires.map((w) => (w.id === id ? { ...w, color } : w)) });
  },

  pinClicked: (ref) => {
    const { wiring, doc } = get();
    if (!wiring) {
      const start = resolveEnd(doc, ref);
      if (!start) return get().say("Every hole in that row is full.");
      set({ wiring: start, selection: null });
      return;
    }
    // Reserve the first end so the second cannot resolve onto the same hole.
    const probe: Doc = { ...doc, wires: [...doc.wires, { id: "__probe", a: wiring, b: wiring, color: "" }] };
    const end = resolveEnd(probe, ref);
    if (!end) return get().say("Every hole in that row is full.");
    if (end.part === wiring.part && end.pin === wiring.pin) {
      set({ wiring: null });
      return;
    }
    const color = pickColor(doc, wiring, end);
    const id = newId("w");
    get().commit({ ...doc, wires: [...doc.wires, { id, a: wiring, b: end, color }] });
    set({ wiring: null, selection: { kind: "wire", id } });
  },

  cancelWire: () => set({ wiring: null }),

  setPressed: (id, down) => {
    const pressed = new Set(get().pressed);
    if (down) pressed.add(id);
    else pressed.delete(id);
    set({ pressed });
  },

  setRunning: (running) => {
    sim.send({ t: "run", on: running });
    set({ running });
  },

  resetSim: () => {
    sim.send({ t: "run", on: false });
    sim.send({ t: "reset" });
    set({ running: false, snapshot: null, flow: {}, serial: "" });
  },

  replacePart: (id) => sim.send({ t: "replace", id }),
}));

/** Red for anything touching +, black for −, otherwise rotate through the rest. */
function pickColor(doc: Doc, a: PinRef, b: PinRef): string {
  const kind = (ref: PinRef): "pos" | "neg" | null => {
    const part = doc.parts.find((p) => p.id === ref.part);
    if (!part) return null;
    if (part.type === "breadboard") {
      const hole = HOLES.find((h) => h.id === ref.pin);
      if (hole?.strip.endsWith("p")) return "pos";
      if (hole?.strip.endsWith("n")) return "neg";
      return null;
    }
    if (ref.pin === "pos") return "pos";
    if (ref.pin === "neg" || ref.pin === "com") return "neg";
    return null;
  };
  const ka = kind(a);
  const kb = kind(b);
  if (ka === "pos" || kb === "pos") return WIRE_COLORS[0];
  if (ka === "neg" || kb === "neg") return WIRE_COLORS[1];
  return WIRE_COLORS[2 + (doc.wires.length % 5)];
}
