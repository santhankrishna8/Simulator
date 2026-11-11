import { describe, expect, it } from "vitest";
import { bjtCurrents, makeState, solve, type Elem } from "./solver";

const settle = (nodes: number, elems: Elem[], seconds: number, dt = 0.0002) => {
  const st = makeState(elems);
  let v: Float64Array = new Float64Array(nodes);
  for (let t = 0; t < seconds; t += dt) v = solve(nodes, elems, st, dt);
  return { v, st };
};

describe("NPN transistor", () => {
  // Nodes: 1 = 5 V rail, 2 = base drive, 3 = collector, 4 = base. Emitter is ground (0).
  const bjt = (rb: number): Elem[] => [
    { k: "V", a: 1, b: 0, v: 5, r: 0.01, part: "bat" },
    { k: "V", a: 2, b: 0, v: 5, r: 0.01, part: "drv" },
    { k: "R", a: 2, b: 4, r: rb },
    { k: "R", a: 1, b: 3, r: 330 },
    { k: "Q", c: 3, b: 4, e: 0, is: 1e-14, bf: 200, br: 2, part: "q" },
  ];

  it("saturates when the base is driven hard, pulling the collector near ground", () => {
    const { v } = settle(5, bjt(1000), 0.01);
    expect(v[4]).toBeGreaterThan(0.6);
    expect(v[4]).toBeLessThan(0.85); // base-emitter drop
    expect(v[3]).toBeLessThan(0.3); // collector saturated (Vce(sat))
  });

  it("is off with no base drive", () => {
    const elems = bjt(1000);
    (elems[1] as { v: number }).v = 0;
    const { v } = settle(5, elems, 0.01);
    expect(v[3]).toBeGreaterThan(4.99);
  });

  it("amplifies in the active region with gain close to bf", () => {
    // 5 V through 100 k into the base gives Ib about 43 uA; a 10 ohm collector load keeps it out of saturation.
    const elems: Elem[] = [
      { k: "V", a: 1, b: 0, v: 5, r: 0.01, part: "bat" },
      { k: "R", a: 1, b: 4, r: 100_000 },
      { k: "R", a: 1, b: 3, r: 10 },
      { k: "Q", c: 3, b: 4, e: 0, is: 1e-14, bf: 200, br: 2, part: "q" },
    ];
    const { v, st } = settle(5, elems, 0.01);
    const { ic, ib } = bjtCurrents(elems[3] as Extract<Elem, { k: "Q" }>, st.vd[3], st.vd2[3]);
    expect(ib).toBeGreaterThan(30e-6);
    expect(ib).toBeLessThan(60e-6);
    expect(ic / ib).toBeGreaterThan(150);
    expect(ic / ib).toBeLessThan(210);
    expect(v[3]).toBeGreaterThan(3); // still active, not saturated
  });
});

describe("inductor", () => {
  it("ramps current with time constant L/R", () => {
    // 5 V -> 70 ohm -> 60 mH -> ground. tau = 0.857 ms; final current 71.4 mA.
    const elems: Elem[] = [
      { k: "V", a: 1, b: 0, v: 5, r: 0.001, part: "bat" },
      { k: "R", a: 1, b: 2, r: 70 },
      { k: "L", a: 2, b: 0, l: 0.06, part: "coil" },
    ];
    const tau = 0.06 / 70;
    const early = settle(3, elems, tau, 0.00002);
    expect(early.st.il[2] / (5 / 70)).toBeGreaterThan(0.6);
    expect(early.st.il[2] / (5 / 70)).toBeLessThan(0.66); // about 63 %
    const late = settle(3, elems, 10 * tau, 0.00002);
    expect(late.st.il[2]).toBeCloseTo(5 / 70, 3);
  });
});
