import { formatSI } from "@/sim/catalog";
import { add, BLACK, BLUE, breadboard, doc, hole, part, pin, RED, withProp, wire, YELLOW } from "../author";
import { anyLit, connected, joined, noTrouble, partsOf, placed, prop, running, seated, seen, seriesResistor, shape } from "../goals";
import type { Ctx, Lesson } from "../types";

const POS = { type: "battery", pin: "pos" } as const;
const NEG = { type: "battery", pin: "neg" } as const;
const ANODE = { type: "led", pin: "anode" } as const;
const CATHODE = { type: "led", pin: "cathode" } as const;

const battery = () => part("bat", "battery9v", -10, 18);
const railWires = () => [wire(pin("bat", "pos"), hole(1, 17), RED), wire(pin("bat", "neg"), hole(1, 18), BLACK)];
const poweredBoard = () => doc([breadboard(), battery()], railWires());

const ledCurrent = (c: Ctx) => {
  const led = partsOf(c, "led")[0];
  return led ? c.snap?.parts[led.id]?.i : undefined;
};

/* ------------------------------------------------------------------ */

const firstCircuit: Lesson = {
  id: "first-circuit",
  title: "Light an LED",
  track: "circuits",
  level: "Beginner",
  minutes: 10,
  summary: "Build the circuit everyone starts with, and see why an LED needs a resistor.",
  start: { doc: doc([breadboard(), battery()]), code: "" },
  next: "voltage",
  steps: [
    {
      title: "Power the rails",
      body: [
        "A breadboard lets you build circuits without soldering. The two long rows along the top and bottom are **power rails**: every hole in a rail is joined, from one end to the other. The red line marks the + rail, the blue line marks the − rail.",
        "The battery has a red lead (+) and a black lead (−). Click the end of the red lead, then click any hole in a rail row marked +. Then do the same with the black lead and a − row.",
      ].join("\n\n"),
      goals: [
        joined("The red lead (+) reaches a + rail", POS, { rail: "+" }),
        joined("The black lead (−) reaches a − rail", NEG, { rail: "-" }),
      ],
      hint: "The leads are the two wire ends hanging from the bottom of the battery. Click one, and a dashed wire follows your mouse. Click a hole in the long row marked with a red + to finish it.",
      after: "The rails now hold 9 volts between them. Nothing is connected to them yet, so no current flows: current needs a complete loop, out of + and back into −.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [], railWires()) }),
    },
    {
      title: "Add the LED",
      body: [
        "An **LED** (light-emitting diode) gives off light when current flows through it, but only one way: from its **anode** to its **cathode**. The anode is the longer leg.",
        "Drag an LED from the Parts list onto the middle of the breadboard. Its two legs should each land in a hole.",
        "Each short column of five holes (a to e, or f to j) is joined inside the board. The two legs go in different columns so they are not connected to each other.",
      ].join("\n\n"),
      goals: [seated("led", "An LED is plugged into the breadboard")],
      spotlight: ["led"],
      hint: "Drag the LED from the Parts list, or click it and it drops in the middle of the bench. Then drag it until both legs sit on holes. Hover a hole to see which holes are joined to it.",
      after: "Good. Each leg sits in its own column of five holes, so you can plug other parts into the same columns to connect to each leg.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [part("led1", "led", 12, 11, { color: "red" })]) }),
    },
    {
      title: "Protect it with a resistor",
      body: [
        "An LED has almost no resistance once it switches on, so connected straight to a battery it would take far too much current and burn out. A **resistor** limits the current.",
        "Place a resistor so that one end shares a column with the LED's **anode** (the long leg). Then select the resistor and set it to **330 Ω** or more.",
        "Ohm's law tells us the size: the resistor must drop the rest of the voltage, (9 V − about 2 V) ÷ 0.02 A, which is about 350 Ω.",
      ].join("\n\n"),
      goals: [
        seated("resistor", "A resistor is plugged into the breadboard"),
        joined("One end shares a column with the LED's long leg (anode)", { type: "resistor" }, ANODE),
        prop("resistor", "ohms", "The resistor is 330 Ω or more", (v) => Number(v) >= 330),
      ],
      spotlight: ["resistor"],
      hint: "Put one resistor lead in the same five-hole column as the LED's left leg. Then click the resistor and type 330 in the Resistance box, or choose 470 Ω.",
      after: "The 220 Ω you start with would let about 32 mA through, a little over what a standard LED likes. A bigger resistor keeps it safely under 20 mA.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [part("r1", "resistor", 8, 12, { ohms: 330 })]) }),
    },
    {
      title: "Close the circuit",
      body: [
        "Now connect the loop. Current will flow out of the + rail, through the resistor, through the LED, and back into the − rail.",
        "- Run a wire from the resistor's free end (the end not touching the LED) to the **+ rail**.",
        "- Run a wire from the LED's **cathode** (the short leg) to the **− rail**.",
        "Click a hole in the right column to start a wire, then click the hole where it should end.",
      ].join("\n"),
      goals: [
        shape("The resistor sits between the + rail and the LED's anode", (c) => seriesResistor(c, ANODE, POS)),
        joined("The LED's cathode reaches the − rail", CATHODE, NEG),
      ],
      hint: "The resistor's free end is in column 8, the LED's short leg is in column 13. Wire each of those columns to the rail: the resistor to the red + row, the LED to the blue − row.",
      after: "The loop is complete. Press Run to bring it to life.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [], [wire(hole(8, 14), hole(8, 17), RED), wire(hole(13, 14), hole(13, 18), BLACK)]) }),
    },
    {
      title: "Run it",
      body: "Press **Run** at the top right. The LED should light, and the white dashes along the wires show the direction current flows. Select the LED to see its voltage and current.",
      goals: [running, seen("The LED is lit", (c) => c.snap !== null && anyLit(frameOf(c), c.doc, "led")), noTrouble],
      hint: "If the LED stays dark, check the legs: a reversed LED blocks current. The inspector will tell you if it is in backwards.",
      after: (c) => {
        const i = ledCurrent(c);
        return i === undefined
          ? "The LED is lit."
          : `The LED is lit and ${formatSI(i, "A")} is flowing. Check it with Ohm's law: the resistor has about 9 V − 1.9 V = 7.1 V across it, and 7.1 V ÷ 330 Ω is about 21 mA.`;
      },
      solution: (prev) => prev,
      demo: (d) => d.run(1),
    },
    {
      title: "Change the brightness",
      body: [
        "Select the resistor and set it to **2.2 kΩ**. Ohm's law says current = voltage ÷ resistance, so ten times the resistance means about a tenth of the current.",
        "Watch the LED dim, and read its new current in the inspector.",
      ].join("\n\n"),
      goals: [
        shape("The LED carries less than 6 mA", (c) => {
          const i = ledCurrent(c);
          return i !== undefined && i > 0.0002 && i < 0.006;
        }),
        prop("resistor", "ohms", "The resistor is 2 kΩ or more", (v) => Number(v) >= 2000),
      ],
      hint: "Click the resistor on the bench. In the panel, type 2.2k in the Resistance box and press Enter, or pick one of the chips.",
      after: "That is Ohm's law at work: V = I × R. The same battery, ten times the resistor, a tenth of the current, and a much dimmer LED. Resistors are how you set currents.",
      solution: (prev) => ({ ...prev, doc: withProp(prev.doc, "r1", "ohms", 2200) }),
      demo: (d) => d.run(1),
    },
  ],
  takeaways: [
    "Current needs a complete loop from + to −.",
    "An LED conducts one way, anode to cathode, and needs a resistor to limit its current.",
    "Ohm's law: current = voltage ÷ resistance.",
    "Breadboard rails run the whole length; the short columns of five holes are joined.",
  ],
};

