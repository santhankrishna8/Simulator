import { describe, expect, it } from "vitest";
import { EXAMPLES } from "@/sim/examples";
import { buildGuide, holeLabel } from "./guide";

const guideOf = (id: string) => buildGuide(EXAMPLES.find((e) => e.id === id)!.doc);
const text = (g: ReturnType<typeof buildGuide>) => JSON.stringify(g);

describe("hole labels", () => {
  it("read like the numbers and letters printed on the breadboard", () => {
    expect(holeLabel("5_14")).toBe("i5");
    expect(holeLabel("12_4")).toBe("a12");
    expect(holeLabel("30_8")).toBe("e30");
    expect(holeLabel("1_11")).toBe("f1");
    expect(holeLabel("5_17")).toBe("bottom + rail, near column 5");
    expect(holeLabel("7_2")).toBe("top − rail, near column 7");
  });
});

describe("build guide", () => {
  it("lists what to buy, merged and counted, with real-world names", () => {
    const g = guideOf("blink");
    const names = g.bom.map((b) => b.name);
    expect(names).toContain("Arduino Uno R3");
    expect(names).toContain("330 Ω resistor, ¼ W, 5%");
    expect(names).toContain("5 mm LED, red");
    expect(names).toContain("Half-size solderless breadboard");
    expect(g.bom.find((b) => b.name === "Jumper wires")?.qty).toBe(3);
    expect(g.bom.find((b) => b.name.includes("resistor"))?.note).toBe("colour bands: orange, orange, brown, gold");
  });

  it("says where each leg goes in breadboard coordinates", () => {
    const g = guideOf("blink");
    expect(g.placements.find((p) => p.part.startsWith("330"))?.legs).toBe("Lead 1 → g5, Lead 2 → g9");
    expect(g.placements.find((p) => p.part.startsWith("5 mm LED"))?.legs).toMatch(/Anode → f9, Cathode → f10/);
    expect(g.placements.find((p) => p.part === "Arduino Uno R3")?.legs).toMatch(/not on the breadboard/);
  });

  it("describes every wire from end to end with its colour", () => {
    const g = guideOf("blink");
    expect(g.wires).toHaveLength(3);
    expect(g.wires.map((w) => w.n)).toEqual([1, 2, 3]);
    expect(g.wires.some((w) => /Arduino/.test(w.from + w.to) && /i5|h5|j5/.test(w.from + w.to))).toBe(true);
    expect(g.wires.some((w) => w.color === "orange")).toBe(true);
  });

  it("adds safety checks that match the parts", () => {
    expect(guideOf("blink").checks.join(" ")).toMatch(/resistor in series/);
    expect(guideOf("relay").checks.join(" ")).toMatch(/mains/);
    expect(guideOf("relay").checks.join(" ")).not.toMatch(/Add a diode across the relay coil/); // the example already has one
    const noDiode = EXAMPLES.find((e) => e.id === "relay")!.doc;
    const g = buildGuide({ ...noDiode, parts: noDiode.parts.filter((p) => p.id !== "d1") });
    expect(g.checks.join(" ")).toMatch(/diode across the relay coil/);
    expect(guideOf("servo").checks.join(" ")).toMatch(/draw far more current/);
    expect(guideOf("lcdhello").checks.join(" ")).toMatch(/contrast/);
    expect(guideOf("rc").checks.join(" ")).toMatch(/Connect the battery last/);
    expect(guideOf("rc").checks.join(" ")).toMatch(/polarised/);
  });

  it("works for every example without leaking internal ids", () => {
    for (const e of EXAMPLES) {
      const g = buildGuide(e.doc);
      expect(g.bom.length, e.id).toBeGreaterThan(0);
      expect(g.checks.length, e.id).toBeGreaterThan(1);
      expect(text(g), e.id).not.toMatch(/\bp\d+\b|ex-w\d|undefined|NaN/);
    }
  });

  it("is honest about instruments and part-less benches", () => {
    expect(guideOf("pwmscope").bom.find((b) => b.name === "Oscilloscope")?.note).toMatch(/not a part of the circuit/);
    expect(buildGuide({ parts: [], wires: [] }).bom).toEqual([]);
  });
});
