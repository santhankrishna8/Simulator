import type { Doc, Part, Wire } from "./model";
import { SKETCHES } from "./sketches.mjs";

const RED = "#d63a2f";
const BLACK = "#1d1f22";
const YELLOW = "#e8b10e";
const ORANGE = "#e8742a";
const BLUE = "#2f6fd6";
const GREEN2 = "#2f9e44";
const GREEN = "#2f9e44";

const BB = "bb";
const hole = (x: number, y: number) => ({ part: BB, pin: `${x}_${y}` });
const pin = (part: string, p: string) => ({ part, pin: p });
let n = 0;
const w = (a: Wire["a"], b: Wire["b"], color: string): Wire => ({ id: `ex-w${n++}`, a, b, color });
const p = (id: string, type: Part["type"], x: number, y: number, props: Part["props"] = {}, rot: Part["rot"] = 0): Part => ({
  id, type, x, y, rot, props,
});
const board = () => p(BB, "breadboard", 0, 0);
/** Battery to the left of the board, wired to the bottom rails. */
const power = (): Wire[] => [w(pin("bat", "pos"), hole(1, 17), RED), w(pin("bat", "neg"), hole(1, 18), BLACK)];

export interface Example {
  id: string;
  title: string;
  summary: string;
  doc: Doc;
  /** Arduino sketch that goes with the circuit. */
  sketch?: string;
}

export const EXAMPLES: Example[] = [
  {
    id: "led",
    title: "Light an LED",
    summary: "A battery, a resistor and an LED: the first circuit everyone builds.",
    doc: {
      parts: [board(), p("bat", "battery9v", -10, 18), p("r1", "resistor", 8, 13, { ohms: 470 }), p("led1", "led", 12, 11, { color: "red" })],
      wires: [...power(), w(hole(8, 17), hole(8, 15), RED), w(hole(13, 15), hole(13, 18), BLACK)],
    },
  },
  {
    id: "buzzer",
    title: "Button and buzzer",
    summary: "Hold the button to complete the loop and sound the buzzer.",
    doc: {
      parts: [board(), p("bat", "batteryAA2", -11, 18), p("btn", "button", 8, 8), p("bz", "buzzer", 16, 13)],
      wires: [
        ...power(),
        w(hole(8, 17), hole(8, 15), RED),
        w(hole(10, 15), hole(16, 15), YELLOW),
        w(hole(19, 15), hole(19, 18), BLACK),
      ],
    },
  },
  {
    id: "dimmer",
    title: "Voltage divider",
    summary: "Turn the potentiometer and watch the meter. This is how a knob becomes a signal.",
    doc: {
      parts: [board(), p("bat", "battery9v", -10, 18), p("pot1", "pot", 10, 11, { ohms: 10000, t: 0.35 }), p("m1", "meter", 36, 22, { mode: "V" })],
      wires: [
        ...power(),
        w(hole(10, 17), hole(10, 15), RED),
        w(hole(12, 15), hole(13, 18), BLACK),
        w(pin("m1", "v"), hole(11, 14), GREEN),
        w(pin("m1", "com"), hole(29, 18), BLACK),
      ],
    },
  },
  {
    id: "rc",
    title: "Slow fade",
    summary: "Flip the switch. The capacitor fills, then keeps the LED glowing after you switch off.",
    doc: {
      parts: [
        board(),
        p("bat", "battery9v", -10, 18),
        p("sw", "switch", 5, 11, { pos: 0 }),
        p("r1", "resistor", 6, 13, { ohms: 330 }),
        p("c1", "capacitor", 10, 11, { farads: 0.001 }),
        p("r2", "resistor", 10, 14, { ohms: 1000 }),
        p("led1", "led", 14, 11, { color: "blue" }),
      ],
      wires: [
        ...power(),
        w(hole(7, 17), hole(7, 15), RED),
        w(hole(11, 15), hole(11, 18), BLACK),
        w(hole(15, 15), hole(15, 18), BLACK),
      ],
    },
  },
  {
    id: "motor",
    title: "Motor with a switch",
    summary: "Four AA cells drive a motor. Watch the current fall as it gets up to speed.",
    doc: {
      parts: [
        board(),
        p("bat", "batteryAA4", -16, 18),
        p("sw", "switch", 6, 11, { pos: 0 }),
        p("m1", "meter", 36, 25, { mode: "A" }),
        p("mot", "motor", 49, 25),
      ],
      wires: [
        ...power(),
        w(hole(7, 17), hole(7, 15), RED),
        w(hole(8, 15), pin("m1", "v"), YELLOW),
        w(pin("m1", "com"), pin("mot", "pos"), GREEN),
        w(pin("mot", "neg"), hole(29, 18), BLACK),
      ],
    },
  },

  ...arduinoExamples(),
];

