/// <reference lib="webworker" />
/**
 * Runs the circuit engine and the Uno's chip off the main thread, so the page
 * stays smooth even while 16 million instructions a second are emulated.
 */
import { Engine, type Snapshot } from "./engine";
import type { Doc } from "./model";

export type ToWorker =
  | { t: "doc"; doc: Doc }
  | { t: "pressed"; ids: string[] }
  | { t: "run"; on: boolean }
  | { t: "reset" }
  | { t: "program"; hex: string | null }
  | { t: "serialIn"; text: string }
  | { t: "replace"; id: string };

export type FromWorker =
  | { t: "frame"; snapshot: Snapshot; serial: string; speed: number }
  | { t: "error"; message: string };

const FRAME_MS = 16;
const MAX_DT = 0.05;

const engine = new Engine();
let doc: Doc = { parts: [], wires: [] };
let pressed = new Set<string>();
let running = false;
let last = 0;
let speed = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

function tick() {
  if (!running) return;
  const started = performance.now();
  const wall = Math.max(0.001, (started - last) / 1000);
  const dt = Math.min(MAX_DT, wall);
  last = started;
  try {
    const snapshot = engine.advance(doc, pressed, dt);
    // How much simulated time passes per real second; below 1 means the machine can't keep up.
    speed = speed * 0.9 + Math.min(1, dt / wall) * 0.1;
    post({ t: "frame", snapshot, serial: engine.takeSerial(), speed });
  } catch (e) {
    running = false;
    post({ t: "error", message: e instanceof Error ? e.message : String(e) });
    return;
  }
  timer = setTimeout(tick, Math.max(0, FRAME_MS - (performance.now() - started)));
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const m = event.data;
  switch (m.t) {
    case "doc":
      doc = m.doc;
      break;
    case "pressed":
      pressed = new Set(m.ids);
      break;
    case "run":
      if (m.on && !running) {
        running = true;
        last = performance.now() - FRAME_MS;
        speed = 1;
        tick();
      } else if (!m.on) {
        running = false;
        clearTimeout(timer);
      }
      break;
    case "reset":
      engine.reset();
      break;
    case "program":
      try {
        engine.loadProgram(m.hex);
      } catch (e) {
        post({ t: "error", message: e instanceof Error ? e.message : String(e) });
      }
      break;
    case "serialIn":
      engine.serialIn(m.text);
      break;
    case "replace":
      engine.replace(m.id);
      break;
  }
};
