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

  ...circuitExamples(),
  ...arduinoExamples(),
  ...deviceExamples(),
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

/** Circuit-only examples that use the transistor and relay. */
function circuitExamples(): Example[] {
  /** Button -> 1 k -> base, from the + rail. The NPN's emitter goes to the − rail. */
  const driver = (npnX: number): { parts: Part[]; wires: Wire[] } => ({
    parts: [
      p("q1", "npn", npnX, 14),
      p("rb", "resistor", npnX + 1, 13, { ohms: 1000 }),
      p("btn", "button", npnX + 5, 8),
    ],
    wires: [
      w(hole(npnX, 15), hole(npnX, 18), BLACK),
      w(hole(npnX + 7, 14), hole(npnX + 7, 17), RED),
    ],
  });

  const tr = driver(15);
  const transistor: Example = {
    id: "transistor",
    title: "Transistor switch",
    summary: "A tiny base current from the button switches a bigger current through the LED.",
    doc: {
      parts: [board(), p("bat", "battery9v", -10, 18), p("r1", "resistor", 8, 12, { ohms: 470 }), p("led1", "led", 12, 11, { color: "red" }), ...tr.parts],
      wires: [
        ...power(),
        w(hole(8, 14), hole(8, 17), RED),
        w(hole(13, 12), hole(17, 12), YELLOW),
        ...tr.wires,
      ],
    },
  };

  const relay: Example = {
    id: "relay",
    title: "Relay with a flyback diode",
    summary: "The button drives a transistor, which drives the relay coil. Delete the diode and watch what switching off does.",
    doc: {
      parts: [
        board(),
        p("bat", "batteryAA4", -16, 18),
        p("rly", "relay", 3, 6),
        p("d1", "diode", 7, 4, {}, 2),
        p("r1", "resistor", 12, 4, { ohms: 330 }),
        p("led1", "led", 16, 5, { color: "green" }),
        ...tr.parts,
      ],
      wires: [
        ...power(),
        w(hole(3, 5), hole(3, 17), RED),      // coil +
        w(hole(5, 7), hole(17, 12), YELLOW),  // coil - to the transistor's collector
        w(hole(7, 5), hole(5, 5), ORANGE),    // diode anode to the coil's low side
        w(hole(8, 8), hole(8, 17), RED),      // contacts: common to +
        w(hole(17, 7), hole(17, 18), BLACK),  // LED to -
        ...tr.wires,
      ],
    },
  };
  return [transistor, relay];
}

