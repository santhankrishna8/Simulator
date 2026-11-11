import { describe, expect, it } from "vitest";
import { collides } from "@/sim/model";
import { play } from "./harness";
import { LESSONS, lessonById, solutionChain } from "./index";
import { buildNets } from "./nets";
import { connected } from "./goals";
import { add, BLACK, breadboard, doc, hole, part, pin, RED, wire } from "./author";
import { evaluateStep } from "./evaluate";
import { lessonById as byId } from "./index";


describe("net connectivity", () => {
  const d = doc(
    [breadboard(), part("bat", "battery9v", -10, 18), part("r1", "resistor", 8, 12, { ohms: 330 }), part("led1", "led", 12, 11)],
    [wire(pin("bat", "pos"), hole(1, 17), RED), wire(pin("bat", "neg"), hole(1, 18), BLACK), wire(hole(8, 14), hole(8, 17), RED)],
  );
  const ctx = (x = d) => ({ doc: x, nets: buildNets(x) }) as never;

  it("joins pins through strips and wires", () => {
    const n = buildNets(d);
    expect(n.net("r1", "b")).toBe(n.net("led1", "anode")); // same five-hole column
    expect(n.net("r1", "a")).toBe(n.net("bat", "pos")); // through a wire to the + rail
    expect(n.net("led1", "cathode")).not.toBe(n.net("bat", "neg"));
  });

  it("answers rail questions", () => {
    expect(connected(ctx(), { type: "battery", pin: "pos" }, { rail: "+" })).toBe(true);
    expect(connected(ctx(), { type: "battery", pin: "neg" }, { rail: "+" })).toBe(false);
    expect(connected(ctx(), { type: "resistor", pin: "a" }, { rail: "+" })).toBe(true);
  });

  it("does not join pins that only look close", () => {
    const apart = add(d, [part("led2", "led", 20, 11)]);
    expect(buildNets(apart).net("led2", "anode")).not.toBe(buildNets(apart).net("led1", "anode"));
  });
});

describe("lessons", () => {
  it("are well formed", () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(8);
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of LESSONS) {
      expect(l.steps.length, l.id).toBeGreaterThan(1);
      expect(l.takeaways.length, l.id).toBeGreaterThan(1);
      if (l.next) expect(lessonById(l.next), `${l.id} -> ${l.next}`).toBeDefined();
      for (const [i, s] of l.steps.entries()) {
        const where = `${l.id} step ${i + 1}`;
        expect(s.title, where).toBeTruthy();
        expect(s.body.length, where).toBeGreaterThan(40);
        expect(s.hint.length, where).toBeGreaterThan(20);
        expect(s.goals.length, where).toBeGreaterThan(0);
        if (typeof s.after === "string") expect(s.after.length, where).toBeGreaterThan(10);
      }
    }
  });

  for (const lesson of LESSONS) {
    describe(lesson.title, () => {
      const chain = solutionChain(lesson);

      it("has benches with no two leads in one hole", () => {
        for (const [i, state] of chain.entries()) for (const p of state.doc.parts) expect(collides(state.doc, p), `${lesson.id} state ${i} ${p.id}`).toBe(false);
      });

      for (const [i, step] of lesson.steps.entries()) {
        it(`step ${i + 1} "${step.title}": the model solution passes every goal`, { timeout: 60_000 }, () => {
          const { ctx, result } = play(chain[i + 1], step, { arrived: false });
          expect(step.goals.filter((_, k) => !result!.passed[k]).map((g) => g.label), "failing goals").toEqual([]);
          const after = typeof step.after === "function" ? step.after(ctx) : step.after;
          expect(after.length).toBeGreaterThan(10);
        });

        it(`step ${i + 1} is not already done when you arrive`, () => {
          const { result } = play(chain[i], step, { arrived: true });
          expect(result!.done, "step already complete on arrival").toBe(false);
        });
      }
    });
  }
});

