/**
 * Plays a lesson step the way a person would, for tests: builds the bench, runs the simulation,
 * carries out the step's demo (hold the button, turn the knob) and returns what the goals see.
 * Not used by the app itself.
 */
import { Engine } from "@/sim/engine";
import type { Doc } from "@/sim/model";
import { PREBUILT } from "@/sim/prebuilt.generated";
import { SKETCHES } from "@/sim/sketches.mjs";
import { evaluateStep, type StepResult } from "./evaluate";
import { buildNets } from "./nets";
import type { Ctx, Demo, Frame, LessonState, Step } from "./types";

/** The compiled program for a sketch we have bundled, by exact source match. */
export function bundledHexFor(code: string): string | null {
  const id = Object.keys(SKETCHES).find((k) => SKETCHES[k as keyof typeof SKETCHES] === code);
  return id ? (PREBUILT[id] ?? null) : null;
}

export interface Played {
  ctx: Ctx;
  result: StepResult | null;
}

/** Play a step on a bench and report which goals ended up ticked. */
export function play(state: LessonState, step: Step, opts: { arrived: boolean }): Played {
  const ctx = contextFor(state, step, opts, (c, latched) => evaluateStep(step, c, latched));
  return { ctx: ctx.ctx, result: evaluateStep(step, ctx.ctx, ctx.latched) };
}

function contextFor(
  state: LessonState,
  step: Step | null,
  opts: { arrived: boolean },
  onFrame?: (c: Ctx, latched: boolean[]) => StepResult,
): { ctx: Ctx; latched: boolean[] } {
  const doc: Doc = structuredClone(state.doc);
  const base: Ctx = {
    doc, nets: buildNets(doc), snap: null, code: state.code,
    build: { status: "idle", diagnostics: [] }, builtCode: null, serial: "", running: false, trace: [],
  };
  let latched: boolean[] = [];
  if (opts.arrived || !step) return { ctx: base, latched };

  const hex = bundledHexFor(state.code);
  const engine = new Engine();
  if (hex) engine.loadProgram(hex);
  let pressed = new Set<string>();
  let serial = "";
  const trace: Frame[] = [];
  let snap = null as Ctx["snap"];
  const live: Ctx = { ...base, build: hex ? { status: "ok", diagnostics: [] } : base.build, builtCode: hex ? state.code : null, running: !!step.demo, trace };

  const advance = (seconds: number) => {
    for (let k = 0; k < Math.max(1, Math.round(seconds / 0.016)); k++) {
      snap = engine.advance(doc, pressed, 0.016);
      serial += engine.takeSerial();
      trace.push({
        t: snap.time,
        pressed: pressed.size > 0,
        parts: Object.fromEntries(
          Object.entries(snap.parts).map(([id, p]) => [id, { i: p.i, v: p.v, glow: p.glow, on: p.on, deg: p.deg, l: p.uno?.l, burned: p.burned }]),
        ),
      });
      // The app checks goals on every frame, so "seen" goals notice moments that pass quickly.
      live.snap = snap;
      live.serial = serial;
      if (onFrame) latched = onFrame(live, latched).latched;
    }
  };

  const demo: Demo = {
    run: advance,
    press: (down) => {
      pressed = down ? new Set(doc.parts.filter((p) => p.type === "button").map((p) => p.id)) : new Set();
    },
    setProp: (type, key, value) => {
      const part = doc.parts.find((p) => p.type === type);
      if (part) part.props[key] = value;
    },
  };

  if (step.demo) {
    step.demo(demo);
    if (!snap) advance(0.05);
  }

  return { ctx: { ...live, snap, serial }, latched };
}