/** Arduino examples for the servo, ultrasonic sensor, LCD, RGB LED, 7-segment and instruments. */
function deviceExamples(): Example[] {
  const make = (id: string, title: string, summary: string, parts: Part[], wires: Wire[]): Example => ({
    id, title, summary, sketch: SKETCHES[id as keyof typeof SKETCHES], doc: { parts, wires },
  });
  const uno = (x = -33, y = 0) => p("uno", "uno", x, y, { power: "usb" });
  // Pin positions of the Uno, relative to its origin, for wires that go straight to its sockets.
  const U = (name: string) => pin("uno", name);

  const rgb = make(
    "rgb", "RGB colour mixer",
    "Three PWM pins mix red, green and blue. Each colour has its own resistor.",
    [
      board(), uno(),
      p("rgb1", "rgbled", 14, 11),
      p("r1", "resistor", 10, 13, { ohms: 330 }), p("r2", "resistor", 12, 14, { ohms: 330 }), p("r3", "resistor", 13, 15, { ohms: 330 }),
    ],
    [
      w(U("gnd2"), hole(1, 18), BLACK),
      w(U("d9"), hole(10, 15), RED), w(U("d10"), hole(12, 15), GREEN2), w(U("d11"), hole(13, 12), BLUE),
      w(hole(15, 14), hole(15, 18), BLACK),
    ],
  );

  const seg = (name: string, ax: number, ay: number) => p(`r_${name}`, "resistor", ax, ay, { ohms: 330 });
  const sevenseg = make(
    "sevenseg", "Seven-segment counter",
    "Seven pins light the segments of one digit. The sketch counts from 0 to 9.",
    [
      board(), uno(),
      p("seg1", "sevenseg", 14, 11),
      seg("e", 10, 13), seg("d", 11, 14), seg("g", 10, 6), seg("f", 11, 7), seg("c", 17, 13), seg("a", 17, 6), seg("b", 18, 7),
    ],
    [
      w(U("gnd2"), hole(1, 18), BLACK),
      w(U("d2"), hole(21, 4), RED),      // a
      w(U("d3"), hole(22, 5), ORANGE),   // b
      w(U("d4"), hole(21, 14), YELLOW),  // c
      w(U("d5"), hole(11, 15), GREEN2),  // d
      w(U("d6"), hole(10, 15), BLUE),    // e
      w(U("d7"), hole(11, 5), RED),      // f
      w(U("d8"), hole(10, 4), ORANGE),   // g
      w(hole(16, 14), hole(16, 18), BLACK),
    ],
  );

  const servoBase = (): { parts: Part[]; wires: Wire[] } => ({
    parts: [uno(-30, 2), p("sv", "servo", 8, 24)],
    wires: [w(pin("sv", "gnd"), U("gnd2"), BLACK), w(pin("sv", "vcc"), U("5v"), RED), w(pin("sv", "sig"), U("d9"), ORANGE)],
  });
  const sb = servoBase();
  const servo = make("servo", "Servo sweep", "The servo horn sweeps from 0 to 180 degrees and back. Watch the pulse width in the inspector.", sb.parts, sb.wires);
  const servoKnob = make(
    "servoknob", "Servo knob",
    "Turn the potentiometer and the servo follows. Its wiper voltage becomes an angle.",
    [...sb.parts, p("pot1", "pot", 22, 18, { ohms: 10000, t: 0.5 })],
    [...sb.wires, w(pin("pot1", "a"), U("5v"), RED), w(pin("pot1", "b"), U("gnd3"), BLACK), w(pin("pot1", "w"), U("a0"), BLUE)],
  );

  const ultrasonic = make(
    "ultrasonic", "Ultrasonic ruler",
    "An HC-SR04 times its echo. Slide the object away and watch the serial monitor.",
    [uno(-30, 2), p("us", "hcsr04", 8, 20, { cm: 100 })],
    [w(pin("us", "vcc"), U("5v"), RED), w(pin("us", "trig"), U("d9"), YELLOW), w(pin("us", "echo"), U("d10"), GREEN2), w(pin("us", "gnd"), U("gnd2"), BLACK)],
  );

  const lcdWires: Wire[] = [
    w(pin("lcd", "vss"), U("gnd2"), BLACK), w(pin("lcd", "vdd"), U("5v"), RED), w(pin("lcd", "v0"), pin("pot1", "w"), BLUE),
    w(pin("lcd", "rw"), U("gnd3"), BLACK), w(pin("lcd", "rs"), U("d12"), YELLOW), w(pin("lcd", "e"), U("d11"), GREEN2),
    w(pin("lcd", "d4"), U("d5"), ORANGE), w(pin("lcd", "d5"), U("d4"), BLUE), w(pin("lcd", "d6"), U("d3"), YELLOW), w(pin("lcd", "d7"), U("d2"), GREEN2),
    w(pin("lcd", "a"), pin("rbl", "a"), RED), w(pin("rbl", "b"), U("5v"), RED), w(pin("lcd", "k"), U("gnd3"), BLACK),
    w(pin("pot1", "a"), U("5v"), RED), w(pin("pot1", "b"), U("gnd3"), BLACK),
  ];
  const lcdhello = make(
    "lcdhello", "Hello LCD",
    "A 16×2 display, wired for 4-bit mode. Turn the contrast knob until the text is clear.",
    [uno(-34, 0), p("lcd", "lcd1602", 2, 1), p("pot1", "pot", 12, 25, { ohms: 10000, t: 0.9 }), p("rbl", "resistor", 22, 24, { ohms: 220 })],
    lcdWires,
  );

  const pwmscope = make(
    "pwmscope", "PWM on the oscilloscope",
    "The scope shows the PWM wave on D9 (yellow) and the voltage after an RC filter (cyan).",
    [
      board(), uno(), p("scope1", "scope", 36, 26, { tdiv: "0.002", v1div: "1", v2div: "1", trig: 2.5 }),
      p("r1", "resistor", 5, 12, { ohms: 10000 }), p("c1", "capacitor", 9, 11, { farads: 1e-6 }),
    ],
    [
      w(U("gnd2"), hole(1, 18), BLACK),
      w(U("d9"), hole(5, 14), YELLOW), w(U("a0"), hole(9, 14), BLUE), w(hole(10, 14), hole(10, 18), BLACK),
      w(pin("scope1", "ch1"), hole(5, 15), YELLOW), w(pin("scope1", "ch2"), hole(9, 15), BLUE), w(pin("scope1", "gnd"), hole(3, 18), BLACK),
    ],
  );

  const plotter = make(
    "plotter", "Serial plotter",
    "The sketch prints a knob reading and a sine wave. Open the Plotter tab to graph them.",
    [uno(-30, 2), p("pot1", "pot", 8, 14, { ohms: 10000, t: 0.3 })],
    [w(pin("pot1", "a"), U("5v"), RED), w(pin("pot1", "b"), U("gnd2"), BLACK), w(pin("pot1", "w"), U("a0"), BLUE)],
  );

  return [rgb, sevenseg, servo, servoKnob, ultrasonic, lcdhello, pwmscope, plotter];
}
