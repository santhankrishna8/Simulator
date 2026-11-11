import { describe, expect, it } from "vitest";
import { Engine, type Snapshot } from "./engine";
import type { Doc, Part, Wire } from "./model";
import { PREBUILT } from "./prebuilt.generated";

let n = 0;
const part = (type: Part["type"], id: string, props: Part["props"] = {}): Part => ({ id, type, x: 0, y: 0, rot: 0, props });
const wire = (a: string, b: string): Wire => {
  const [pa, ia] = a.split("."), [pb, ib] = b.split(".");
  return { id: `w${n++}`, a: { part: pa, pin: ia }, b: { part: pb, pin: ib }, color: "#000" };
};

function rig(doc: Doc, sketch: keyof typeof PREBUILT) {
  const engine = new Engine();
  engine.loadProgram(PREBUILT[sketch]);
  let serial = "";
  return {
    doc,
    run(seconds: number, each?: (s: Snapshot) => void) {
      let last!: Snapshot;
      for (let k = 0; k < Math.round(seconds / 0.01); k++) {
        last = engine.advance(doc, new Set(), 0.01);
        serial += engine.takeSerial();
        each?.(last);
      }
      return last;
    },
    get serial() { return serial; },
    clear() { serial = ""; },
  };
}

describe("servo", () => {
  const servoDoc = (): Doc => ({
    parts: [part("uno", "uno"), part("servo", "sv")],
    wires: [wire("uno.5v", "sv.vcc"), wire("uno.gnd1", "sv.gnd"), wire("uno.d9", "sv.sig")],
  });

  it("follows the sketch's sweep from 0 to 180 degrees and back", () => {
    const r = rig(servoDoc(), "servo");
    const angles: number[] = [];
    r.run(4, (s) => angles.push(s.parts.sv.deg!));
    expect(Math.max(...angles)).toBeGreaterThan(172);
    expect(Math.min(...angles.slice(20))).toBeLessThan(10);
    // The horn can't teleport: it moves no faster than about 600 degrees a second.
    let fastest = 0;
    for (let i = 1; i < angles.length; i++) fastest = Math.max(fastest, Math.abs(angles[i] - angles[i - 1]) / 0.01);
    expect(fastest).toBeLessThan(620);
  });

  it("measures the pulse width the sketch sends", () => {
    const r = rig(servoDoc(), "servoknob");
    r.run(1);
    // The pot is not wired, so A0 floats near 0: write(0) is a 544 µs pulse.
    const s = r.run(0.3);
    expect(s.parts.sv.extra?.["Pulse width"]).toMatch(/^5[34]\d µs$/);
    expect(s.parts.sv.deg!).toBeLessThan(3);
  });

  it("draws more current while moving, and does nothing without power", () => {
    const moving = rig(servoDoc(), "servo");
    let peak = 0;
    moving.run(2, (s) => (peak = Math.max(peak, s.parts.uno.i)));
    expect(peak).toBeGreaterThan(0.15);
    expect(peak).toBeLessThan(0.3);

    const dead = servoDoc();
    dead.wires = dead.wires.filter((w) => w.a.pin !== "5v");
    const r = rig(dead, "servo");
    const s = r.run(1.5);
    expect(s.parts.sv.extra?.State).toMatch(/No power/);
    expect(s.parts.sv.deg).toBeCloseTo(90, 0);
    expect(s.warnings.some((w) => w.id === "nopower-sv")).toBe(true);
  });
});

