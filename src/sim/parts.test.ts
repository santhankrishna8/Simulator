import { describe, expect, it } from "vitest";
import { Engine, type Snapshot } from "./engine";
import type { Doc, Part, Wire } from "./model";

let n = 0;
const part = (type: Part["type"], id: string, props: Part["props"] = {}, x = 0, y = 0): Part => ({ id, type, x, y, rot: 0, props });
const wire = (a: string, b: string): Wire => {
  const [pa, ia] = a.split("."), [pb, ib] = b.split(".");
  return { id: `w${n++}`, a: { part: pa, pin: ia }, b: { part: pb, pin: ib }, color: "#000" };
};

function bench(doc: Doc) {
  const engine = new Engine();
  let pressed = new Set<string>();
  return {
    engine,
    press: (...ids: string[]) => { pressed = new Set(ids); },
    run(seconds: number, each?: (s: Snapshot) => void) {
      let last!: Snapshot;
      for (let k = 0; k < Math.round(seconds / 0.005); k++) {
        last = engine.advance(doc, pressed, 0.005);
        each?.(last);
      }
      return last;
    },
  };
}

describe("transistor switch with a relay", () => {
  /** 6 V battery; coil from + to the collector; emitter to −; base through 1 kΩ and a button from +. */
  function relayCircuit(flyback: boolean): Doc {
    const doc: Doc = {
      parts: [
        part("batteryAA4", "bat"), part("relay", "rly"), part("npn", "q1"), part("resistor", "rb", { ohms: 1000 }),
        part("button", "btn"), part("led", "led", { color: "green" }), part("resistor", "rl", { ohms: 330 }),
      ],
      wires: [
        wire("bat.pos", "rly.coila"), wire("rly.coilb", "q1.c"), wire("q1.e", "bat.neg"),
        wire("bat.pos", "btn.a1"), wire("btn.b1", "rb.a"), wire("rb.b", "q1.b"),
        // contacts: common to +, normally open through a resistor and LED to −
        wire("bat.pos", "rly.com"), wire("rly.no", "rl.a"), wire("rl.b", "led.anode"), wire("led.cathode", "bat.neg"),
      ],
    };
    if (flyback) {
      doc.parts.push(part("diode", "d1"));
      doc.wires.push(wire("rly.coilb", "d1.anode"), wire("d1.cathode", "rly.coila"));
    }
    return doc;
  }

  it("is off until the button is pressed", () => {
    const b = bench(relayCircuit(true));
    const s = b.run(0.1);
    expect(s.parts.rly.on).toBe(false);
    expect(s.parts.led.i).toBeLessThan(1e-5);
    expect(s.parts.q1.extra?.State).toBe("Off");
  });

  it("pulls the relay in and lights the LED when the base is driven", () => {
    const b = bench(relayCircuit(true));
    b.press("btn");
    const s = b.run(0.2);
    expect(s.parts.q1.extra?.State).toMatch(/Saturated/);
    expect(s.parts.rly.i).toBeGreaterThan(0.07); // about 6 V / 70 Ω less Vce(sat)
    expect(s.parts.rly.on).toBe(true);
    expect(s.parts.led.i).toBeGreaterThan(0.007);
  });

  it("survives switch-off when a flyback diode is fitted", () => {
    const b = bench(relayCircuit(true));
    b.press("btn");
    b.run(0.2);
    b.press();
    let burned = false;
    b.run(0.2, (s) => (burned ||= !!s.parts.q1.burned));
    expect(burned).toBe(false);
    const s = b.run(0.1);
    expect(s.parts.rly.on).toBe(false);
    expect(s.parts.led.i).toBeLessThan(1e-5);
  });

  it("destroys the transistor at switch-off without a flyback diode, and says why", () => {
    const b = bench(relayCircuit(false));
    b.press("btn");
    b.run(0.2);
    b.press();
    const s = b.run(0.1);
    expect(s.parts.q1.burned).toBe(true);
    const w = s.warnings.find((x) => x.id.startsWith("qburn"));
    expect(w?.title).toMatch(/voltage spike/);
    expect(w?.fix).toMatch(/diode across the coil/);
  });

  it("works again after fitting a new transistor", () => {
    const doc = relayCircuit(true);
    const b = bench(doc);
    b.engine.advance(doc, new Set(), 0.001);
    (b.engine as unknown as { burned: Set<string> }).burned.add("q1");
    expect(b.run(0.05).parts.q1.burned).toBe(true);
    b.engine.replace("q1");
    b.press("btn");
    expect(b.run(0.2).parts.rly.on).toBe(true);
  });
});

describe("RGB LED", () => {
  it("mixes colours: each channel glows with its own current", () => {
    const doc: Doc = {
      parts: [part("batteryAA4", "bat"), part("rgbled", "rgb"), part("resistor", "r1", { ohms: 330 }), part("resistor", "r2", { ohms: 330 })],
      wires: [
        wire("bat.pos", "r1.a"), wire("r1.b", "rgb.r"),
        wire("bat.pos", "r2.a"), wire("r2.b", "rgb.b"),
        wire("rgb.k", "bat.neg"),
      ],
    };
    const s = bench(doc).run(0.1);
    const ch = s.parts.rgb.channels!;
    expect(ch.r).toBeGreaterThan(0.5); // (6 − 1.9) / 334 ≈ 12 mA
    expect(ch.b).toBeGreaterThan(0.3); // (6 − 3.0) / 334 ≈ 9 mA
    expect(ch.g).toBe(0);
    expect(ch.r).toBeGreaterThan(ch.b);
  });

  it("burns only the channel that is overdriven", () => {
    const doc: Doc = {
      parts: [part("batteryAA4", "bat"), part("rgbled", "rgb"), part("resistor", "r1", { ohms: 330 })],
      wires: [wire("bat.pos", "r1.a"), wire("r1.b", "rgb.g"), wire("bat.pos", "rgb.r"), wire("rgb.k", "bat.neg")],
    };
    const s = bench(doc).run(1.5);
    expect(s.parts.rgb.channels!.g).toBeGreaterThan(0.3);
    expect(s.warnings.some((w) => w.id === "chburn-rgb")).toBe(true);
    expect(s.warnings.find((w) => w.id === "chburn-rgb")?.title).toMatch(/R burnt out/);
  });
});

describe("7-segment display", () => {
  it("lights exactly the segments that are driven", () => {
    const doc: Doc = {
      parts: [part("batteryAA4", "bat"), part("sevenseg", "seg"), part("resistor", "r1", { ohms: 330 }), part("resistor", "r2", { ohms: 330 })],
      wires: [
        wire("bat.pos", "r1.a"), wire("r1.b", "seg.a"),
        wire("bat.pos", "r2.a"), wire("r2.b", "seg.b"),
        wire("seg.com2", "bat.neg"),
      ],
    };
    const s = bench(doc).run(0.1);
    const ch = s.parts.seg.channels!;
    expect(ch.a).toBeGreaterThan(0.5);
    expect(ch.b).toBeGreaterThan(0.5);
    for (const off of ["c", "d", "e", "f", "g", "dp"]) expect(ch[off], off).toBe(0);
  });

  it("treats both common pins as one", () => {
    const doc: Doc = {
      parts: [part("batteryAA4", "bat"), part("sevenseg", "seg"), part("resistor", "r1", { ohms: 330 })],
      wires: [wire("bat.pos", "r1.a"), wire("r1.b", "seg.g"), wire("seg.com1", "bat.neg")],
    };
    expect(bench(doc).run(0.1).parts.seg.channels!.g).toBeGreaterThan(0.5);
  });
});
