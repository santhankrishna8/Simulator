import { describe, expect, it } from "vitest";
import { Engine } from "./engine";
import type { Doc, Part, Wire } from "./model";

let n = 0;
const part = (type: Part["type"], x: number, y: number, props: Part["props"] = {}, id = `p${n++}`): Part => ({ id, type, x, y, rot: 0, props });
const wire = (a: [string, string], b: [string, string]): Wire => ({ id: `w${n++}`, a: { part: a[0], pin: a[1] }, b: { part: b[0], pin: b[1] }, color: "#000" });
const run = (doc: Doc, seconds: number, pressed = new Set<string>()) => {
  const e = new Engine();
  let snap = e.advance(doc, pressed, 0.01);
  for (let k = 1; k < Math.round(seconds / 0.01); k++) snap = e.advance(doc, pressed, 0.01);
  return snap;
};

/** Breadboard at origin: hole (x, y) is at grid (x, y). Battery wired to the top rails. */
function base(battery: Part["type"] = "battery9v") {
  const bb = part("breadboard", 0, 0, {}, "bb");
  const bat = part(battery, -10, 30, {}, "bat");
  return { parts: [bb, bat], wires: [wire(["bat", "pos"], ["bb", "1_1"]), wire(["bat", "neg"], ["bb", "1_2"])] } as Doc;
}

describe("circuit engine", () => {
  it("lights a red LED through 220 ohms from 9 V at about 31 mA", () => {
    const doc = base();
    doc.parts.push(part("resistor", 5, 4, { ohms: 220 }, "r"), part("led", 9, 5, { color: "red" }, "led"));
    // resistor a in column 5, b in column 9; LED anode column 9, cathode column 10.
    doc.wires.push(wire(["bb", "5_1"], ["bb", "5_5"]), wire(["bb", "10_6"], ["bb", "10_2"]));
    const s = run(doc, 0.05);
    expect(s.parts.led.i).toBeGreaterThan(0.028);
    expect(s.parts.led.i).toBeLessThan(0.034);
    expect(s.parts.led.v).toBeGreaterThan(1.8);
    expect(s.parts.led.v).toBeLessThan(2.2);
    expect(s.warnings.some((w) => w.id.startsWith("lhot"))).toBe(true);
  });

  it("burns an LED connected straight across 9 V", () => {
    const doc = base();
    doc.parts.push(part("led", 9, 5, { color: "red" }, "led"));
    doc.wires.push(wire(["bb", "9_1"], ["bb", "9_6"]), wire(["bb", "10_6"], ["bb", "10_2"]));
    const s = run(doc, 0.1);
    expect(s.parts.led.burned).toBe(true);
    expect(s.parts.led.i).toBe(0);
  });

  it("does not light a reversed LED and says why", () => {
    const doc = base();
    doc.parts.push(part("resistor", 5, 4, { ohms: 470 }, "r"), part("led", 10, 5, { color: "green" }, "led"));
    doc.parts[3].rot = 2; // anode now at column 10, cathode at column 9
    doc.wires.push(wire(["bb", "5_1"], ["bb", "5_5"]), wire(["bb", "10_6"], ["bb", "10_2"]));
    const s = run(doc, 0.05);
    expect(s.parts.led.i).toBeLessThan(1e-6);
    expect(s.warnings.some((w) => w.id.startsWith("lrev"))).toBe(true);
  });

  it("divides voltage in proportion to resistance", () => {
    const doc = base();
    doc.parts.push(part("resistor", 5, 4, { ohms: 10000 }, "r1"), part("resistor", 9, 5, { ohms: 20000 }, "r2"), part("meter", 40, 30, { mode: "V" }, "m"));
    doc.wires.push(wire(["bb", "5_1"], ["bb", "5_5"]), wire(["bb", "13_6"], ["bb", "13_2"]), wire(["m", "v"], ["bb", "9_7"]), wire(["m", "com"], ["bb", "2_2"]));
    const s = run(doc, 0.05);
    expect(s.parts.m.v).toBeCloseTo(6, 1);
    expect(s.parts.m.reading).toMatch(/V$/);
  });

  it("charges a capacitor to 63 % after one RC time constant", () => {
    const doc = base();
    doc.parts.push(part("resistor", 5, 4, { ohms: 1000 }, "r"), part("capacitor", 9, 5, { farads: 0.0001 }, "c"));
    doc.wires.push(wire(["bb", "5_1"], ["bb", "5_5"]), wire(["bb", "10_6"], ["bb", "10_2"]));
    const s = run(doc, 0.1); // R*C = 0.1 s
    expect(s.parts.c.v / 9).toBeGreaterThan(0.6);
    expect(s.parts.c.v / 9).toBeLessThan(0.65);
  });

  it("flags a short circuit and sags the battery", () => {
    const doc = base();
    doc.wires.push(wire(["bb", "3_1"], ["bb", "3_2"]));
    const s = run(doc, 0.02);
    expect(s.parts.bat.i).toBeGreaterThan(4);
    expect(s.parts.bat.v).toBeLessThan(1);
    expect(s.warnings[0].title).toBe("Short circuit");
  });

  it("only conducts through a button while pressed", () => {
    const doc = base("batteryAA2");
    doc.parts.push(part("button", 5, 8, {}, "btn"), part("buzzer", 12, 5, {}, "bz"));
    // button side A column 5, side B column 7; buzzer + column 12, − column 15.
    doc.wires.push(wire(["bb", "5_1"], ["bb", "5_5"]), wire(["bb", "7_5"], ["bb", "12_7"]), wire(["bb", "15_7"], ["bb", "15_2"]));
    expect(run(doc, 0.02).parts.bz.sounding).toBe(false);
    expect(run(doc, 0.02, new Set(["btn"])).parts.bz.sounding).toBe(true);
  });

  it("spins a motor up to a steady speed", () => {
    const doc = base("batteryAA2");
    doc.parts.push(part("motor", 40, 40, {}, "mot"));
    doc.wires.push(wire(["mot", "pos"], ["bb", "3_1"]), wire(["mot", "neg"], ["bb", "3_2"]));
    const early = run(doc, 0.02);
    const late = run(doc, 5);
    expect(early.parts.mot.i).toBeGreaterThan(0.4);
    expect(late.parts.mot.rpm!).toBeGreaterThan(6000);
    expect(late.parts.mot.i).toBeLessThan(0.15);
  });

  it("reports no current for an open circuit", () => {
    const doc = base();
    doc.parts.push(part("resistor", 5, 4, { ohms: 220 }, "r"));
    const s = run(doc, 0.02);
    expect(s.warnings[0].id).toBe("open");
  });
});