describe("ultrasonic sensor", () => {
  const sonicDoc = (cm: number): Doc => ({
    parts: [part("uno", "uno"), part("hcsr04", "us", { cm })],
    wires: [wire("uno.5v", "us.vcc"), wire("uno.gnd1", "us.gnd"), wire("uno.d9", "us.trig"), wire("uno.d10", "us.echo")],
  });
  const lastReading = (serial: string) => {
    const lines = serial.trim().split(/\r?\n/);
    return lines[lines.length - 1];
  };

  it("reports the distance the object is at", () => {
    for (const cm of [10, 37, 100, 250]) {
      const r = rig(sonicDoc(cm), "ultrasonic");
      r.run(1.2);
      const cmRead = parseFloat(lastReading(r.serial));
      // pulseIn counts in whole microseconds, so a reading is within about 0.5 cm.
      expect(Math.abs(cmRead - cm), `${cm} cm`).toBeLessThan(0.6);
    }
  });

  it("says nothing is in range at 4 m", () => {
    const r = rig(sonicDoc(400), "ultrasonic");
    r.run(1.5);
    expect(lastReading(r.serial)).toBe("nothing in range");
  });

  it("follows the object as it moves", () => {
    const doc = sonicDoc(50);
    const r = rig(doc, "ultrasonic");
    r.run(1);
    expect(Math.abs(parseFloat(lastReading(r.serial)) - 50)).toBeLessThan(0.6);
    doc.parts[1].props.cm = 120;
    r.run(1);
    expect(Math.abs(parseFloat(lastReading(r.serial)) - 120)).toBeLessThan(0.6);
  });

  it("does not answer without power", () => {
    const doc = sonicDoc(100);
    doc.wires = doc.wires.filter((w) => w.b.pin !== "vcc");
    const r = rig(doc, "ultrasonic");
    r.run(1.5);
    expect(lastReading(r.serial)).toBe("nothing in range");
  });
});

describe("16x2 LCD", () => {
  /** 4-bit wiring: RS=D12, E=D11, D4..D7 = D5..D2, RW to GND, contrast divider to V0. */
  const lcdDoc = (opts: { contrast?: boolean; backlight?: boolean } = {}): Doc => {
    const { contrast = true, backlight = true } = opts;
    const doc: Doc = {
      parts: [part("uno", "uno"), part("lcd1602", "lcd")],
      wires: [
        wire("uno.gnd1", "lcd.vss"), wire("uno.5v", "lcd.vdd"), wire("lcd.rw", "uno.gnd1"),
        wire("uno.d12", "lcd.rs"), wire("uno.d11", "lcd.e"),
        wire("uno.d5", "lcd.d4"), wire("uno.d4", "lcd.d5"), wire("uno.d3", "lcd.d6"), wire("uno.d2", "lcd.d7"),
      ],
    };
    if (contrast) {
      doc.parts.push(part("resistor", "rtop", { ohms: 10000 }), part("resistor", "rbot", { ohms: 1000 }));
      doc.wires.push(wire("uno.5v", "rtop.a"), wire("rtop.b", "lcd.v0"), wire("lcd.v0", "rbot.a"), wire("rbot.b", "uno.gnd2"));
    }
    if (backlight) doc.wires.push(wire("lcd.a", "uno.5v"), wire("lcd.k", "uno.gnd3"));
    return doc;
  };
  const text = (s: Snapshot, row: number) => String.fromCharCode(...s.parts.lcd.lcd!.rows[row]);

  it("shows what the sketch prints, on the right rows", () => {
    const r = rig(lcdDoc(), "lcdhello");
    const s = r.run(2.5);
    expect(s.parts.lcd.lcd!.on).toBe(true);
    expect(text(s, 0)).toBe("Hello, world!   ");
    expect(text(s, 1)).toMatch(/^Uptime: [12] s +$/);
    expect(s.parts.lcd.extra?.Contrast).toBe("Readable");
  });

  it("updates the second line as the sketch runs", () => {
    const r = rig(lcdDoc(), "lcdhello");
    const a = text(r.run(1.5), 1);
    const b = text(r.run(2), 1);
    expect(a).not.toBe(b);
  });

  it("lights the backlight from its own supply, and not when unwired", () => {
    expect(rig(lcdDoc(), "lcdhello").run(0.5).parts.lcd.lcd!.backlight).toBeGreaterThan(0.5);
    expect(rig(lcdDoc({ backlight: false }), "lcdhello").run(0.5).parts.lcd.lcd!.backlight).toBeLessThan(0.05);
  });

  it("shows solid blocks when V0 is left at ground, and nothing when it is too high", () => {
    const dark = rig(lcdDoc({ contrast: false }), "lcdhello").run(0.5);
    expect(dark.parts.lcd.lcd!.blocks).toBe(true);
    expect(dark.parts.lcd.extra?.Contrast).toMatch(/Too dark/);

    const doc = lcdDoc({ contrast: false });
    doc.wires.push(wire("lcd.v0", "uno.5v"));
    const faint = rig(doc, "lcdhello").run(0.5);
    expect(faint.parts.lcd.lcd!.contrast).toBe(0);
    expect(faint.parts.lcd.extra?.Contrast).toMatch(/Too faint/);
  });

  it("stays blank and uninitialised with no sketch, and warns", () => {
    const e = new Engine();
    let s!: Snapshot;
    for (let k = 0; k < 20; k++) s = e.advance(lcdDoc(), new Set(), 0.01);
    expect(s.parts.lcd.lcd!.on).toBe(false);
    expect(s.parts.lcd.lcd!.blocks).toBe(true);
  });

  it("is blank without power", () => {
    const doc = lcdDoc();
    doc.wires = doc.wires.filter((w) => w.b.pin !== "vdd");
    const s = rig(doc, "lcdhello").run(1);
    expect(s.parts.lcd.lcd!.on).toBe(false);
    expect(s.parts.lcd.extra?.Display).toBe("No power");
  });
});

