import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, ROOT } from "../../compile-service/compile.mjs";
import { Engine, type Snapshot } from "./engine";
import type { Doc, Part, Wire } from "./model";
import { PREBUILT } from "./prebuilt.generated";
import { OLED_H, OLED_W, Ssd1306, pixel } from "./ssd1306";

/* ---------- the controller alone ---------- */

/** Send a transaction the way the Adafruit library does. */
const cmds = (chip: Ssd1306, ...bytes: number[]) => {
  chip.start();
  chip.write(0x00);
  for (const b of bytes) chip.write(b);
  chip.stop();
};
const data = (chip: Ssd1306, ...bytes: number[]) => {
  chip.start();
  chip.write(0x40);
  for (const b of bytes) chip.write(b);
  chip.stop();
};
const lit = (chip: Ssd1306) => {
  const s = chip.snapshot();
  const out: string[] = [];
  for (let y = 0; y < OLED_H; y++) for (let x = 0; x < OLED_W; x++) if (pixel(s, x, y)) out.push(`${x},${y}`);
  return out;
};
const raw = (chip: Ssd1306) => chip.snapshot().gddram;

describe("SSD1306 controller", () => {
  it("stays dark until it is switched on and its charge pump is running", () => {
    const c = new Ssd1306();
    expect(c.snapshot().lit).toBe(false);
    cmds(c, 0xaf);
    expect(c.snapshot().lit).toBe(false); // on, but the pump is off
    cmds(c, 0x8d, 0x14);
    expect(c.snapshot().lit).toBe(true);
    cmds(c, 0x8d, 0x10);
    expect(c.snapshot().lit).toBe(false); // EXTERNALVCC on a module with no external supply
    cmds(c, 0x8d, 0x14, 0xae);
    expect(c.snapshot().lit).toBe(false);
  });

  it("writes in horizontal mode, wrapping at the end of a row into the next page", () => {
    const c = new Ssd1306();
    cmds(c, 0x20, 0x00, 0x21, 0, 127, 0x22, 0, 7);
    data(c, ...new Array(130).fill(0xff));
    const r = raw(c);
    expect(r[127]).toBe(0xff);
    expect(r[128]).toBe(0xff); // page 1, column 0
    expect(r[129]).toBe(0xff);
    expect(r[130]).toBe(0);
  });

  it("honours a narrow window and wraps inside it", () => {
    const c = new Ssd1306();
    cmds(c, 0x20, 0x00, 0x21, 10, 12, 0x22, 2, 3);
    data(c, 1, 2, 3, 4, 5, 6, 7);
    const r = raw(c);
    // Three columns by two pages hold six bytes; the seventh wraps back and replaces the first.
    expect([r[2 * 128 + 10], r[2 * 128 + 11], r[2 * 128 + 12]]).toEqual([7, 2, 3]);
    expect([r[3 * 128 + 10], r[3 * 128 + 11], r[3 * 128 + 12]]).toEqual([4, 5, 6]);
    expect(r[2 * 128 + 13]).toBe(0); // outside the window, untouched
  });

  it("writes in page mode along one page only, and positions with page and column commands", () => {
    const c = new Ssd1306();
    cmds(c, 0x20, 0x02, 0xb3, 0x05, 0x11); // page 3, column 0x15 = 21
    data(c, 9, 8);
    const r = raw(c);
    expect(r[3 * 128 + 21]).toBe(9);
    expect(r[3 * 128 + 22]).toBe(8);
  });

  it("writes in vertical mode down a column first", () => {
    const c = new Ssd1306();
    cmds(c, 0x20, 0x01, 0x21, 5, 6, 0x22, 0, 7);
    data(c, ...Array.from({ length: 9 }, (_, i) => i + 1));
    const r = raw(c);
    for (let p = 0; p < 8; p++) expect(r[p * 128 + 5]).toBe(p + 1);
    expect(r[0 * 128 + 6]).toBe(9);
  });

  it("accepts the 0x80 and 0xC0 control bytes that put a control byte before each byte", () => {
    const c = new Ssd1306();
    c.start();
    c.write(0x80); c.write(0xaf); // Co=1, command: display on
    c.write(0x80); c.write(0x8d); // pending parameter follows its own control byte
    c.write(0x80); c.write(0x14);
    c.write(0xc0); c.write(0xaa);
    c.write(0xc0); c.write(0x55);
    c.stop();
    expect(c.snapshot().lit).toBe(true);
    expect(raw(c)[0]).toBe(0xaa);
    expect(raw(c)[1]).toBe(0x55);
  });

  it("draws upright with the commands the Adafruit library sends, and turned 180 degrees with the defaults", () => {
    const c = new Ssd1306();
    cmds(c, 0x20, 0x00, 0x21, 0, 127, 0x22, 0, 7);
    data(c, 0x01); // column 0, page 0, top pixel
    // Chip defaults: the picture is turned 180 degrees, so memory (0,0) shows at the bottom right.
    expect(lit(c)).toEqual([`${OLED_W - 1},${OLED_H - 1}`]);
    cmds(c, 0xa1, 0xc8); // segment remap and reversed COM scan, as the library sets for 128x64
    expect(lit(c)).toEqual(["0,0"]);
  });

  it("inverts and lights everything on request, and forgets nothing else", () => {
    const c = new Ssd1306();
    cmds(c, 0xa1, 0xc8, 0xa5);
    expect(lit(c)).toHaveLength(OLED_W * OLED_H);
    cmds(c, 0xa4, 0xa7);
    expect(lit(c)).toHaveLength(OLED_W * OLED_H); // all-zero memory, inverted
    cmds(c, 0x81, 0x20);
    expect(c.snapshot().contrast).toBe(0x20);
  });
});

