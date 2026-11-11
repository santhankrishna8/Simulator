import { describe, expect, it } from "vitest";
import { CPU_HZ, Mcu, parseHex } from "./mcu";
import { PREBUILT } from "./prebuilt.generated";

const boot = (id: keyof typeof PREBUILT) => new Mcu(parseHex(PREBUILT[id]));
const text = (m: Mcu) => new TextDecoder().decode(m.takeOutput());

describe("ATmega328P emulation", () => {
  it("blink toggles pin 13 once a second", () => {
    const m = boot("blink");
    const edges: number[] = [];
    let last = "";
    for (let ms = 0; ms < 3500; ms++) {
      m.run(CPU_HZ / 1000);
      const mode = m.pinMode(13);
      if (mode !== last && last) edges.push(ms);
      last = mode;
    }
    expect(m.pinMode(13) === "high" || m.pinMode(13) === "low").toBe(true);
    // Edges (including the initial input -> output change) about 500 ms apart.
    const gaps = edges.slice(1).map((e, i) => e - edges[i]);
    expect(gaps.length).toBeGreaterThanOrEqual(5);
    for (const g of gaps) expect(Math.abs(g - 500)).toBeLessThanOrEqual(3);
  });

  it("prints over serial", () => {
    const m = boot("serial");
    m.run(CPU_HZ / 10);
    expect(text(m)).toContain("Type 1 to turn the LED on");
  });

  it("reads serial input and acts on it", () => {
    const m = boot("serial");
    m.run(CPU_HZ / 10);
    text(m);
    m.receive("1");
    for (let i = 0; i < 200; i++) {
      m.pumpSerial();
      m.run(CPU_HZ / 1000);
    }
    expect(text(m)).toContain("LED on");
    expect(m.pinMode(13)).toBe("high");
  });

  it("reads an analog voltage", () => {
    const m = boot("knob");
    m.adc.channelValues[0] = 2.5;
    m.run(CPU_HZ / 2);
    const out = text(m);
    expect(out).toMatch(/reading 51\d {3}2\.5\d V/);
  });

  it("sees a pulled-up button go low", () => {
    const m = boot("button");
    m.run(CPU_HZ / 100);
    expect(m.pinMode(2)).toBe("pullup");
    m.setInput(2, true);
    m.run(CPU_HZ / 100);
    expect(m.pinMode(8)).toBe("low");
    m.setInput(2, false);
    m.run(CPU_HZ / 100);
    expect(m.pinMode(8)).toBe("high");
    expect(text(m)).toContain("Button pressed");
  });

  it("runs faster than real time", () => {
    const m = boot("fade");
    const t0 = performance.now();
    m.run(CPU_HZ); // one simulated second
    const ms = performance.now() - t0;
    console.log(`1 simulated second of Fade took ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(2000);
  });
});
