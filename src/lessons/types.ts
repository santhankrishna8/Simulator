import type { Build } from "@/store";
import type { PartType } from "@/sim/catalog";
import type { Snapshot } from "@/sim/engine";
import type { Doc } from "@/sim/model";
import type { Nets } from "./nets";

/** Which pins of which parts a goal is about. `battery` stands for any battery. */
export type PinSpec =
  | { type: PartType | "battery"; pin?: string | string[] }
  /** The breadboard's power rails: "+" are the red rows, "-" the blue ones. */
  | { rail: "+" | "-" };

/** What a part was doing in one rendered frame; enough for goals about behaviour over time. */
export interface FramePart {
  i: number;
  v: number;
  glow?: number;
  on?: boolean;
  deg?: number;
  l?: boolean;
  burned?: boolean;
}

export interface Frame {
  t: number;
  /** Any push button is being held. */
  pressed: boolean;
  parts: Record<string, FramePart>;
}

/** Everything a goal can look at. */
export interface Ctx {
  doc: Doc;
  nets: Nets;
  snap: Snapshot | null;
  code: string;
  build: Build;
  /** The source that is currently flashed on the board. */
  builtCode: string | null;
  serial: string;
  running: boolean;
  trace: Frame[];
}

export interface Goal {
  label: string;
  test: (c: Ctx) => boolean;
  /**
   * For goals about something that happened (the LED blinked, the knob was turned): once
   * seen, it stays ticked for the rest of the step. Goals about the circuit's current shape
   * are re-checked every time, so breaking the circuit un-ticks them.
   */
  latch?: boolean;
}

/** The bench and the sketch at one point in a lesson. */
export interface LessonState {
  doc: Doc;
  code: string;
}

/** How a person would complete a step, used by the tests and available for "show me" playback. */
export interface Demo {
  run(seconds: number): void;
  press(down: boolean): void;
  setProp(type: PartType, key: string, value: number | string): void;
}

export interface Step {
  title: string;
  /** Instructions, in the lightweight markup `Rich` understands. */
  body: string;
  goals: Goal[];
  hint: string;
  /** Shown once the step is done: what just happened, ideally with the circuit's real numbers. */
  after: string | ((c: Ctx) => string);
  /** Parts to point out in the drawer. */
  spotlight?: PartType[];
  /** The bench after this step is done correctly. */
  solution: (prev: LessonState) => LessonState;
  demo?: (d: Demo) => void;
}

export interface Lesson {
  id: string;
  title: string;
  track: "circuits" | "arduino";
  level: "Beginner" | "Intermediate";
  minutes: number;
  summary: string;
  start: LessonState;
  steps: Step[];
  takeaways: string[];
  /** Id of the lesson to suggest afterwards. */
  next?: string;
}