/* ---------- on the Uno's I²C bus ---------- */

let n = 0;
const part = (type: Part["type"], id: string, props: Part["props"] = {}): Part => ({ id, type, x: 0, y: 0, rot: 0, props });
const wire = (a: string, b: string): Wire => {
  const [pa, ia] = a.split("."), [pb, ib] = b.split(".");
  return { id: `w${n++}`, a: { part: pa, pin: ia }, b: { part: pb, pin: ib }, color: "#000" };
};

const oledDoc = (opts: { address?: string; sda?: string; scl?: string; power?: boolean; pot?: number | "vcc" } = {}): Doc => {
  const { address = "0x3C", sda = "uno.a4", scl = "uno.a5", power = true, pot } = opts;
  const doc: Doc = {
    parts: [part("uno", "uno"), part("oled", "oled", { address, color: "white" })],
    wires: [wire("oled.gnd", "uno.gnd1"), wire("oled.sda", sda), wire("oled.scl", scl)],
  };
  if (power) doc.wires.push(wire("oled.vcc", "uno.5v"));
  if (pot === "vcc") doc.wires.push(wire("uno.a0", "uno.5v"));
  return doc;
};

function rig(doc: Doc, hex: string) {
  const e = new Engine();
  e.loadProgram(hex);
  let serial = "";
  return {
    run(seconds: number): Snapshot {
      let last!: Snapshot;
      for (let k = 0; k < Math.round(seconds / 0.01); k++) {
        last = e.advance(doc, new Set(), 0.01);
        serial += e.takeSerial();
      }
      return last;
    },
    get serial() { return serial; },
  };
}

describe("I²C scanner", () => {
  it("finds the OLED at its address", () => {
    const r = rig(oledDoc(), PREBUILT.i2cscan);
    r.run(1.5);
    expect(r.serial).toContain("Scanning the I2C bus...");
    expect(r.serial).toContain("Found a device at 0x3C");
    expect(r.serial).not.toContain("0x3D");
    expect(r.serial).toContain("Done.");
  });

  it("finds it at 0x3D when the address jumper is moved", () => {
    const r = rig(oledDoc({ address: "0x3D" }), PREBUILT.i2cscan);
    r.run(1.5);
    expect(r.serial).toContain("Found a device at 0x3D");
    expect(r.serial).not.toContain("0x3C");
  });

  it("finds nothing when SDA is wired to the wrong pin, or the power is missing", () => {
    for (const doc of [oledDoc({ sda: "uno.a2" }), oledDoc({ scl: "uno.d13" }), oledDoc({ power: false })]) {
      const r = rig(doc, PREBUILT.i2cscan);
      r.run(1.5);
      expect(r.serial).toContain("No devices found");
    }
  });

  it("takes realistic time: a scan of 126 addresses at 100 kHz is not instant", () => {
    const r = rig(oledDoc(), PREBUILT.i2cscan);
    r.run(0.05);
    expect(r.serial).not.toContain("Done."); // 126 addresses at about 100 µs each needs over 12 ms plus the serial output
    r.run(1);
    expect(r.serial).toContain("Done.");
  });
});

