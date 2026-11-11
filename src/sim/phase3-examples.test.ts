import { describe, expect, it } from "vitest";
import { Engine, type Snapshot } from "./engine";
import { EXAMPLES } from "./examples";
import { collides, type Doc } from "./model";
import { PREBUILT } from "./prebuilt.generated";
import { parseSeries } from "@/components/Plotter";

function boot(id: string) {
  const ex = EXAMPLES.find((e) => e.id === id)!;
  const doc: Doc = structuredClone(ex.doc);
  const engine = new Engine();
  if (PREBUILT[id]) engine.loadProgram(PREBUILT[id]);
  let pressed = new Set<string>();
  let serial = "";
  return {
    doc, engine,
    step(seconds: number, each?: (s: Snapshot) => void) {
      let last!: Snapshot;
      for (let k = 0; k < Math.round(seconds / 0.01); k++) {
        last = engine.advance(doc, pressed, 0.01);
        serial += engine.takeSerial();
        each?.(last);
      }
      return last;
    },
    press: (...ids: string[]) => { pressed = new Set(ids); },
    prop: (partId: string, key: string, v: number | string) => { doc.parts.find((p) => p.id === partId)!.props[key] = v; },
    get serial() { return serial; },
  };
}
const lines = (t: string) => t.trim().split(/\r?\n/);

describe("circuit examples", () => {
  it("have clean wiring", () => {
    for (const id of ["transistor", "relay", "rgb", "sevenseg", "servo", "servoknob", "ultrasonic", "lcdhello", "pwmscope", "plotter"]) {
      const ex = EXAMPLES.find((e) => e.id === id)!;
      for (const p of ex.doc.parts) expect(collides(ex.doc, p), `${id}/${p.id}`).toBe(false);
    }
  });

  it("transistor switch: the button turns the LED on", () => {
    const t = boot("transistor");
    expect(t.step(0.2).parts.led1.i).toBeLessThan(1e-4);
    t.press("btn");
    const s = t.step(0.2);
    expect(s.parts.led1.i).toBeGreaterThan(0.01);
    expect(s.parts.q1.extra?.State).toMatch(/Saturated/);
    expect(s.warnings.filter((w) => w.level !== "info")).toEqual([]);
  });

  it("relay: pulls in, lights the LED, and survives switch-off thanks to the diode", () => {
    const t = boot("relay");
    t.press("btn");
    let s = t.step(0.3);
    expect(s.parts.rly.on).toBe(true);
    expect(s.parts.led1.i).toBeGreaterThan(0.005);
    t.press();
    let burned = false;
    s = t.step(0.3, (x) => (burned ||= !!x.parts.q1.burned));
    expect(burned).toBe(false);
    expect(s.parts.rly.on).toBe(false);
    expect(s.parts.led1.i).toBeLessThan(1e-4);
  });

  it("relay: without the diode the transistor is destroyed at switch-off", () => {
    const t = boot("relay");
    t.doc.parts = t.doc.parts.filter((p) => p.id !== "d1");
    t.press("btn");
    t.step(0.3);
    t.press();
    const s = t.step(0.2);
    expect(s.parts.q1.burned).toBe(true);
    expect(s.warnings.find((w) => w.id.startsWith("qburn"))?.title).toMatch(/spike/);
  });
});

