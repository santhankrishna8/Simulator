import { describe, expect, it } from "vitest";
import { Engine, type Snapshot } from "./engine";
import { EXAMPLES } from "./examples";
import { collides, type Doc } from "./model";
import { PREBUILT } from "./prebuilt.generated";

const arduino = EXAMPLES.filter((e) => e.sketch);

function boot(id: string) {
  const ex = EXAMPLES.find((e) => e.id === id)!;
  const doc: Doc = structuredClone(ex.doc);
  const engine = new Engine();
  engine.loadProgram(PREBUILT[id]);
  let pressed = new Set<string>();
  let serial = "";
  const step = (seconds: number, each?: (s: Snapshot) => void) => {
    let last!: Snapshot;
    for (let k = 0; k < Math.round(seconds / 0.01); k++) {
      last = engine.advance(doc, pressed, 0.01);
      serial += engine.takeSerial();
      each?.(last);
    }
    return last;
  };
  return {
    doc, step,
    press: (id: string, down: boolean) => { pressed = new Set(down ? [id] : []); },
    get serial() { return serial; },
    setProp: (part: string, key: string, v: number) => { doc.parts.find((p) => p.id === part)!.props[key] = v; },
  };
}

describe("Arduino examples", () => {
  it("each has a bundled program and clean wiring", () => {
    for (const e of arduino) {
      expect(PREBUILT[e.id], e.id).toBeTruthy();
      for (const p of e.doc.parts) expect(collides(e.doc, p), `${e.id}/${p.id}`).toBe(false);
    }
  });

  it("run for two seconds with no overload warnings", { timeout: 40_000 }, () => {
    for (const e of arduino) {
      const sim = boot(e.id);
      const bad = new Set<string>();
      sim.step(2, (s) => s.warnings.filter((w) => w.level !== "info").forEach((w) => bad.add(`${e.id}: ${w.title}`)));
      expect([...bad]).toEqual([]);
    }
  });

  it("blink: the LED follows pin 13 once a second", () => {
    const sim = boot("blink");
    let onSamples = 0, total = 0, transitions = 0, prev = false;
    sim.step(4, (s) => {
      const on = s.parts.led1.i > 0.005;
      total++;
      if (on) onSamples++;
      if (on !== prev) transitions++;
      prev = on;
    });
    expect(onSamples / total).toBeGreaterThan(0.4);
    expect(onSamples / total).toBeLessThan(0.6);
    expect(transitions).toBeGreaterThanOrEqual(6);
  });

  it("fade: PWM gives the LED a smoothly varying average current", () => {
    const sim = boot("fade");
    const currents: number[] = [];
    sim.step(5, (s) => currents.push(s.parts.led1.i));
    const hi = Math.max(...currents), lo = Math.min(...currents);
    expect(hi).toBeGreaterThan(0.007);
    expect(lo).toBeLessThan(0.001);
    // Mid-range values prove averaging works (not just fully on or off).
    expect(currents.some((c) => c > 0.002 && c < 0.006)).toBe(true);
  });

  it("button: LED follows the button and the press is logged", () => {
    const sim = boot("button");
    expect(sim.step(0.5).parts.led1.i).toBeLessThan(1e-4);
    sim.press("btn", true);
    expect(sim.step(0.3).parts.led1.i).toBeGreaterThan(0.005);
    sim.press("btn", false);
    expect(sim.step(0.3).parts.led1.i).toBeLessThan(1e-4);
    expect(sim.serial).toContain("Button pressed");
    expect(sim.serial).toContain("Button released");
  });

  it("knob: the reading follows the potentiometer", () => {
    const sim = boot("knob");
    const read = () => {
      sim.step(0.6);
      const lines = sim.serial.trim().split(/\r?\n/);
      return Number(/reading (\d+)/.exec(lines[lines.length - 1])![1]);
    };
    sim.setProp("pot1", "t", 0.5);
    expect(Math.abs(read() - 512)).toBeLessThan(8);
    sim.setProp("pot1", "t", 0.2);
    expect(Math.abs(read() - 818)).toBeLessThan(8); // wiper near the 5 V end
    sim.setProp("pot1", "t", 0.9);
    expect(Math.abs(read() - 102)).toBeLessThan(8);
  });

  it("night light: darker room, brighter LED", () => {
    const sim = boot("nightlight");
    sim.setProp("ldr1", "t", 0.95); // bright room
    const bright = sim.step(1.2);
    const dimmed = bright.parts.led1.i;
    sim.setProp("ldr1", "t", 0.05); // dark room
    const lit = sim.step(1.2).parts.led1.i;
    expect(lit).toBeGreaterThan(dimmed * 3);
    expect(lit).toBeGreaterThan(0.005);
  });

  it("serial control: greets and obeys", () => {
    const sim = boot("serial");
    const snap = sim.step(0.3);
    expect(sim.serial).toContain("Type 1 to turn the LED on");
    expect(snap.parts.uno.uno?.l).toBe(false);
    expect(snap.parts.uno.uno?.baud).toBe(9600);
  });

  it("the reset button restarts the sketch", () => {
    const sim = boot("serial");
    sim.step(0.3);
    const before = sim.serial.length;
    sim.press("uno", true);
    sim.step(0.1);
    sim.press("uno", false);
    sim.step(0.3);
    expect(sim.serial.length).toBeGreaterThan(before); // greeting printed a second time
  });
});
