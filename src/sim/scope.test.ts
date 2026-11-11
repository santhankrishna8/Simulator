import { describe, expect, it } from "vitest";
import { ScopeBuf, measure, scopeView } from "./scope";

/** Fill a buffer with a square wave: `freq` Hz, `duty`, 0 to 5 V, sampled every `dt`. */
function square(freq: number, duty: number, seconds: number, dt = 0.0002, second?: (t: number) => number) {
  const buf = new ScopeBuf(32768);
  for (let t = 0; t < seconds; t += dt) {
    const phase = (t * freq) % 1;
    buf.push(t, phase < duty ? 5 : 0, second ? second(t) : 0);
  }
  return buf;
}

describe("oscilloscope", () => {
  it("measures a PWM wave's frequency, duty cycle and swing", () => {
    const view = scopeView(square(490, 0.25, 0.5, 0.0001), 0.002, 2.5);
    expect(view.triggered).toBe(true);
    expect(view.stats1.vpp).toBeCloseTo(5, 1);
    expect(view.stats1.freq!).toBeGreaterThan(480);
    expect(view.stats1.freq!).toBeLessThan(500);
    expect(view.stats1.duty!).toBeGreaterThan(0.22);
    expect(view.stats1.duty!).toBeLessThan(0.28);
  });

  it("holds the picture still by triggering on a rising edge", () => {
    const first = scopeView(square(100, 0.5, 0.31), 0.002, 2.5);
    const later = scopeView(square(100, 0.5, 0.337), 0.002, 2.5);
    const edge = (v: ReturnType<typeof scopeView>) => v.t[v.ch1.findIndex((x) => x > 2.5)];
    // The first rising edge sits one division in, whatever moment the buffer ends at.
    expect(Math.abs(edge(first) - 0.002)).toBeLessThan(0.0004);
    expect(Math.abs(edge(later) - 0.002)).toBeLessThan(0.0004);
  });

  it("free-runs when there is nothing to trigger on", () => {
    const buf = new ScopeBuf(1024);
    for (let i = 0; i < 400; i++) buf.push(i * 0.0002, 3, 0);
    const view = scopeView(buf, 0.002, 2.5);
    expect(view.triggered).toBe(false);
    expect(view.stats1.mean).toBeCloseTo(3, 3);
    expect(view.stats1.freq).toBeUndefined();
  });

  it("shows the window the timebase asks for", () => {
    const view = scopeView(square(50, 0.5, 1), 0.005, 2.5); // 50 ms across
    expect(view.t[view.t.length - 1]).toBeGreaterThan(0.048);
    expect(view.t[view.t.length - 1]).toBeLessThan(0.052);
  });

  it("thins long captures without losing narrow spikes", () => {
    const buf = new ScopeBuf(65536);
    for (let i = 0; i < 20000; i++) buf.push(i * 0.0001, i === 10000 ? 5 : 0, 0);
    const view = scopeView(buf, 0.2, 9); // 2 s window, no trigger
    expect(view.t.length).toBeLessThanOrEqual(1000);
    expect(Math.max(...view.ch1)).toBe(5);
  });

  it("measures two channels independently", () => {
    const view = scopeView(square(200, 0.5, 0.3, 0.0001, (t) => 1 + Math.sin(t * 2 * Math.PI * 200)), 0.001, 2.5);
    expect(view.stats2.vpp).toBeGreaterThan(1.8);
    expect(view.stats2.vpp).toBeLessThan(2.05);
    expect(view.stats2.mean).toBeGreaterThan(0.8);
    expect(view.stats2.mean).toBeLessThan(1.2);
  });

  it("measure() copes with flat and empty input", () => {
    expect(measure([], [])).toEqual({ vpp: 0, mean: 0 });
    expect(measure([0, 1], [3, 3]).freq).toBeUndefined();
  });
});
