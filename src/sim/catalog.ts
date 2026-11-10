/**
 * Parts catalog. All geometry is in grid units, where 1 unit = 0.1 inch
 * (2.54 mm), the pitch of a breadboard. Parts are drawn to that scale.
 */

export type PartType =
  | "breadboard"
  | "battery9v"
  | "batteryAA2"
  | "batteryAA4"
  | "coincell"
  | "resistor"
  | "led"
  | "diode"
  | "capacitor"
  | "button"
  | "switch"
  | "pot"
  | "ldr"
  | "buzzer"
  | "motor"
  | "meter";

export interface PinDef {
  id: string;
  x: number;
  y: number;
  label: string;
}

export interface PropDef {
  key: string;
  label: string;
  kind: "ohms" | "farads" | "choice" | "range";
  options?: { value: string; label: string }[];
  /** Range props are 0..1 and can be changed while the simulation runs. */
  live?: boolean;
  lowLabel?: string;
  highLabel?: string;
}

export interface Learn {
  what: string;
  wiring: string;
  limits: string;
}

export interface PartDef {
  type: PartType;
  name: string;
  category: "Boards" | "Power" | "Basics" | "Input" | "Output" | "Instruments";
  /** One-line description for the parts drawer. */
  blurb: string;
  pins: PinDef[];
  /** Bounding box in local grid units, used for selection and thumbnails. */
  box: { x: number; y: number; w: number; h: number };
  defaults: Record<string, number | string>;
  props: PropDef[];
  learn: Learn;
}

/* ---------- Breadboard geometry (half-size, 400 tie points) ---------- */

export const BB_COLS = 30;
export const BB_W = BB_COLS + 1;
export const BB_H = 19;
const RAIL_ROWS: Record<number, string> = { 1: "tp", 2: "tn", 17: "bp", 18: "bn" };
export const ROW_LETTERS: Record<number, string> = {
  4: "a", 5: "b", 6: "c", 7: "d", 8: "e",
  11: "f", 12: "g", 13: "h", 14: "i", 15: "j",
};

export interface Hole extends PinDef {
  /** Holes sharing a strip id are joined by a metal clip inside the board. */
  strip: string;
}

function buildHoles(): Hole[] {
  const holes: Hole[] = [];
  for (let x = 1; x <= BB_COLS; x++) {
    for (const y of [1, 2, 17, 18]) {
      if ((x - 1) % 6 === 5) continue; // rails come in groups of five
      const strip = RAIL_ROWS[y];
      const sign = strip.endsWith("p") ? "+" : "−";
      holes.push({ id: `${x}_${y}`, x, y, strip, label: `${sign} rail` });
    }
    for (let y = 4; y <= 8; y++) holes.push({ id: `${x}_${y}`, x, y, strip: `u${x}`, label: `${ROW_LETTERS[y]}${x}` });
    for (let y = 11; y <= 15; y++) holes.push({ id: `${x}_${y}`, x, y, strip: `l${x}`, label: `${ROW_LETTERS[y]}${x}` });
  }
  return holes;
}

export const HOLES: Hole[] = buildHoles();
export const HOLE_BY_ID = new Map(HOLES.map((h) => [h.id, h]));

/* ---------- LED colours ---------- */

export interface LedSpec {
  label: string;
  /** Forward voltage at 20 mA. */
  vf: number;
  lit: string;
  body: string;
}

export const LED_COLORS: Record<string, LedSpec> = {
  red: { label: "Red", vf: 1.9, lit: "#ff3b30", body: "#c8242b" },
  yellow: { label: "Yellow", vf: 2.05, lit: "#ffd21f", body: "#d9a400" },
  green: { label: "Green", vf: 2.15, lit: "#34e06b", body: "#1f9a48" },
  blue: { label: "Blue", vf: 3.0, lit: "#3d8bff", body: "#1f58c9" },
  white: { label: "White", vf: 3.1, lit: "#f4f8ff", body: "#d5dbe2" },
};

/* ---------- Battery specs ---------- */

export interface BatterySpec {
  volts: number;
  /** Internal resistance in ohms; this is why voltage sags under load. */
  rint: number;
  capacityMah: number;
  /** Above this current we call it a short circuit. */
  shortAmps: number;
}

export const BATTERIES: Record<string, BatterySpec> = {
  battery9v: { volts: 9, rint: 1.7, capacityMah: 550, shortAmps: 1 },
  batteryAA2: { volts: 3, rint: 0.3, capacityMah: 2500, shortAmps: 2 },
  batteryAA4: { volts: 6, rint: 0.6, capacityMah: 2500, shortAmps: 2 },
  coincell: { volts: 3, rint: 40, capacityMah: 225, shortAmps: 0.06 },
};

/* ---------- Catalog ---------- */