describe("oscilloscope on the bench", () => {
  /** D9 PWM -> 10 k -> A0 with 1 uF to ground; scope CH1 on D9, CH2 on the filtered node. */
  const scopeDoc = (tdiv = "0.002"): Doc => ({
    parts: [part("uno", "uno"), part("scope", "sc", { tdiv, v1div: "1", v2div: "1", trig: 2.5 }), part("resistor", "r", { ohms: 10000 }), part("capacitor", "c", { farads: 1e-6 })],
    wires: [
      wire("uno.d9", "sc.ch1"), wire("uno.gnd1", "sc.gnd"),
      wire("uno.d9", "r.a"), wire("r.b", "uno.a0"), wire("r.b", "c.pos"), wire("c.neg", "uno.gnd2"), wire("r.b", "sc.ch2"),
    ],
  });

  it("shows the PWM wave's frequency and duty cycle", () => {
    const r = rig(scopeDoc(), "pwmscope");
    const s = r.run(1.2); // first 1.5 s of the sketch holds 25 % duty
    const view = s.parts.sc.scope!;
    expect(view.triggered).toBe(true);
    expect(view.stats1.vpp).toBeGreaterThan(4.8);
    expect(view.stats1.freq!).toBeGreaterThan(470);
    expect(view.stats1.freq!).toBeLessThan(510); // Arduino pin 9 is 490 Hz
    expect(view.stats1.duty!).toBeGreaterThan(0.21);
    expect(view.stats1.duty!).toBeLessThan(0.3);
  });

  it("shows the RC filter smoothing it to the duty-weighted average", () => {
    const r = rig(scopeDoc("0.05"), "pwmscope"); // 50 ms/div, 500 ms across
    const low = r.run(1.4).parts.sc.scope!;
    expect(low.stats2.mean).toBeGreaterThan(1.1);
    expect(low.stats2.mean).toBeLessThan(1.45); // 25 % of 5 V
    expect(low.stats2.vpp).toBeLessThan(0.6); // ripple only
    const high = r.run(1.55).parts.sc.scope!; // 75 % runs from 1.5 s to 3.0 s; the window is 2.45 to 2.95 s
    expect(high.stats2.mean).toBeGreaterThan(3.4);
    expect(high.stats2.mean).toBeLessThan(4.0); // 75 % of 5 V
    r.run(0.2); // the 75 % reading is printed at 3.0 s
    expect(r.serial).toMatch(/25% duty, filtered voltage: 1\.[0-9]+ V/);
    expect(r.serial).toMatch(/75% duty, filtered voltage: 3\.[0-9]+ V/);
  });

  it("keeps real time with the scope sampling at 10 kHz", () => {
    const r = rig(scopeDoc(), "pwmscope");
    r.run(0.5); // warm up
    const t0 = performance.now();
    r.run(1);
    const ms = performance.now() - t0;
    console.log(`1 simulated second with Uno, filter and scope took ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(1000);
  });
});
