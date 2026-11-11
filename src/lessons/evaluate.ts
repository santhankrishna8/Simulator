import type { Ctx, Step } from "./types";

export interface StepResult {
  /** Whether each goal is currently ticked. */
  passed: boolean[];
  /** The "something happened" goals that have been seen so far this step. */
  latched: boolean[];
  /** Every goal is ticked. */
  done: boolean;
}

/**
 * Check a step's goals. Goals about the circuit's shape are re-checked every time; goals about
 * something that happened stay ticked once seen. Feed `latched` from the previous call back in.
 */
export function evaluateStep(step: Step, ctx: Ctx, latched: boolean[] = []): StepResult {
  const nextLatched = step.goals.map((g, i) => !!latched[i] || (!!g.latch && g.test(ctx)));
  const passed = step.goals.map((g, i) => (g.latch ? nextLatched[i] : g.test(ctx)));
  return { passed, latched: nextLatched, done: passed.every(Boolean) };
}