import { EXAMPLES } from "./examples";
import { collides } from "./model";

describe("example circuits", () => {
  const ex = (id: string) => structuredClone(EXAMPLES.find((e) => e.id === id)!.doc);
  it("have no two leads in one hole", () => {
    for (const e of EXAMPLES) for (const p of e.doc.parts) expect(collides(e.doc, p), `${e.id}/${p.id}`).toBe(false);
  });
  it("LED example lights safely", () => {
    const s = run(ex("led"), 0.05);
    expect(s.parts.led1.i).toBeGreaterThan(0.01);
    expect(s.warnings).toEqual([]);
  });
  it("button example buzzes only when pressed", () => {
    expect(run(ex("button"), 0.03).parts.bz.sounding).toBe(false);
    expect(run(ex("button"), 0.03, new Set(["btn"])).parts.bz.sounding).toBe(true);
  });
  it("divider example reads a fraction of 9 V", () => {
    const s = run(ex("dimmer"), 0.05);
    expect(s.parts.m1.v).toBeGreaterThan(5);
    expect(s.parts.m1.v).toBeLessThan(6.5);
  });
  it("slow fade example charges when switched on", () => {
    const doc = ex("rc");
    expect(run(doc, 0.05).parts.led1.i).toBeLessThan(1e-6);
    doc.parts.find((p) => p.id === "sw")!.props.pos = 1;
    const s = run(doc, 2);
    expect(s.parts.led1.i).toBeGreaterThan(0.003);
    expect(s.parts.c1.v).toBeGreaterThan(6);
  });
  it("motor example spins when switched on", () => {
    const doc = ex("motor");
    doc.parts.find((p) => p.id === "sw")!.props.pos = 1;
    const s = run(doc, 4);
    expect(s.parts.mot.rpm!).toBeGreaterThan(8000);
    expect(s.parts.m1.reading).toMatch(/A$/);
  });
});