const defs: PartDef[] = [
  {
    type: "breadboard",
    name: "Breadboard",
    category: "Boards",
    blurb: "Half-size, 400 tie points",
    pins: HOLES,
    box: { x: 0, y: 0, w: BB_W, h: BB_H },
    defaults: {},
    props: [],
    learn: {
      what: "A breadboard lets you build circuits without soldering. Metal clips under the holes join them in groups.",
      wiring:
        "Each numbered column of five holes (a to e, and f to j) is one connection. The gap in the middle separates the two halves. The long rails marked + and − run the full length and carry power.",
      limits: "Each hole takes one lead. Clips are rated for about 1 A.",
    },
  },
  {
    type: "battery9v",
    name: "9V battery",
    category: "Power",
    blurb: "9 V, with snap connector",
    pins: [
      { id: "pos", x: 0, y: 0, label: "+ (red)" },
      { id: "neg", x: 2, y: 0, label: "− (black)" },
    ],
    box: { x: -4.5, y: -24, w: 11, h: 24.6 },
    defaults: {},
    props: [],
    learn: {
      what: "A 9 V alkaline battery. Small, high voltage, low capacity (about 550 mAh).",
      wiring: "Red lead is positive, black is negative. Run them to the + and − rails of the breadboard.",
      limits: "Internal resistance is about 1.7 Ω, so the voltage drops when you draw a lot of current. Never connect the two leads directly.",
    },
  },
  {
    type: "batteryAA2",
    name: "2 × AA holder",
    category: "Power",
    blurb: "3 V from two AA cells",
    pins: [
      { id: "pos", x: 0, y: 0, label: "+ (red)" },
      { id: "neg", x: 2, y: 0, label: "− (black)" },
    ],
    box: { x: -5.5, y: -26, w: 13, h: 26.6 },
    defaults: {},
    props: [],
    learn: {
      what: "Two 1.5 V AA cells in series make 3 V. AA cells hold far more energy than a 9 V battery.",
      wiring: "Red lead is positive, black is negative.",
      limits: "AA cells can deliver several amps into a short circuit, which heats wires quickly.",
    },
  },
  {
    type: "batteryAA4",
    name: "4 × AA holder",
    category: "Power",
    blurb: "6 V from four AA cells",
    pins: [
      { id: "pos", x: 0, y: 0, label: "+ (red)" },
      { id: "neg", x: 2, y: 0, label: "− (black)" },
    ],
    box: { x: -11.8, y: -26, w: 25.6, h: 26.6 },
    defaults: {},
    props: [],
    learn: {
      what: "Four 1.5 V AA cells in series make 6 V, a good match for small motors.",
      wiring: "Red lead is positive, black is negative.",
      limits: "AA cells can deliver several amps into a short circuit, which heats wires quickly.",
    },
  },
  {
    type: "coincell",
    name: "Coin cell",
    category: "Power",
    blurb: "CR2032, 3 V",
    pins: [
      { id: "pos", x: 0, y: 0, label: "+" },
      { id: "neg", x: 6, y: 0, label: "−" },
    ],
    box: { x: -1.6, y: -9.4, w: 9.2, h: 10 },
    defaults: {},
    props: [],
    learn: {
      what: "A CR2032 lithium coin cell in a holder. It gives 3 V but only a few milliamps.",
      wiring: "The pin marked + is positive.",
      limits: "High internal resistance limits it to roughly 20 mA. That is why an LED can run from one without a resistor.",
    },
  },
  {
    type: "resistor",
    name: "Resistor",
    category: "Basics",
    blurb: "Limits current",
    pins: [
      { id: "a", x: 0, y: 0, label: "Lead 1" },
      { id: "b", x: 4, y: 0, label: "Lead 2" },
    ],
    box: { x: -0.5, y: -0.9, w: 5, h: 1.8 },
    defaults: { ohms: 220 },
    props: [{ key: "ohms", label: "Resistance", kind: "ohms" }],
    learn: {
      what: "A resistor limits how much current flows. Ohm's law: current = voltage ÷ resistance.",
      wiring: "It works the same either way round. Put it in series with the part you want to protect.",
      limits: "This is a ¼ W resistor. Power = voltage × current; above 0.25 W it overheats.",
    },
  },
  {
    type: "led",
    name: "LED",
    category: "Basics",
    blurb: "5 mm, five colours",
    pins: [
      { id: "anode", x: 0, y: 0, label: "Anode (+, long leg)" },
      { id: "cathode", x: 1, y: 0, label: "Cathode (−, short leg)" },
    ],
    box: { x: -1, y: -5.4, w: 3, h: 6 },
    defaults: { color: "red" },
    props: [
      {
        key: "color",
        label: "Colour",
        kind: "choice",
        options: Object.entries(LED_COLORS).map(([value, s]) => ({ value, label: s.label })),
      },
    ],
    learn: {
      what: "A light-emitting diode. Current flows one way only, from the anode to the cathode, and makes light.",
      wiring: "The long leg (anode) goes toward +. Always add a resistor in series: (supply voltage − LED voltage) ÷ 0.02 A gives a safe value.",
      limits: "About 20 mA is full brightness. Above 30 mA it runs hot, and it burns out quickly past that.",
    },
  },
  {
    type: "diode",
    name: "Diode",
    category: "Basics",
    blurb: "1N4007, one-way valve",
    pins: [
      { id: "anode", x: 0, y: 0, label: "Anode" },
      { id: "cathode", x: 4, y: 0, label: "Cathode (stripe)" },
    ],
    box: { x: -0.5, y: -0.9, w: 5, h: 1.8 },
    defaults: {},
    props: [],
    learn: {
      what: "A diode lets current through in one direction and blocks it in the other.",
      wiring: "Current flows from the plain end to the striped end. It drops about 0.7 V on the way.",
      limits: "The 1N4007 handles 1 A forward.",
    },
  },
  {
    type: "capacitor",
    name: "Capacitor",
    category: "Basics",
    blurb: "Electrolytic, stores charge",
    pins: [
      { id: "pos", x: 0, y: 0, label: "+ (long leg)" },
      { id: "neg", x: 1, y: 0, label: "− (stripe)" },
    ],
    box: { x: -1.1, y: -6, w: 3.2, h: 6.6 },
    defaults: { farads: 0.0001 },
    props: [{ key: "farads", label: "Capacitance", kind: "farads" }],
    learn: {
      what: "A capacitor stores charge. It fills through a resistor over time: after R × C seconds it reaches about 63 %.",
      wiring: "Electrolytic capacitors are polarised. The striped side is negative.",
      limits: "Rated 16 V. Reverse voltage damages a real one.",
    },
  },
  {
    type: "button",
    name: "Push button",
    category: "Input",
    blurb: "Momentary tactile switch",
    pins: [
      { id: "a1", x: 0, y: 0, label: "Side A" },
      { id: "b1", x: 2, y: 0, label: "Side B" },
      { id: "a2", x: 0, y: 3, label: "Side A" },
      { id: "b2", x: 2, y: 3, label: "Side B" },
    ],
    box: { x: -0.6, y: -0.6, w: 3.2, h: 4.2 },
    defaults: {},
    props: [],
    learn: {
      what: "Press to connect, release to disconnect.",
      wiring: "Place it across the centre gap. The two legs on each side are always joined; pressing joins side A to side B.",
      limits: "Rated 50 mA. Use it to signal, not to switch heavy loads.",
    },
  },
  {
    type: "switch",
    name: "Slide switch",
    category: "Input",
    blurb: "SPDT, stays where you put it",
    pins: [
      { id: "p1", x: 0, y: 0, label: "Throw 1" },
      { id: "com", x: 1, y: 0, label: "Common" },
      { id: "p2", x: 2, y: 0, label: "Throw 2" },
    ],
    box: { x: -1, y: -3.4, w: 4, h: 4 },
    defaults: { pos: 0 },
    props: [],
    learn: {
      what: "A slide switch connects the middle pin to one side or the other.",
      wiring: "Use the middle pin and one outer pin for a simple on/off switch.",
      limits: "Rated 300 mA.",
    },
  },
  {
    type: "pot",
    name: "Potentiometer",
    category: "Input",
    blurb: "Variable resistor, 10 kΩ",
    pins: [
      { id: "a", x: 0, y: 0, label: "End 1" },
      { id: "w", x: 1, y: 0, label: "Wiper" },
      { id: "b", x: 2, y: 0, label: "End 2" },
    ],
    box: { x: -1.6, y: -5.6, w: 5.2, h: 6.2 },
    defaults: { ohms: 10000, t: 0.5 },
    props: [
      { key: "ohms", label: "Total resistance", kind: "ohms" },
      { key: "t", label: "Knob position", kind: "range", live: true, lowLabel: "End 1", highLabel: "End 2" },
    ],
    learn: {
      what: "A resistor with a sliding contact. Turning the knob moves the wiper along the track.",
      wiring: "Outer pins to + and −, and the middle pin gives a voltage you can dial between them.",
      limits: "The track is rated 0.1 W. Do not use it to dim a load directly.",
    },
  },
  {
    type: "ldr",
    name: "Light sensor",
    category: "Input",
    blurb: "Photoresistor (LDR)",
    pins: [
      { id: "a", x: 0, y: 0, label: "Lead 1" },
      { id: "b", x: 1, y: 0, label: "Lead 2" },
    ],
    box: { x: -1, y: -4.6, w: 3, h: 5.2 },
    defaults: { t: 0.5 },
    props: [{ key: "t", label: "Light level", kind: "range", live: true, lowLabel: "Dark", highLabel: "Bright" }],
    learn: {
      what: "Its resistance falls as more light hits it: about 1 MΩ in the dark, 1 kΩ in bright light.",
      wiring: "Pair it with a fixed resistor to make a voltage divider that tracks light.",
      limits: "Slow to respond, a few tens of milliseconds.",
    },
  },
  {
    type: "buzzer",
    name: "Buzzer",
    category: "Output",
    blurb: "Active piezo, 2.3 kHz",
    pins: [
      { id: "pos", x: 0, y: 0, label: "+" },
      { id: "neg", x: 3, y: 0, label: "−" },
    ],
    box: { x: -1.2, y: -2.7, w: 5.4, h: 5.4 },
    defaults: {},
    props: [],
    learn: {
      what: "An active buzzer has its own oscillator. Give it power and it beeps.",
      wiring: "The pin marked + goes toward positive. It stays silent the wrong way round.",
      limits: "Runs from 3 to 12 V and draws about 20 mA at 5 V.",
    },
  },
  {
    type: "motor",
    name: "DC motor",
    category: "Output",
    blurb: "Hobby motor, 3 to 6 V",
    pins: [
      { id: "pos", x: 0, y: 0, label: "Terminal +" },
      { id: "neg", x: 2, y: 0, label: "Terminal −" },
    ],
    box: { x: -4.2, y: -12.6, w: 10.4, h: 13.2 },
    defaults: {},
    props: [],
    learn: {
      what: "A brushed DC motor. More voltage spins it faster; swapping the leads reverses it.",
      wiring: "Connect straight to a battery, or through a switch.",
      limits: "Draws about 0.5 A at start-up from 3 V, far more than a microcontroller pin can supply.",
    },
  },
  {
    type: "meter",
    name: "Multimeter",
    category: "Instruments",
    blurb: "Measures volts and amps",
    pins: [
      { id: "com", x: 0, y: 0, label: "COM (black)" },
      { id: "v", x: 3, y: 0, label: "V / A (red)" },
    ],
    box: { x: -4.5, y: -22, w: 12, h: 23 },
    defaults: { mode: "V" },
    props: [
      {
        key: "mode",
        label: "Mode",
        kind: "choice",
        options: [
          { value: "V", label: "Voltage" },
          { value: "A", label: "Current" },
        ],
      },
    ],
    learn: {
      what: "A multimeter shows what is happening in a circuit.",
      wiring:
        "Voltage: touch the probes across a part, in parallel. Current: break the circuit and put the meter in the gap, in series.",
      limits: "In current mode the meter is nearly a plain wire. Putting it across a battery is a short circuit.",
    },
  },
];