/** Uno on the left of the breadboard. Ground goes to the bottom minus rail. */
function unoBase(): { parts: Part[]; wires: Wire[] } {
  return {
    parts: [board(), p("uno", "uno", -33, 0, { power: "usb" })],
    wires: [w(pin("uno", "gnd2"), hole(1, 18), BLACK)],
  };
}

/** Resistor and LED from a signal row to ground, as used by most Arduino examples. */
function ledBranch(sig: Wire["a"], resX: number, color: string): { parts: Part[]; wires: Wire[] } {
  return {
    parts: [p("r1", "resistor", resX, 12, { ohms: 330 }), p("led1", "led", resX + 4, 11, { color })],
    wires: [w(sig, hole(resX, 14), ORANGE), w(hole(resX + 5, 14), hole(resX + 5, 18), BLACK)],
  };
}

function arduinoExamples(): Example[] {
  const make = (id: string, title: string, summary: string, parts: Part[], wires: Wire[]): Example => ({
    id, title, summary, sketch: SKETCHES[id as keyof typeof SKETCHES], doc: { parts, wires },
  });
  const base = unoBase();

  const blink = ledBranch(pin("uno", "d13"), 5, "red");
  const fade = ledBranch(pin("uno", "d9"), 5, "green");
  const btnLed = ledBranch(pin("uno", "d8"), 5, "yellow");

  const knobLed = ledBranch(pin("uno", "d9"), 17, "blue");
  const night = ledBranch(pin("uno", "d6"), 18, "white");

  return [
    make("blink", "Blink", "Your first sketch. An LED switches on and off every half second.", [...base.parts, ...blink.parts], [...base.wires, ...blink.wires]),
    make("fade", "Fade with PWM", "analogWrite makes an LED look dimmer by switching it very fast.", [...base.parts, ...fade.parts], [...base.wires, ...fade.wires]),
    make(
      "button",
      "Button with INPUT_PULLUP",
      "Read a button and light an LED while it is held. The serial monitor logs each press.",
      [...base.parts, ...btnLed.parts, p("btn", "button", 20, 8)],
      [...base.wires, ...btnLed.wires, w(pin("uno", "d2"), hole(20, 5), GREEN2), w(hole(22, 14), hole(22, 18), BLACK)],
    ),
    make(
      "knob",
      "Knob reads a voltage",
      "A potentiometer on A0 sets the LED's brightness. Turn it and watch the serial monitor.",
      [...base.parts, ...knobLed.parts, p("pot1", "pot", 11, 12, { ohms: 10000, t: 0.5 })],
      [
        ...base.wires, ...knobLed.wires,
        w(pin("uno", "5v"), hole(1, 17), RED),
        w(hole(11, 14), hole(11, 17), RED),
        w(hole(13, 14), hole(13, 18), BLACK),
        w(pin("uno", "a0"), hole(12, 14), BLUE),
      ],
    ),
    make(
      "nightlight",
      "Night light",
      "A light sensor and a resistor form a divider. The darker the room, the brighter the LED.",
      [...base.parts, ...night.parts, p("ldr1", "ldr", 11, 12, { t: 0.7 }), p("r2", "resistor", 12, 13, { ohms: 10000 })],
      [
        ...base.wires, ...night.wires,
        w(pin("uno", "5v"), hole(1, 17), RED),
        w(hole(11, 14), hole(11, 17), RED),
        w(hole(16, 14), hole(16, 18), BLACK),
        w(pin("uno", "a1"), hole(12, 15), BLUE),
      ],
    ),
    make("serial", "Serial control", "Type 1 or 0 in the serial monitor to switch the L LED on the board.", [p("uno", "uno", -13, 0, { power: "usb" })], []),
  ];
}
