"use client";

import { create } from "zustand";
import { CATALOG, HOLES, type PartType } from "./sim/catalog";
import { Engine, type Snapshot } from "./sim/engine";
import { EXAMPLES } from "./sim/examples";
import {
  collides, holeMap, occupiedHoles, partsOnBoard, refPos, WIRE_COLORS,
  type Doc, type Part, type PinRef, type Rot,
} from "./sim/model";

export const engine = new Engine();

export type Selection = { kind: "part" | "wire"; id: string } | null;

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

  set: (partial) => set(partial),

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
    engine.reset();
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

  setRunning: (running) => set({ running }),

  resetSim: () => {
    engine.reset();
    set({ running: false, snapshot: null, flow: {} });
  },

  replacePart: (id) => engine.replace(id),
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