export const CATALOG: Record<PartType, PartDef> = Object.fromEntries(defs.map((d) => [d.type, d])) as Record<
  PartType,
  PartDef
>;
export const CATALOG_LIST = defs;
export const CATEGORIES: PartDef["category"][] = ["Boards", "Power", "Basics", "Input", "Output", "Instruments"];

/* ---------- Value formatting ---------- */

export function formatSI(value: number, unit: string, digits = 3): string {
  if (!isFinite(value)) return `– ${unit}`;
  const abs = Math.abs(value);
  if (abs < 1e-12) return `0 ${unit}`;
  const steps: [number, string][] = [
    [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"],
  ];
  for (const [f, p] of steps) {
    if (abs >= f * 0.9995) {
      return `${parseFloat((value / f).toPrecision(digits))} ${p}${unit}`;
    }
  }
  return `${value.toExponential(1)} ${unit}`;
}

/** Parse entries like "4.7k", "220", "1M", "100u", "10n". */
export function parseSI(text: string): number | null {
  const m = text.trim().replace(/,/g, ".").match(/^([0-9]*\.?[0-9]+)\s*([pnuµmkKMR]?)/);
  if (!m) return null;
  const mult: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, R: 1, "": 1 };
  const v = parseFloat(m[1]) * mult[m[2]];
  return isFinite(v) && v > 0 ? v : null;
}

const BAND_COLORS = ["#1b1b1b", "#7a4a21", "#d62d20", "#f08a1c", "#f2d21b", "#2f9e44", "#2463c9", "#8a4fc2", "#8d9296", "#f4f4f4"];

/** Four-band resistor colour code for a value in ohms (5 % gold tolerance band). */
export function resistorBands(ohms: number): string[] {
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let sig = Math.round(ohms / Math.pow(10, exp));
  if (sig >= 100) {
    sig = 10;
    exp += 1;
  }
  const mult = exp === -1 ? "#c9a227" : exp === -2 ? "#b9bcc0" : BAND_COLORS[Math.max(0, Math.min(9, exp))];
  return [BAND_COLORS[Math.floor(sig / 10)], BAND_COLORS[sig % 10], mult, "#c9a227"];
}