describe("OLED sketch", () => {
  const picture = (s: Snapshot) => {
    const o = s.parts.oled.oled!;
    const rows: string[] = [];
    for (let y = 0; y < OLED_H; y++) {
      let line = "";
      for (let x = 0; x < OLED_W; x++) line += pixel(o, x, y) ? "#" : ".";
      rows.push(line);
    }
    return rows;
  };
  const count = (rows: string[], x0: number, y0: number, x1: number, y1: number) => {
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (rows[y][x] === "#") n++;
    return n;
  };

  it("lights up and draws the text in the top-left, upright", () => {
    const r = rig(oledDoc(), PREBUILT.oledhello);
    const s = r.run(2.2);
    expect(s.parts.oled.oled!.lit).toBe(true);
    expect(s.parts.oled.extra?.Display).toBe("On");
    const rows = picture(s);
    // "Hello," and "OLED!" at text size 2: the top 32 rows have the text, the left of the screen is busy.
    expect(count(rows, 0, 0, 80, 32)).toBeGreaterThan(150);
    expect(count(rows, 100, 0, 128, 32)).toBeLessThan(count(rows, 0, 0, 80, 32) / 4);
    // The bar's outline is a 128 x 16 rectangle at y 42..57.
    expect(rows[42].slice(0, 128)).toBe("#".repeat(128));
    expect(rows[57].slice(0, 128)).toBe("#".repeat(128));
    expect(rows[50][0]).toBe("#");
    expect(rows[50][127]).toBe("#");
  });

  it("fills the bar as the knob turns", () => {
    const empty = picture(rig(oledDoc(), PREBUILT.oledhello).run(2.2));
    const full = picture(rig(oledDoc({ pot: "vcc" }), PREBUILT.oledhello).run(2.2));
    expect(count(empty, 2, 44, 126, 56)).toBeLessThan(20);
    expect(count(full, 2, 44, 126, 56)).toBeGreaterThan(124 * 12 - 40);
  });

  it("shows nothing when it is not wired, and the sketch cannot tell (as with the real library)", () => {
    const r = rig(oledDoc({ sda: "uno.a2" }), PREBUILT.oledhello);
    const s = r.run(1.5);
    expect(r.serial).toBe(""); // begin() only checks memory, so the sketch carries on
    expect(s.parts.oled.oled!.lit).toBe(false);
    expect(s.parts.oled.oled!.version).toBe(0); // nothing ever reached the display
    expect(s.parts.oled.extra?.Bus).toMatch(/not wired/);
    expect(s.warnings.some((w) => w.id === "i2c-oled")).toBe(true);
  });

  it("is blank and warns when it has no power", () => {
    const s = rig(oledDoc({ power: false }), PREBUILT.oledhello).run(1);
    expect(s.parts.oled.extra?.Display).toBe("No power");
    expect(s.warnings.some((w) => w.id === "nopower-oled")).toBe(true);
  });

  it("draws about ten frames a second, as the bus speed allows", () => {
    const e = new Engine();
    e.loadProgram(PREBUILT.oledhello);
    const doc = oledDoc();
    let start = 0;
    for (let k = 0; k < 400; k++) {
      const s = e.advance(doc, new Set(), 0.01);
      if (k === 100) start = s.parts.oled.oled!.frames;
      if (k === 399) {
        // 1024 bytes at 9 clock pulses of 2.5 µs (the library asks for 400 kHz) is about 25 ms, plus the draw work.
        const perSecond = (s.parts.oled.oled!.frames - start) / 3;
        expect(perSecond).toBeGreaterThan(6);
        expect(perSecond).toBeLessThan(25);
      }
    }
  });
});

describe.skipIf(!existsSync(`${ROOT}/build/core.a`))("with the compiler", () => {
  const dark = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
void setup() {
  display.begin(SSD1306_EXTERNALVCC, 0x3C);
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.println("Hi");
  display.display();
}
void loop() {}
`;

  it("the wrong begin() argument leaves the screen dark, and the inspector says why", async () => {
    const r = await compile(dark);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = rig(oledDoc(), r.hex).run(1.5);
    const o = s.parts.oled.oled!;
    expect(o.displayOn).toBe(true);
    expect(o.pumpOn).toBe(false);
    expect(o.lit).toBe(false);
    expect(s.parts.oled.extra?.Display).toMatch(/charge pump is off/);
  });
});