/** The last frame's view of lit parts, for goals that look at one moment. */
function frameOf(c: Ctx) {
  const parts: Record<string, { i: number; v: number; glow?: number }> = {};
  if (c.snap) for (const [id, p] of Object.entries(c.snap.parts)) parts[id] = { i: p.i, v: p.v, glow: p.glow };
  return { t: c.snap?.time ?? 0, pressed: false, parts };
}

/* ------------------------------------------------------------------ */

const voltage: Lesson = {
  id: "voltage",
  title: "Voltage and the multimeter",
  track: "circuits",
  level: "Beginner",
  minutes: 10,
  summary: "Turn a knob into a voltage with a potentiometer, and measure it.",
  start: { doc: poweredBoard(), code: "" },
  next: "button",
  steps: [
    {
      title: "Add a potentiometer",
      body: [
        "A **potentiometer** is a resistor with a sliding contact called the **wiper**. It has three legs: two ends of the track, and the wiper in the middle.",
        "Plug a potentiometer into the middle of the breadboard. The three legs go in three different columns.",
      ].join("\n\n"),
      goals: [seated("pot", "A potentiometer is plugged into the breadboard")],
      spotlight: ["pot"],
      hint: "Drag it from the Parts list. Its three legs should land on three neighbouring columns.",
      after: "Turning the knob moves the wiper along the track between the two end legs.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [part("pot1", "pot", 11, 12, { ohms: 10000, t: 0.5 })]) }),
    },
    {
      title: "Put 9 V across the track",
      body: [
        "Connect one outer leg to the **+ rail** and the other outer leg to the **− rail**. Now the whole 9 V is across the track, and the wiper picks off a voltage somewhere between 0 V and 9 V, depending on where it sits.",
        "This arrangement is called a **voltage divider**.",
      ].join("\n\n"),
      goals: [
        shape("One outer leg goes to the + rail and the other to the − rail", (c) =>
          partsOf(c, "pot").length > 0 &&
          ((connected(c, { type: "pot", pin: "a" }, POS) && connected(c, { type: "pot", pin: "b" }, NEG)) ||
            (connected(c, { type: "pot", pin: "a" }, NEG) && connected(c, { type: "pot", pin: "b" }, POS))),
        ),
      ],
      hint: "The outer legs are the left and right ones, in columns 11 and 13. Wire column 11 to the + rail and column 13 to the − rail. Leave the middle leg alone for now.",
      after: "Current now flows through the whole track, but we have not measured anything yet.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [], [wire(hole(11, 14), hole(11, 17), RED), wire(hole(13, 14), hole(13, 18), BLACK)]) }),
    },
    {
      title: "Connect a multimeter",
      body: [
        "A **multimeter** measures voltage. It always measures the difference between two points, so it has two probes.",
        "- Place a multimeter on the bench. Leave it on the voltage setting.",
        "- Connect its **COM** probe (black) to the **− rail**.",
        "- Connect its **V** probe (red) to the potentiometer's **middle leg**, the wiper.",
      ].join("\n"),
      goals: [
        placed("meter", "A multimeter is on the bench"),
        prop("meter", "mode", "It is set to voltage (V)", (v) => v === "V"),
        joined("COM goes to the − rail", { type: "meter", pin: "com" }, NEG),
        joined("V goes to the wiper (middle leg)", { type: "meter", pin: "v" }, { type: "pot", pin: "w" }),
      ],
      spotlight: ["meter"],
      hint: "Place the meter beside the board. Click its black probe tip, then a hole in the − rail. Click its red probe tip, then a hole in the middle leg's column (column 12).",
      after: "The meter is connected in parallel with the lower part of the track: it measures how much voltage is across it.",
      solution: (prev) => ({
        ...prev,
        doc: add(prev.doc, [part("m1", "meter", 36, 22, { mode: "V" })], [wire(pin("m1", "com"), hole(29, 18), BLACK), wire(pin("m1", "v"), hole(12, 14), BLUE)]),
      }),
    },
    {
      title: "Dial in 3 volts",
      body: [
        "Press **Run**. Select the potentiometer and drag the **Knob position** slider until the meter reads **3 V**, give or take a tenth.",
        "The wiper voltage is 9 V × (the resistance below the wiper ÷ the whole track). Halfway up, that is 4.5 V.",
      ].join("\n\n"),
      goals: [
        running,
        seen("The meter reads 3 V (within 0.15)", (c) => {
          const m = partsOf(c, "meter")[0];
          const v = m ? c.snap?.parts[m.id]?.v : undefined;
          return v !== undefined && Math.abs(v - 3) < 0.15;
        }),
      ],
      hint: "Click the potentiometer, then move the slider in the side panel while watching the meter's display. Slide it about two thirds of the way along.",
      after: "You turned a knob position into a voltage. This is exactly what an Arduino's analog input measures.",
      solution: (prev) => ({ ...prev, doc: withProp(prev.doc, "pot1", "t", 0.667) }),
      demo: (d) => {
        d.run(0.3);
        d.setProp("pot", "t", 0.667);
        d.run(0.5);
      },
    },
    {
      title: "Find the extremes",
      body: "Now turn the knob all the way each way. At one end the wiper touches the + side and the meter should read nearly **9 V**. At the other it touches the − side and the meter should read nearly **0 V**.",
      goals: [
        seen("The meter read close to 0 V", (c) => {
          const m = partsOf(c, "meter")[0];
          const v = m ? c.snap?.parts[m.id]?.v : undefined;
          return v !== undefined && Math.abs(v) < 0.15;
        }),
        seen("The meter read close to 9 V", (c) => {
          const m = partsOf(c, "meter")[0];
          const v = m ? c.snap?.parts[m.id]?.v : undefined;
          return v !== undefined && v > 8.85;
        }),
      ],
      hint: "Drag the Knob position slider fully to the left, then fully to the right.",
      after: "The wiper can only produce voltages between the two rails. That is the rule for every voltage divider.",
      solution: (prev) => prev,
      demo: (d) => {
        d.setProp("pot", "t", 0.99);
        d.run(0.3);
        d.setProp("pot", "t", 0.01);
        d.run(0.3);
      },
    },
  ],
  takeaways: [
    "A voltmeter measures the difference between two points, in parallel with what it measures.",
    "A potentiometer across a supply makes a voltage that follows the knob: a voltage divider.",
    "The wiper can only give voltages between the two ends of the supply.",
  ],
};

