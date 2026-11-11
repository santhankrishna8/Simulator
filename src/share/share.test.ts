import { describe, expect, it } from "vitest";
import { LESSONS, solutionChain } from "@/lessons";
import { CATALOG } from "@/sim/catalog";
import { EXAMPLES } from "@/sim/examples";
import { decodeProject, encodeProject, projectFile, readProjectFile } from "./codec";
import { LIMITS, sanitizeProject, type Project } from "./sanitize";

const ok = (r: Awaited<ReturnType<typeof decodeProject>>) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("share links", () => {
  it("round-trip every example and every lesson state exactly", async () => {
    const projects: Project[] = [
      ...EXAMPLES.map((e) => ({ doc: e.doc, code: e.sketch ?? "" })),
      ...LESSONS.flatMap((l) => solutionChain(l)),
    ];
    for (const p of projects) {
      const back = ok(await decodeProject(await encodeProject(p)));
      expect(back.dropped).toEqual([]);
      expect(back.project.doc.parts.map((x) => [x.id, x.type, x.x, x.y, x.rot])).toEqual(p.doc.parts.map((x) => [x.id, x.type, x.x, x.y, x.rot]));
      expect(back.project.doc.wires.map((w) => [w.id, w.a, w.b, w.color])).toEqual(p.doc.wires.map((w) => [w.id, w.a, w.b, w.color]));
      expect(back.project.code).toBe(p.code);
      // A part left without settings comes back with its defaults filled in, which is what we want.
      for (const part of p.doc.parts) expect(back.project.doc.parts.find((x) => x.id === part.id)!.props).toEqual({ ...CATALOG[part.type].defaults, ...part.props });
    }
  });

  it("are short: a typical bench fits comfortably in a link", async () => {
    const e = EXAMPLES.find((x) => x.id === "lcdhello")!;
    const link = await encodeProject({ doc: e.doc, code: e.sketch ?? "" });
    expect(link.length).toBeLessThan(3000);
    expect(link).toMatch(/^1\.[A-Za-z0-9_-]+$/); // safe to put after a # with no escaping
  });

  it("explain a damaged or foreign link instead of crashing", async () => {
    expect((await decodeProject("")).ok).toBe(false);
    expect((await decodeProject("not a link")).ok).toBe(false);
    expect((await decodeProject("9.abcd")).ok).toBe(false);
    const full = await encodeProject({ doc: EXAMPLES[0].doc, code: "" });
    const cut = await decodeProject(full.slice(0, Math.floor(full.length / 2)));
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.error).toMatch(/cut short|not complete/);
    expect((await decodeProject("1.AAAA")).ok).toBe(false);
  });

  it("refuse a compression bomb before parsing it", async () => {
    // A megabyte of one character compresses to almost nothing.
    const bomb = await (async () => {
      const raw = new TextEncoder().encode(JSON.stringify({ v: 1, doc: { parts: [], wires: [] }, code: "a".repeat(2_000_000) }));
      const cs = new CompressionStream("deflate-raw");
      const w = cs.writable.getWriter();
      void w.write(raw).then(() => w.close());
      const out: number[] = [];
      const r = cs.readable.getReader();
      for (;;) { const { done, value } = await r.read(); if (done) break; out.push(...value); }
      let s = "";
      for (const b of out) s += String.fromCharCode(b);
      return `1.${btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
    })();
    expect(bomb.length).toBeLessThan(10_000);
    const r = await decodeProject(bomb);
    expect(r.ok).toBe(false);
  });
});

describe("sanitizing a project from outside", () => {
  const good = { doc: EXAMPLES[0].doc, code: "" };

  it("keeps a valid project untouched", () => {
    const r = sanitizeProject(structuredClone(good));
    expect(r.ok && r.dropped).toEqual([]);
  });

  it("drops parts and wires it does not recognise, and says so", () => {
    const evil = structuredClone(good) as { doc: { parts: unknown[]; wires: unknown[] }; code: string };
    evil.doc.parts.push({ id: "x1", type: "nuclear-reactor", x: 0, y: 0, rot: 0, props: {} });
    evil.doc.parts.push({ id: "__proto__", type: "led", x: 0, y: 0, rot: 0, props: {} });
    evil.doc.parts.push({ id: "bad pos", type: "led", x: 1e12, y: 0, rot: 0, props: {} });
    evil.doc.parts.push({ id: "nan", type: "led", x: NaN, y: 0, rot: 0, props: {} });
    evil.doc.wires.push({ id: "w-bad", a: { part: "ghost", pin: "x" }, b: { part: "bb", pin: "1_1" }, color: "red" });
    evil.doc.wires.push({ id: "w-pin", a: { part: "bb", pin: "99_99" }, b: { part: "bb", pin: "1_1" }, color: "#000000" });
    const r = sanitizeProject(evil);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.doc.parts).toHaveLength(good.doc.parts.length);
      expect(r.project.doc.wires).toHaveLength(good.doc.wires.length);
      expect(r.dropped.length).toBe(6);
    }
  });

  it("clamps values to what the part allows and falls back to its defaults", () => {
    const r = sanitizeProject({
      doc: {
        parts: [
          { id: "r", type: "resistor", x: 0, y: 0, rot: 7, props: { ohms: -5, evil: "<script>alert(1)</script>" } },
          { id: "l", type: "led", x: 0, y: 0, rot: 0, props: { color: "ultraviolet" } },
          { id: "p", type: "pot", x: 0, y: 0, rot: 0, props: { t: 9, ohms: 1e12 } },
          { id: "c", type: "hcsr04", x: 0, y: 0, rot: 0, props: { cm: 100000 } },
        ],
        wires: [],
      },
      code: "",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const by = (id: string) => r.project.doc.parts.find((p) => p.id === id)!;
    expect(by("r").rot).toBe(0);
    expect(by("r").props).toEqual({ ohms: 220 }); // the default; the junk key is gone
    expect(by("l").props.color).toBe("red");
    expect(by("p").props.t).toBe(0.5);
    expect(by("p").props.ohms).toBe(10000);
    expect(by("c").props.cm).toBe(100);
  });

  it("refuses the wrong shape, oversized benches and oversized sketches", () => {
    for (const bad of [null, 5, "x", [], {}, { doc: 1 }, { doc: { parts: {}, wires: [] } }]) expect(sanitizeProject(bad).ok).toBe(false);
    const many = { doc: { parts: Array.from({ length: LIMITS.parts + 1 }, (_, i) => ({ id: `p${i}`, type: "led", x: 0, y: 0, rot: 0, props: {} })), wires: [] }, code: "" };
    expect(sanitizeProject(many).ok).toBe(false);
    expect(sanitizeProject({ ...good, code: "x".repeat(LIMITS.code + 1) }).ok).toBe(false);
    expect(sanitizeProject({ doc: { parts: [], wires: [] }, code: "" }).ok).toBe(false);
  });

  it("does not let a project pollute object prototypes", () => {
    const polluted = JSON.parse('{"doc":{"parts":[{"id":"a","type":"led","x":0,"y":0,"rot":0,"props":{"__proto__":{"polluted":true},"color":"red"}}],"wires":[]},"code":""}');
    const r = sanitizeProject(polluted);
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("project files", () => {
  it("save and open", async () => {
    const e = EXAMPLES.find((x) => x.id === "blink")!;
    const text = projectFile({ doc: e.doc, code: e.sketch! });
    const back = readProjectFile(text);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.project.code).toBe(e.sketch);
    expect(readProjectFile("not json").ok).toBe(false);
    expect(readProjectFile("x".repeat(500_000)).ok).toBe(false);
  });
});
