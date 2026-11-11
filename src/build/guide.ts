import { BATTERIES, CATALOG, HOLE_BY_ID, ROW_LETTERS, formatSI, resistorBands, type PartType } from "@/sim/catalog";
import { WIRE_COLORS, holeMap, pinPos, type Doc, type Part, type PinRef } from "@/sim/model";

export interface BomLine {
  qty: number;
  name: string;
  /** Extra help for buying or identifying it. */
  note?: string;
}

export interface Guide {
  bom: BomLine[];
  /** How to hold the breadboard, then where each part's legs go. */
  placements: { part: string; legs: string }[];
  wires: { n: number; from: string; to: string; color: string }[];
  checks: string[];
}

const COLOR_NAMES: Record<string, string> = {
  "#d63a2f": "red", "#1d1f22": "black", "#e8b10e": "yellow", "#2f9e44": "green",
  "#2f6fd6": "blue", "#e8742a": "orange", "#8a4fc2": "purple", "#f1f1ee": "white",
};
const BAND_NAMES: Record<string, string> = {
  "#1b1b1b": "black", "#7a4a21": "brown", "#d62d20": "red", "#f08a1c": "orange", "#f2d21b": "yellow",
  "#2f9e44": "green", "#2463c9": "blue", "#8a4fc2": "violet", "#8d9296": "grey", "#f4f4f4": "white",
  "#c9a227": "gold", "#b9bcc0": "silver",
};

export const colorName = (hex: string) => COLOR_NAMES[hex.toLowerCase()] ?? (WIRE_COLORS.includes(hex) ? "coloured" : "any colour");

/** A breadboard hole as people read it: "e5" for the fifth column's e row, or "top + rail, column 5". */
export function holeLabel(id: string): string {
  const hole = HOLE_BY_ID.get(id);
  if (!hole) return id;
  if (hole.strip.length === 2 && /^[tb][pn]$/.test(hole.strip)) {
    const where = hole.strip[0] === "t" ? "top" : "bottom";
    return `${where} ${hole.strip[1] === "p" ? "+" : "−"} rail, near column ${hole.x}`;
  }
  return `${ROW_LETTERS[hole.y]}${hole.x}`;
}

const REAL: Partial<Record<PartType, (p: Part) => { name: string; note?: string }>> = {
  breadboard: () => ({ name: "Half-size solderless breadboard", note: "400 tie points, with two power rails on each side" }),
  uno: (p) => ({ name: "Arduino Uno R3", note: p.props.power === "ext" ? "powered from VIN or the 5V pin" : "plus a USB A-to-B cable for power and uploading" }),
  battery9v: () => ({ name: "9 V battery with snap connector", note: "the snap connector has a red (+) and a black (−) lead" }),
  batteryAA2: () => ({ name: "2 × AA battery holder with leads, plus 2 AA cells" }),
  batteryAA4: () => ({ name: "4 × AA battery holder with leads, plus 4 AA cells" }),
  coincell: () => ({ name: "CR2032 coin cell with holder" }),
  diode: () => ({ name: "1N4007 diode", note: "the stripe marks the cathode" }),
  led: (p) => ({ name: `5 mm LED, ${String(p.props.color)}`, note: "the longer leg is the anode (+)" }),
  button: () => ({ name: "6 mm push button", note: "4-pin tactile switch" }),
  switch: () => ({ name: "SPDT slide switch" }),
  ldr: () => ({ name: "Photoresistor (LDR)" }),
  buzzer: () => ({ name: "Active buzzer, 5 V", note: "the + pin is marked" }),
  motor: () => ({ name: "Small DC hobby motor, 3 to 6 V" }),
  meter: () => ({ name: "Digital multimeter", note: "a tool for checking your build, not a part of the circuit" }),
  npn: () => ({ name: "2N2222A NPN transistor", note: "TO-92 package; with the flat side facing you the legs are emitter, base, collector" }),
  rgbled: () => ({ name: "5 mm RGB LED, common cathode", note: "the longest leg is the shared cathode (−)" }),
  sevenseg: () => ({ name: "7-segment display, 1 digit, common cathode", note: "10 pins, two of them the shared cathode" }),
  relay: () => ({ name: "5 V relay (SRD-05VDC-SL-C or similar)", note: "5 pins: two for the coil, three for the contacts" }),
  servo: () => ({ name: "SG90 micro servo", note: "brown = GND, red = 5 V, orange = signal" }),
  hcsr04: () => ({ name: "HC-SR04 ultrasonic distance module", note: "4 pins: VCC, TRIG, ECHO, GND" }),
  lcd1602: () => ({ name: "16×2 character LCD (HD44780 type)", note: "16-pin header; solder header pins if it comes without" }),
  scope: () => ({ name: "Oscilloscope", note: "a bench instrument for checking signals, not a part of the circuit" }),
};