/* ------------------------------------------------------------------ */

const buttonStart = () =>
  add(poweredBoard(), [part("r1", "resistor", 8, 12, { ohms: 330 }), part("led1", "led", 12, 11, { color: "red" })], [wire(hole(13, 14), hole(13, 18), BLACK)]);

const button: Lesson = {
  id: "button",
  title: "Control it with a button",
  track: "circuits",
  level: "Beginner",
  minutes: 8,
  summary: "Add a push button to a circuit so the LED lights only while you hold it.",
  start: { doc: buttonStart(), code: "" },
  next: "transistor",
  steps: [
    {
      title: "Place a push button",
      body: [
        "A **push button** connects its two sides only while you press it. Its four legs are joined in pairs: the two legs on the left are always connected to each other, and so are the two on the right. Pressing joins left to right.",
        "Place one across the **centre gap** of the breadboard, so the pairs sit in separate columns.",
      ].join("\n\n"),
      goals: [seated("button", "A push button is plugged into the breadboard")],
      spotlight: ["button"],
      hint: "Drag it from the Parts list and drop it so two legs are above the gap and two below.",
      after: "The gap in the middle of the breadboard keeps the two halves apart, which is what lets a four-legged part straddle it.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [part("btn", "button", 20, 8)]) }),
    },
    {
      title: "Wire it into the circuit",
      body: [
        "The circuit so far has a resistor and an LED waiting for power. Put the button in the path between the supply and the resistor, so the button is the switch.",
        "- Connect one side of the button to the **+ rail**.",
        "- Connect the other side to the resistor's **free end** (the end not touching the LED).",
      ].join("\n"),
      goals: [
        joined("One side of the button reaches the + rail", { type: "button" }, POS),
        shape("The other side reaches the resistor's free end", (c) => {
          const [btn] = partsOf(c, "button");
          const [res] = partsOf(c, "resistor");
          if (!btn || !res) return false;
          const anodeNets = new Set(c.nets.resolve(ANODE).map((x) => x.net));
          const free = ["a", "b"].map((p) => c.nets.net(res.id, p)).find((n) => n !== undefined && !anodeNets.has(n));
          const plus = new Set(c.nets.resolve(POS).map((x) => x.net));
          return !!free && !plus.has(free) && ["a1", "a2", "b1", "b2"].some((p) => c.nets.net(btn.id, p) === free);
        }),
      ],
      hint: "Wire the button's right column down to the + rail. Then wire the resistor's free-end column (column 8) across to the button's left column.",
      after: "Now the only way for current to reach the resistor is through the button.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [], [wire(hole(22, 14), hole(22, 17), RED), wire(hole(8, 14), hole(20, 14), YELLOW)]) }),
    },
    {
      title: "Try it",
      body: "Press **Run**. The LED should be off. Now **hold the button** by pressing and holding it with your mouse: the LED lights while you hold it and goes dark when you let go.",
      goals: [
        running,
        seen("The LED lit while the button was held", (c) => c.trace.some((f) => f.pressed && anyLit(f, c.doc, "led"))),
        seen("The LED went dark when it was released", (c) => c.trace.some((f) => !f.pressed && !anyLit(f, c.doc, "led"))),
      ],
      hint: "Click and hold on the round button cap. The LED should respond immediately. Let go to turn it off.",
      after: "A button is a switch that closes the loop only while you press it. Take it away and no current can flow, so the LED goes out.",
      solution: (prev) => prev,
      demo: (d) => {
        d.run(0.6);
        d.press(true);
        d.run(0.6);
        d.press(false);
        d.run(0.6);
      },
    },
  ],
  takeaways: [
    "A switch or button turns a circuit on by completing the loop.",
    "A push button's legs are joined in pairs across the part; pressing joins the pairs.",
    "Parts that straddle the breadboard's centre gap keep their sides separate.",
  ],
};