describe("wrong answers are not accepted", () => {
  const goalsPassing = (lessonId: string, stepIndex: number, d: ReturnType<typeof doc>) => {
    const lesson = byId(lessonId)!;
    const step = lesson.steps[stepIndex];
    const ctx = { doc: d, nets: buildNets(d), snap: null, code: "", build: { status: "idle", diagnostics: [] }, builtCode: null, serial: "", running: false, trace: [] } as never;
    return evaluateStep(step, ctx).passed;
  };

  it("an LED wired straight to + with no resistor in the path", () => {
    const chain = solutionChain(lessonById("first-circuit")!);
    // + rail straight to the LED's anode column, skipping the resistor
    const bypass = add(chain[3].doc, [], [wire(hole(12, 14), hole(12, 17), RED), wire(hole(13, 14), hole(13, 18), BLACK)]);
    const [resistorBetween, cathodeOk] = goalsPassing("first-circuit", 3, bypass);
    expect(resistorBetween).toBe(false);
    expect(cathodeOk).toBe(true);
  });

  it("an LED that is on the bench but not plugged in", () => {
    const chain = solutionChain(lessonById("first-circuit")!);
    const floating = add(chain[1].doc, [part("led1", "led", -20, -20)]);
    expect(goalsPassing("first-circuit", 1, floating)).toEqual([false]);
  });

  it("a button wired across the resistor instead of in front of it", () => {
    const chain = solutionChain(lessonById("button")!);
    // button between + and the LED's anode column, bypassing the resistor
    const wrong = add(chain[1].doc, [], [wire(hole(22, 14), hole(22, 17), RED), wire(hole(12, 14), hole(20, 14), RED)]);
    const [toPlus, toResistor] = goalsPassing("button", 1, wrong);
    expect(toPlus).toBe(true);
    expect(toResistor).toBe(false);
  });

  it("a potentiometer with both ends on the same rail", () => {
    const chain = solutionChain(lessonById("voltage")!);
    const wrong = add(chain[0].doc, [], [wire(hole(11, 14), hole(11, 17), RED), wire(hole(13, 14), hole(13, 17), RED)]);
    expect(goalsPassing("voltage", 1, wrong)).toEqual([false]);
  });

  it("circuit-shape goals tick off again when you break the circuit, but seen goals stay", () => {
    const lesson = byId("button")!;
    const chain = solutionChain(lesson);
    const step = lesson.steps[2];
    const ctx = (d: typeof chain[0]["doc"], lit: boolean) =>
      ({ doc: d, nets: buildNets(d), snap: null, code: "", build: { status: "idle", diagnostics: [] }, builtCode: null, serial: "", running: true,
        trace: lit ? [{ t: 0, pressed: true, parts: { led1: { i: 0.02, v: 2, glow: 1 } } }] : [] }) as never;
    const first = evaluateStep(step, ctx(chain[2].doc, true));
    expect(first.passed[1]).toBe(true); // lit while held: seen
    const later = evaluateStep(step, ctx(chain[2].doc, false), first.latched);
    expect(later.passed[1]).toBe(true); // still ticked
    const shape = evaluateStep(lesson.steps[1], ctx(chain[2].doc, false));
    expect(shape.done).toBe(true);
    const notWiredYet = evaluateStep(lesson.steps[1], ctx(chain[1].doc, false)); // the bench before the wires went in
    expect(notWiredYet.done).toBe(false);
    const gone = evaluateStep(lesson.steps[1], ctx({ ...chain[2].doc, wires: [] }, false));
    expect(gone.done).toBe(false);
  });

  it("LCD data wires in the wrong order are not accepted", () => {
    const chain = solutionChain(lessonById("lcd")!);
    const swapped = { ...chain[4].doc, wires: chain[4].doc.wires.map((w) => (w.a.part === "lcd" && w.a.pin === "d4" ? { ...w, b: { part: "uno", pin: "d2" } } : w)) };
    const passed = goalsPassing("lcd", 3, swapped as never);
    expect(passed.filter(Boolean).length).toBeLessThan(passed.length);
    expect(passed[2]).toBe(false); // D4 must reach pin 5
  });

  it("ultrasonic TRIG and ECHO swapped are not accepted", () => {
    const chain = solutionChain(lessonById("ultrasonic")!);
    const swapped = { ...chain[2].doc, wires: chain[2].doc.wires.map((w) => (w.a.pin === "trig" ? { ...w, b: { part: "uno", pin: "d10" } } : w.a.pin === "echo" ? { ...w, b: { part: "uno", pin: "d9" } } : w)) };
    expect(goalsPassing("ultrasonic", 1, swapped as never)).toEqual([false, false]);
  });

  it("a capacitor charged with no resistor in the way is not accepted", () => {
    const chain = solutionChain(lessonById("capacitor")!);
    const direct = { ...chain[2].doc, parts: chain[2].doc.parts.filter((p) => p.id !== "r1"), wires: [...chain[2].doc.wires.filter((w) => w.a.part !== "bb" || w.a.pin !== "9_14"), wire(hole(13, 14), hole(11, 17), RED)] };
    const passed = goalsPassing("capacitor", 1, direct as never);
    expect(passed.every(Boolean)).toBe(false);
  });
});