describe("Arduino device examples", () => {
  it("rgb: steps through red, orange, green, cyan, blue, magenta and white", () => {
    const t = boot("rgb");
    const at = (sec: number) => {
      const s = t.step(sec - t.engine.time);
      return s.parts.rgb1.channels!;
    };
    const lit = (v: number) => v > 0.4;
    let c = at(0.35);
    expect([lit(c.r), lit(c.g), lit(c.b)]).toEqual([true, false, false]); // red
    c = at(1.05);
    expect(lit(c.r)).toBe(true); expect(c.g).toBeGreaterThan(0.1); expect(c.g).toBeLessThan(c.r); expect(lit(c.b)).toBe(false); // orange
    c = at(1.75);
    expect([lit(c.r), lit(c.g), lit(c.b)]).toEqual([false, true, false]); // green
    c = at(3.15);
    expect([lit(c.r), lit(c.g), lit(c.b)]).toEqual([false, false, true]); // blue
    c = at(4.55);
    expect([lit(c.r), lit(c.g), lit(c.b)]).toEqual([true, true, true]); // white
  });

  it("sevenseg: shows each digit as the right segments", { timeout: 60_000 }, () => {
    const patterns = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
    const names = ["a", "b", "c", "d", "e", "f", "g"];
    const t = boot("sevenseg");
    for (let d = 0; d < 10; d++) {
      const s = t.step(d * 0.8 + 0.5 - t.engine.time);
      const ch = s.parts.seg1.channels!;
      const shown = names.map((n, i) => ((patterns[d] >> i) & 1) === (ch[n] > 0.3 ? 1 : 0));
      expect(shown, `digit ${d}`).toEqual(names.map(() => true));
      expect(ch.dp ?? 0).toBeLessThan(0.05);
    }
  });

  it("servo: sweeps the full range", () => {
    const t = boot("servo");
    const a: number[] = [];
    t.step(3, (s) => a.push(s.parts.sv.deg!));
    expect(Math.max(...a)).toBeGreaterThan(170);
    expect(Math.min(...a.slice(30))).toBeLessThan(15);
  });

  it("servoknob: the potentiometer sets the angle", () => {
    const t = boot("servoknob");
    const angle = () => t.step(0.8).parts.sv.deg!;
    t.prop("pot1", "t", 0.5);
    expect(Math.abs(angle() - 90)).toBeLessThan(4);
    t.prop("pot1", "t", 0.9); // wiper near the GND end
    expect(angle()).toBeLessThan(25);
    t.prop("pot1", "t", 0.1); // wiper near 5 V
    expect(angle()).toBeGreaterThan(155);
  });

  it("ultrasonic: reads the slider distance", () => {
    const t = boot("ultrasonic");
    t.step(1);
    expect(Math.abs(parseFloat(lines(t.serial).pop()!) - 100)).toBeLessThan(0.6);
    t.prop("us", "cm", 33);
    t.step(1);
    expect(Math.abs(parseFloat(lines(t.serial).pop()!) - 33)).toBeLessThan(0.6);
  });

  it("lcdhello: readable with the contrast knob set, unreadable when it is not", () => {
    const t = boot("lcdhello");
    const s = t.step(1.5);
    const text = (row: number) => String.fromCharCode(...s.parts.lcd.lcd!.rows[row]);
    expect(text(0)).toBe("Hello, world!   ");
    expect(s.parts.lcd.extra?.Contrast).toBe("Readable");
    expect(s.parts.lcd.lcd!.backlight).toBeGreaterThan(0.5);
    t.prop("pot1", "t", 0.0); // wiper at 5 V: contrast gone
    expect(t.step(0.2).parts.lcd.extra?.Contrast).toMatch(/faint/);
    t.prop("pot1", "t", 1.0); // wiper at 0 V: solid blocks
    expect(t.step(0.2).parts.lcd.extra?.Contrast).toMatch(/dark/);
  });

  it("pwmscope: shows the wave and the filtered voltage", () => {
    const t = boot("pwmscope");
    const s = t.step(1.2);
    const sc = s.parts.scope1.scope!;
    expect(sc.stats1.freq!).toBeGreaterThan(470);
    expect(sc.stats1.freq!).toBeLessThan(510);
    expect(sc.stats1.duty!).toBeGreaterThan(0.2);
    expect(sc.stats1.duty!).toBeLessThan(0.3);
    expect(sc.stats2.mean).toBeGreaterThan(1.0);
    expect(sc.stats2.mean).toBeLessThan(1.5);
  });

  it("plotter: prints two labelled series that parse cleanly", () => {
    const t = boot("plotter");
    t.step(2);
    const series = parseSeries(t.serial);
    expect(series.map((x) => x.name)).toEqual(["knob", "wave"]);
    expect(series[0].values.length).toBeGreaterThan(30);
    expect(Math.max(...series[1].values)).toBeGreaterThan(700);
    expect(Math.min(...series[1].values)).toBeLessThan(300);
  });
});

describe("serial plotter parsing", () => {
  it("handles bare numbers, labels, mixed separators and junk lines", () => {
    expect(parseSeries("1 2\n3,4\n5\t6\n")).toEqual([
      { name: "value 1", values: [1, 3, 5] },
      { name: "value 2", values: [2, 4, 6] },
    ]);
    expect(parseSeries("temp:21.5 hum:40\nhello world\ntemp:22 hum:41\n").map((s) => s.name)).toEqual(["temp", "hum"]);
    expect(parseSeries("-3.5e2\n")[0].values).toEqual([-350]);
    expect(parseSeries("")).toEqual([]);
  });

  it("ignores a half-printed last line", () => {
    expect(parseSeries("1\n2\n3")[0].values).toEqual([1, 2]);
  });
});