/* ------------------------------------------------------------------ */

const transistorStart = () =>
  add(poweredBoard(), [part("r1", "resistor", 8, 12, { ohms: 470 }), part("led1", "led", 12, 11, { color: "red" })], [wire(hole(8, 14), hole(8, 17), RED)]);

const transistor: Lesson = {
  id: "transistor",
  title: "Switch a load with a transistor",
  track: "circuits",
  level: "Intermediate",
  minutes: 15,
  summary: "Use a transistor as an electronic switch: a tiny current controls a bigger one.",
  start: { doc: transistorStart(), code: "" },
  next: "blink",
  steps: [
    {
      title: "Meet the transistor",
      body: [
        "A microcontroller pin can supply only about 20 mA. Motors, relays and bright LEDs need more. A **transistor** is the answer: a small current into its **base** lets a much larger current flow from its **collector** to its **emitter**.",
        "Place an **NPN transistor** on the breadboard. Its three legs are the **emitter**, **base** and **collector**.",
      ].join("\n\n"),
      goals: [seated("npn", "An NPN transistor is plugged into the breadboard")],
      spotlight: ["npn"],
      hint: "Drag the NPN transistor from the Parts list and drop it so its three legs land in three neighbouring columns, to the right of the LED.",
      after: "The LED and its resistor are waiting for a path to ground. The transistor will be that path, opened and closed by the base.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [part("q1", "npn", 15, 14)]) }),
    },
    {
      title: "Emitter to ground",
      body: "The load current flows out through the emitter, so connect the transistor's **emitter** to the **− rail**. (With the flat side facing you, the legs read emitter, base, collector from the left. Hover a leg to check.)",
      goals: [joined("The emitter reaches the − rail", { type: "npn", pin: "e" }, NEG)],
      hint: "The emitter is the left leg. Wire the column it sits in to the blue − rail.",
      after: "The emitter is the transistor's exit to ground.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [], [wire(hole(15, 15), hole(15, 18), BLACK)]) }),
    },
    {
      title: "Load to the collector",
      body: "The current we want to switch is the one through the LED. Connect the LED's **cathode** to the transistor's **collector**, so the transistor sits between the LED and ground.",
      goals: [joined("The LED's cathode is joined to the collector", CATHODE, { type: "npn", pin: "c" })],
      hint: "The collector is the right-hand leg. Run a wire between the LED cathode's column (13) and the collector's column.",
      after: "The path is now: + rail, resistor, LED, collector, emitter, − rail. It is complete except that the transistor blocks it, because nothing is driving its base.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [], [wire(hole(13, 12), hole(17, 12), YELLOW)]) }),
    },
    {
      title: "Add a base resistor",
      body: [
        "The base needs a small current, through a resistor. Without one, current into the base would be limited only by the 0.7 V junction, and the transistor would burn.",
        "Place a second resistor with one end in the **base's column**, and set it to about **1 kΩ**.",
      ].join("\n\n"),
      goals: [
        placed("resistor", "A second resistor is on the bench", 2),
        shape("One end of a 680 Ω to 10 kΩ resistor is joined to the base", (c) =>
          partsOf(c, "resistor").some((r) => {
            const ohms = Number(r.props.ohms);
            return ohms >= 680 && ohms <= 10000 && ["a", "b"].some((p) => c.nets.net(r.id, p) === c.nets.net(partsOf(c, "npn")[0]?.id ?? "", "b"));
          }),
        ),
      ],
      spotlight: ["resistor"],
      hint: "The base is the middle leg, in column 16. Put the second resistor's left lead in that column, and set its value to 1k.",
      after: "With a 1 kΩ base resistor and a 9 V supply, the base gets about (9 V − 0.7 V) ÷ 1 kΩ ≈ 8 mA when the button is pressed, plenty to switch on a load of 15 mA.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [part("rb", "resistor", 16, 13, { ohms: 1000 })]) }),
    },
    {
      title: "Add the control button",
      body: [
        "Finally, give the base a signal. Place a **push button** across the centre gap. Connect one side to the **+ rail** and the other side to the base resistor's free end.",
        "Pressing the button will send current through the base resistor into the base.",
      ].join("\n\n"),
      goals: [
        seated("button", "A push button is plugged into the breadboard"),
        joined("One side of the button reaches the + rail", { type: "button" }, POS),
        shape("The other side reaches the base resistor's free end", (c) => {
          const [btn] = partsOf(c, "button");
          const q = partsOf(c, "npn")[0];
          if (!btn || !q) return false;
          const base = c.nets.net(q.id, "b");
          const plus = new Set(c.nets.resolve(POS).map((x) => x.net));
          return partsOf(c, "resistor").some((r) => {
            const nets = ["a", "b"].map((p) => c.nets.net(r.id, p));
            if (!nets.includes(base)) return false;
            const free = nets.find((n) => n !== base);
            return !!free && !plus.has(free) && ["a1", "a2", "b1", "b2"].some((p) => c.nets.net(btn.id, p) === free);
          });
        }),
      ],
      spotlight: ["button"],
      hint: "Put the button at the right of the board across the gap. Its left column should be the same column as the base resistor's right lead. Wire the button's other column to the + rail.",
      after: "Everything is connected. When the button is up, the base gets nothing and the LED is off.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [part("btn", "button", 20, 8)], [wire(hole(22, 14), hole(22, 17), RED)]) }),
    },
    {
      title: "Try it",
      body: "Press **Run**, then hold the button. A small base current switches on the much bigger LED current. Select the transistor to see both currents.",
      goals: [
        running,
        seen("The LED lit while the button was held", (c) => c.trace.some((f) => f.pressed && anyLit(f, c.doc, "led"))),
        seen("The LED was dark when it was released", (c) => c.trace.some((f) => !f.pressed && !anyLit(f, c.doc, "led"))),
      ],
      hint: "Hold the button down with your mouse. If nothing happens, select the transistor and read its State: it should say Saturated when the button is held.",
      after: (c) => {
        const q = partsOf(c, "npn")[0];
        const x = q ? c.snap?.parts[q.id]?.extra : undefined;
        return x
          ? `While the button was held, the base took ${x["Base current"]} and the collector carried ${x["Collector current"]}. Bigger current, smaller one in control. That is a transistor switch.`
          : "A small base current controls a much larger collector current. That is a transistor switch.";
      },
      solution: (prev) => prev,
      demo: (d) => {
        d.run(0.4);
        d.press(true);
        d.run(0.5);
        d.press(false);
        d.run(0.5);
      },
    },
  ],
  takeaways: [
    "A small base current controls a much larger collector-to-emitter current.",
    "Always put a resistor in series with the base.",
    "Used as a switch, the transistor is either off or fully on (saturated).",
    "This is how a microcontroller pin switches motors, relays and bright lights.",
  ],
};

export const circuitLessons: Lesson[] = [firstCircuit, voltage, button, transistor];