function partName(p: Part): { name: string; note?: string } {
  if (p.type === "resistor") {
    const ohms = Number(p.props.ohms);
    const bands = resistorBands(ohms).map((c) => BAND_NAMES[c] ?? "?").join(", ");
    return { name: `${formatSI(ohms, "Ω")} resistor, ¼ W, 5%`, note: `colour bands: ${bands}` };
  }
  if (p.type === "capacitor") return { name: `${formatSI(Number(p.props.farads), "F")} electrolytic capacitor, 16 V or more`, note: "the stripe marks the negative leg" };
  if (p.type === "pot") return { name: `${formatSI(Number(p.props.ohms), "Ω")} potentiometer`, note: "3 pins: two ends and the wiper in the middle" };
  return REAL[p.type]?.(p) ?? { name: CATALOG[p.type].name };
}

/** Everything someone needs to buy and build what is on the bench. */
export function buildGuide(doc: Doc): Guide {
  const holes = holeMap(doc);
  const byId = new Map(doc.parts.map((p) => [p.id, p]));
  const parts = doc.parts;

  // Bill of materials: identical parts are merged and counted.
  const lines = new Map<string, BomLine>();
  for (const p of parts) {
    const { name, note } = partName(p);
    const line = lines.get(name) ?? { qty: 0, name, note };
    line.qty++;
    lines.set(name, line);
  }
  const onBoard = (r: PinRef) => byId.get(r.part)?.type === "breadboard";
  const jumpers = doc.wires.length;
  const bom = [...lines.values()];
  if (jumpers) bom.push({ qty: jumpers, name: "Jumper wires", note: "male-to-male; a mix of colours makes it easier to follow" });

  // Where each part's legs go, in breadboard coordinates.
  const placements: Guide["placements"] = [];
  for (const p of parts) {
    if (p.type === "breadboard") continue;
    const def = CATALOG[p.type];
    const seated: string[] = [];
    for (const pin of def.pins) {
      const [x, y] = pinPos(p, pin);
      const hole = holes.get(`${x},${y}`);
      if (hole) seated.push(`${pin.label.split(" (")[0]} → ${holeLabel(hole.holeId)}`);
    }
    if (seated.length) placements.push({ part: partName(p).name, legs: seated.join(", ") });
    else if (!BATTERIES[p.type as keyof typeof BATTERIES]) placements.push({ part: partName(p).name, legs: "not on the breadboard: it connects with wires only" });
  }

  const endLabel = (r: PinRef): string => {
    const part = byId.get(r.part);
    if (!part) return r.pin;
    if (part.type === "breadboard") return holeLabel(r.pin);
    const pin = CATALOG[part.type].pins.find((x) => x.id === r.pin);
    const label = pin?.label ?? r.pin;
    return part.type === "uno" ? `Arduino ${label.split(" (")[0].replace(/^(\d)/, "pin $1")}` : `${partName(part).name.split(",")[0]} ${label.split(" (")[0]}`;
  };
  const wires = doc.wires.map((w, i) => ({ n: i + 1, from: endLabel(w.a), to: endLabel(w.b), color: colorName(w.color) }));

  // Safety and sense checks that follow from what is actually on the bench.
  const has = (t: PartType) => parts.some((p) => p.type === t);
  const checks: string[] = [];
  if (has("led") || has("rgbled") || has("sevenseg")) checks.push("Every LED needs a resistor in series with it. Without one it burns out within seconds. Check the long leg (anode) faces the + side.");
  if (has("capacitor")) checks.push("Electrolytic capacitors are polarised: the striped leg goes to the negative side. Backwards, they can heat up and burst.");
  if (has("relay") && !has("diode")) checks.push("Add a diode across the relay coil (stripe toward +). Without it, switching the coil off makes a voltage spike that can destroy the transistor driving it.");
  if (has("relay")) checks.push("A relay can switch mains voltage, but do not. Keep this project to low voltage unless you are properly trained.");
  if (has("servo") || has("motor")) checks.push("Motors and servos draw far more current than a pin can supply. Power them from 5 V or a battery, and join their ground to the Arduino's ground.");
  if (has("lcd1602")) checks.push("If the LCD shows nothing, turn its contrast potentiometer, and check the backlight resistor (A pin to 5 V through 220 Ω).");
  if (parts.some((p) => p.type in BATTERIES)) checks.push("Connect the battery last, after you have checked everything else. Never join the two battery leads directly: that is a short circuit and the battery will get hot.");
  if (onBoard && doc.wires.some((w) => onBoard(w.a) && onBoard(w.b))) checks.push("Press each wire and part firmly into its hole. A loose lead is the most common reason a circuit does not work.");
  checks.push("Before you power it on, compare every wire with this list, one at a time, and tick it off.");
  checks.push("This is a low-voltage project. Never connect it to mains electricity.");
  return { bom, placements, wires, checks };
}
