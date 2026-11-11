import { SKETCHES } from "@/sim/sketches.mjs";
import { add, BLACK, BLUE, breadboard, doc, hole, ORANGE, part, pin, RED, wire } from "../author";
import { anyLit, built, codeHas, joined, noTrouble, placed, prop, running, seated, seen, seriesResistor, serialHas, serialNumbers, shape, stripComments, transitions } from "../goals";
import type { Ctx, Lesson, PinSpec } from "../types";

const UNO = (pins: string | string[]): PinSpec => ({ type: "uno", pin: pins });
const GND = UNO(["gnd1", "gnd2", "gnd3"]);
const ANODE: PinSpec = { type: "led", pin: "anode" };
const CATHODE: PinSpec = { type: "led", pin: "cathode" };

const uno = (x = -33, y = 0) => part("uno", "uno", x, y, { power: "usb" });
const benchWithGround = () => doc([breadboard(), uno()], [wire(pin("uno", "gnd2"), hole(1, 18), BLACK)]);

/** A resistor and LED on the breadboard, wired from `signal` to ground. */
const ledBranch = (signal: string, resX: number, color: string) => ({
  parts: [part("r1", "resistor", resX, 12, { ohms: 330 }), part("led1", "led", resX + 4, 11, { color })],
  wires: [wire(pin("uno", signal), hole(resX, 14), ORANGE), wire(hole(resX + 5, 14), hole(resX + 5, 18), BLACK)],
});

const ledOn = (f: { parts: Record<string, { glow?: number }> }, c: Ctx) => anyLit(f as never, c.doc, "led", 0.15);

const TEMPLATE_BLINK = `// Blink an LED connected to pin 13.

void setup() {
  // 1. Make pin 13 an output.
}

void loop() {
  // 2. Switch the LED on, wait, switch it off, wait.
}
`;

const TEMPLATE_BUTTON = `// Light the LED on pin 8 while the button on pin 2 is held.

void setup() {
  // Set up the button (INPUT_PULLUP) and the LED (OUTPUT).
}

void loop() {
  // Read the button, then switch the LED to match.
}
`;

const TEMPLATE_KNOB = `// Read the knob on A0 and use it to dim the LED on pin 9.

void setup() {
  // Start the serial monitor and set up the LED pin.
}

void loop() {
  // Read the knob, show it, and set the LED brightness.
}
`;

const TEMPLATE_SERVO = `// Sweep a servo on pin 9 from 0 to 180 degrees and back.

void setup() {
}

void loop() {
}
`;

/* ------------------------------------------------------------------ */

const blinkStart = () => ({ doc: benchWithGround(), code: TEMPLATE_BLINK });

const blink: Lesson = {
  id: "blink",
  title: "Blink: your first sketch",
  track: "arduino",
  level: "Beginner",
  minutes: 15,
  summary: "Wire an LED to an Arduino and write the program that blinks it.",
  start: blinkStart(),
  next: "button-input",
  steps: [
    {
      title: "Build the LED branch",
      body: [
        "The Uno is on the bench, with its **GND** pin already wired to the breadboard's − rail. You will connect an LED to one of its pins.",
        "First, plug in an **LED** and a **resistor**. One end of the resistor shares a column with the LED's **anode** (the long leg). Set the resistor to **330 Ω**.",
      ].join("\n\n"),
      goals: [
        seated("led", "An LED is plugged into the breadboard"),
        seated("resistor", "A resistor is plugged into the breadboard"),
        joined("The resistor shares a column with the LED's anode (long leg)", { type: "resistor" }, ANODE),
        prop("resistor", "ohms", "The resistor is 220 Ω or more", (v) => Number(v) >= 220),
      ],
      spotlight: ["led", "resistor"],
      hint: "Put the resistor's right lead in the same column as the LED's left leg, as in the first lesson. A pin can give about 20 mA, so a 330 Ω resistor is a safe choice.",
      after: "An Arduino pin outputs 5 V, so the resistor must drop about 3 V at 10 mA or so. 330 Ω keeps well within a pin's limit.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [part("r1", "resistor", 5, 12, { ohms: 330 }), part("led1", "led", 9, 11, { color: "red" })]) }),
    },
    {
      title: "Wire it to pin 13 and ground",
      body: [
        "- Run a wire from the Uno's **pin 13** (a socket in the top row, near the left of the group of six) to the resistor's **free end** (the end not touching the LED).",
        "- Run a wire from the LED's **cathode** (the short leg) to the **− rail**, which is already connected to ground.",
        "Hover over a socket on the Uno to read its name.",
      ].join("\n"),
      goals: [
        shape("Pin 13 reaches the resistor's free end", (c) => seriesResistor(c, ANODE, UNO("d13"))),
        joined("The LED's cathode reaches ground", CATHODE, GND),
      ],
      hint: "Pin 13 is the leftmost of the six sockets labelled 13, 12, ~11, ~10, ~9, 8. Wire it to the resistor's column on the left, then wire the LED's right column down to the blue rail.",
      after: "The circuit is ready. When pin 13 is HIGH (5 V), current flows through the resistor and LED to ground. When it is LOW (0 V), no current flows.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [], [wire(pin("uno", "d13"), hole(5, 14), ORANGE), wire(hole(10, 14), hole(10, 18), BLACK)]) }),
    },
    {
      title: "Write the program",
      body: [
        "A sketch has two parts. `setup()` runs once at the start. `loop()` runs over and over, forever.",
        "Open the **Code** panel. In `setup()`, make pin 13 an output with `pinMode(13, OUTPUT);`.",
        "In `loop()`, switch the pin on with `digitalWrite(13, HIGH);`, wait with `delay(500);` (milliseconds), switch it off with `digitalWrite(13, LOW);`, and wait again.",
      ].join("\n\n"),
      goals: [
        codeHas("pinMode makes the pin an output", /pinMode\s*\([^)]*OUTPUT/),
        codeHas("digitalWrite sets it HIGH", /digitalWrite\s*\([^)]*HIGH/),
        codeHas("digitalWrite sets it LOW", /digitalWrite\s*\([^)]*LOW/),
        codeHas("delay waits between", /delay\s*\(\s*\d+/),
      ],
      hint: "Each statement ends with a semicolon. If you get stuck, press Show me to see the finished sketch.",
      after: "pinMode(13, OUTPUT) tells the chip to drive that pin. digitalWrite sets it to 5 V or 0 V. delay waits that many milliseconds.",
      solution: (prev) => ({ ...prev, code: SKETCHES.blink }),
    },
    {
      title: "Upload and run",
      body: "Press **Upload and run** in the Code panel. Your sketch is compiled to machine code for the chip, loaded onto the board, and started. The LED, and the small **L** light on the Uno, should blink once a second.",
      goals: [built, running, seen("The LED blinked", (c) => transitions(c.trace, (f) => ledOn(f, c)) >= 2)],
      hint: "If you see a compiler error, the message tells you the line. A missing semicolon or a misspelt name such as digitalwrite is the usual cause.",
      after: "The chip is running your program at 16 million steps a second. Each blink is a pin going HIGH then LOW, half a second apart.",
      solution: (prev) => prev,
      demo: (d) => d.run(2.5),
    },
    {
      title: "Make it faster",
      body: "Change both `delay(500)` calls to **`delay(200)`**, then upload again. The LED should blink two and a half times faster.",
      goals: [
        shape("Every delay is 250 ms or less", (c) => [...stripComments(c.code).matchAll(/delay\s*\(\s*(\d+)\s*\)/g)].every((m) => Number(m[1]) <= 250)),
        built,
        seen("The LED is blinking quickly", (c) => transitions(c.trace, (f) => ledOn(f, c)) >= 6),
      ],
      hint: "Change the number inside each delay( ) and press Upload and run again. Show me loads a finished version.",
      after: "Because the loop runs forever, changing the delays changes the blink rate. This is how you control timing in a sketch.",
      solution: (prev) => ({ ...prev, code: SKETCHES.blinkfast }),
      demo: (d) => d.run(3),
    },
  ],
  takeaways: [
    "setup() runs once; loop() runs forever.",
    "pinMode sets a pin as input or output; digitalWrite sets an output HIGH (5 V) or LOW (0 V).",
    "delay(ms) pauses the program.",
    "An LED on a pin always needs a series resistor.",
  ],
};

/* ------------------------------------------------------------------ */

const buttonInputStart = () => {
  const b = ledBranch("d8", 5, "yellow");
  return { doc: add(benchWithGround(), b.parts, b.wires), code: TEMPLATE_BUTTON };
};

const buttonInput: Lesson = {
  id: "button-input",
  title: "Read a button",
  track: "arduino",
  level: "Beginner",
  minutes: 15,
  summary: "Make the Arduino react to the outside world with a button and INPUT_PULLUP.",
  start: buttonInputStart(),
  next: "knob",
  steps: [
    {
      title: "Place the button",
      body: [
        "An LED on **pin 8** is already wired. You will add a push button that the sketch can read.",
        "Place a **push button** across the breadboard's centre gap.",
      ].join("\n\n"),
      goals: [seated("button", "A push button is plugged into the breadboard")],
      spotlight: ["button"],
      hint: "Drag it from the Parts list. Two legs go above the gap, two below.",
      after: "Remember: the legs are joined in pairs, left and right, and pressing joins the pairs together.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [part("btn", "button", 20, 8)]) }),
    },
    {
      title: "Wire it to pin 2 and ground",
      body: [
        "This uses a trick: instead of a resistor, the chip has a built-in **pull-up** that holds an input at 5 V when nothing is connected. Wire the button so that pressing it connects the pin to **ground**.",
        "- Connect one side of the button to the Uno's **pin 2**.",
        "- Connect the other side to the **− rail** (ground).",
      ].join("\n"),
      goals: [
        joined("One side of the button reaches pin 2", { type: "button" }, UNO("d2")),
        joined("The other side reaches ground", { type: "button" }, GND),
      ],
      hint: "Pin 2 is in the group of eight sockets to the right of the top row. Wire it to one column of the button, and wire the button's other column to the blue rail.",
      after: "Idle, pin 2 is pulled up to 5 V. Pressed, the button connects it to 0 V. So the sketch sees HIGH normally and LOW when pressed, the opposite of what you might expect.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [], [wire(pin("uno", "d2"), hole(20, 5), "#2f9e44"), wire(hole(22, 14), hole(22, 18), BLACK)]) }),
    },
    {
      title: "Read the button in code",
      body: [
        "In `setup()`, set the button pin as `INPUT_PULLUP` and the LED pin as `OUTPUT`.",
        "In `loop()`, read the button with `digitalRead(2)`. It returns `LOW` when pressed. Write the result to the LED with `digitalWrite(8, ...)`.",
      ].join("\n\n"),
      goals: [
        codeHas("The button pin uses INPUT_PULLUP", /pinMode\s*\([^)]*INPUT_PULLUP/),
        codeHas("The LED pin is an OUTPUT", /pinMode\s*\([^)]*OUTPUT/),
        codeHas("digitalRead reads the button", /digitalRead\s*\(/),
        codeHas("digitalWrite drives the LED", /digitalWrite\s*\(/),
      ],
      hint: "bool pressed = (digitalRead(2) == LOW); digitalWrite(8, pressed); reads the button and sets the LED to match. Show me gives the full sketch.",
      after: "digitalRead returns HIGH or LOW. Because of the pull-up, pressing the button makes it LOW.",
      solution: (prev) => ({ ...prev, code: SKETCHES.button }),
    },
    {
      title: "Upload and test",
      body: "Upload the sketch and **hold the button**. The LED should light while it is held. Open the **Serial monitor** tab to see the messages the sketch prints each time you press or release it.",
      goals: [
        built,
        running,
        seen("The LED lit while the button was held", (c) => c.trace.some((f) => f.pressed && ledOn(f, c))),
        seen("The LED was off when it was released", (c) => c.trace.some((f) => !f.pressed && !ledOn(f, c))),
        serialHas("The serial monitor logged a press", /Button pressed/),
      ],
      hint: "Click and hold the button cap on the bench while the sketch runs.",
      after: "The chip is reading pin 2 thousands of times a second. When it sees LOW, it sets pin 8 HIGH.",
      solution: (prev) => prev,
      demo: (d) => {
        d.run(0.5);
        d.press(true);
        d.run(0.5);
        d.press(false);
        d.run(0.5);
      },
    },
  ],
  takeaways: [
    "INPUT_PULLUP turns on a built-in resistor that holds the pin HIGH.",
    "Wire a button between the pin and ground; pressed reads LOW.",
    "digitalRead returns HIGH or LOW, which you can feed straight into digitalWrite.",
    "Serial.println lets the sketch tell you what it is doing.",
  ],
};

/* ------------------------------------------------------------------ */

const knobStart = () => {
  const b = ledBranch("d9", 17, "blue");
  return { doc: add(benchWithGround(), b.parts, b.wires), code: TEMPLATE_KNOB };
};

const knob: Lesson = {
  id: "knob",
  title: "Read a knob (analog input)",
  track: "arduino",
  level: "Intermediate",
  minutes: 15,
  summary: "Read a voltage with analogRead, print it, and use it to dim an LED.",
  start: knobStart(),
  next: "servo",
  steps: [
    {
      title: "Place a potentiometer",
      body: "A blue LED on **pin 9** is already wired. Pin 9 can do **PWM**, which lets the sketch dim the LED. Now add a **potentiometer**: its middle leg will give the Arduino a voltage that follows the knob.",
      goals: [seated("pot", "A potentiometer is plugged into the breadboard")],
      spotlight: ["pot"],
      hint: "Plug the potentiometer in at the left of the board, so its three legs sit in three neighbouring columns.",
      after: "The Uno will measure the voltage at the potentiometer's middle leg.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [part("pot1", "pot", 11, 12, { ohms: 10000, t: 0.5 })]) }),
    },
    {
      title: "Wire it to 5 V, ground and A0",
      body: [
        "- Connect one outer leg to the Uno's **5V** and the other outer leg to **ground**. (Wire the 5V pin to the + rail first and use the rail.)",
        "- Connect the **middle leg** to the analog pin **A0**.",
      ].join("\n"),
      goals: [
        shape("The outer legs go to 5V and ground", (c) => {
          const has = (a: PinSpec, b: PinSpec) => c.nets.resolve(a).some((x) => c.nets.resolve(b).some((y) => x.net === y.net && x.partId !== y.partId));
          const a: PinSpec = { type: "pot", pin: "a" }, b: PinSpec = { type: "pot", pin: "b" };
          return (has(a, UNO("5v")) && has(b, GND)) || (has(a, GND) && has(b, UNO("5v")));
        }),
        joined("The middle leg (wiper) reaches A0", { type: "pot", pin: "w" }, UNO("a0")),
      ],
      hint: "Wire the Uno's 5V pin to the red + rail, then each outer leg's column to the rails. A0 is the leftmost socket in the group of six at the bottom right of the Uno.",
      after: "Now the potentiometer divides 5 V. The wiper voltage runs from 0 V to 5 V as you turn the knob.",
      solution: (prev) => ({
        ...prev,
        doc: add(prev.doc, [], [
          wire(pin("uno", "5v"), hole(1, 17), RED),
          wire(hole(11, 14), hole(11, 17), RED),
          wire(hole(13, 14), hole(13, 18), BLACK),
          wire(pin("uno", "a0"), hole(12, 14), BLUE),
        ]),
      }),
    },
    {
      title: "Read and show the value",
      body: [
        "`analogRead(A0)` measures the voltage on A0 and returns a number from **0** (0 V) to **1023** (5 V).",
        "In `setup()`, start the serial connection with `Serial.begin(9600);` and make pin 9 an output. In `loop()`, read A0, print it with `Serial.println(...)`, and set the LED brightness with `analogWrite(9, value)`. `analogWrite` takes 0 to 255, so divide the reading by 4.",
      ].join("\n\n"),
      goals: [
        codeHas("Serial.begin starts the serial connection", /Serial\.begin\s*\(/),
        codeHas("analogRead reads the knob", /analogRead\s*\(/),
        codeHas("Serial.print or println shows the reading", /Serial\.print(ln)?\s*\(/),
        codeHas("analogWrite sets the LED brightness", /analogWrite\s*\(/),
      ],
      hint: "int raw = analogRead(A0); analogWrite(9, raw / 4); Serial.println(raw); is the core of it. Show me gives the full sketch.",
      after: "analogRead converts the voltage into a number the program can use. 1023 steps across 5 V is about 5 mV per step.",
      solution: (prev) => ({ ...prev, code: SKETCHES.knob }),
    },
    {
      title: "Turn the knob",
      body: "Upload and run. Select the potentiometer and move its **Knob position** slider fully each way. Watch the **Serial monitor**: it should reach close to **0** at one end and close to **1023** at the other, and the LED should fade with it.",
      goals: [
        built,
        running,
        seen("The reading went close to 0", (c) => Math.min(...serialNumbers(c.serial, /reading/), 1e9) <= 20),
        seen("The reading went close to 1023", (c) => Math.max(...serialNumbers(c.serial, /reading/), -1) >= 1000),
        noTrouble,
      ],
      hint: "Drag the slider all the way left, wait a moment, then all the way right.",
      after: "A knob, a voltage, a number, a brightness: the whole chain you just built. This is how every analog sensor reaches a microcontroller.",
      solution: (prev) => prev,
      demo: (d) => {
        d.setProp("pot", "t", 0.0);
        d.run(0.7);
        d.setProp("pot", "t", 1.0);
        d.run(0.7);
      },
    },
  ],
  takeaways: [
    "analogRead turns a voltage from 0 to 5 V into a number from 0 to 1023.",
    "analogWrite makes a PWM signal from 0 to 255 to dim an LED.",
    "Serial.println shows values in the serial monitor.",
    "Many sensors are just resistors whose value changes, wired as a voltage divider.",
  ],
};

/* ------------------------------------------------------------------ */

const servoStart = () => ({ doc: doc([uno(-30, 2)]), code: TEMPLATE_SERVO });

const servo: Lesson = {
  id: "servo",
  title: "Move a servo",
  track: "arduino",
  level: "Intermediate",
  minutes: 12,
  summary: "Wire a servo and use the Servo library to turn it to an angle.",
  start: servoStart(),
  steps: [
    {
      title: "Connect the servo",
      body: [
        "A **servo** turns its horn to an angle you command. It has three wires: **brown** (GND), **red** (power) and **orange** (signal).",
        "- Place a **servo** on the bench.",
        "- Connect GND to a **GND** socket, V+ to **5V**, and the signal to **pin 9**.",
      ].join("\n"),
      goals: [
        placed("servo", "A servo is on the bench"),
        joined("GND reaches a GND socket", { type: "servo", pin: "gnd" }, GND),
        joined("V+ reaches 5V", { type: "servo", pin: "vcc" }, UNO("5v")),
        joined("Signal reaches pin 9", { type: "servo", pin: "sig" }, UNO("d9")),
      ],
      spotlight: ["servo"],
      hint: "The sockets are along the bottom edge of the Uno: 5V and GND are in the power group. Pin 9 is in the top row, in the group marked ~9. Hover a servo wire end to see its name.",
      after: "The servo draws a few hundred milliamps when it moves. A servo this small can share the Uno's 5 V, but bigger ones need their own supply.",
      solution: (prev) => ({
        ...prev,
        doc: add(prev.doc, [part("sv", "servo", 8, 24)], [
          wire(pin("sv", "gnd"), pin("uno", "gnd2"), BLACK),
          wire(pin("sv", "vcc"), pin("uno", "5v"), RED),
          wire(pin("sv", "sig"), pin("uno", "d9"), ORANGE),
        ]),
      }),
    },
    {
      title: "Sweep it with code",
      body: [
        "Add `#include <Servo.h>` at the top, then create a servo with `Servo arm;`.",
        "In `setup()`, attach it to pin 9: `arm.attach(9);`. In `loop()`, use a `for` loop to call `arm.write(angle);` for angles 0 up to 180 and back, with a short `delay(15);` between steps so the servo can keep up.",
      ].join("\n\n"),
      goals: [
        codeHas("The Servo library is included", /#include\s*<Servo\.h>/),
        codeHas("A Servo is attached to pin 9", /\.attach\s*\(\s*9\s*\)/),
        codeHas("write() sets the angle", /\.write\s*\(/),
        codeHas("delay gives the servo time to move", /delay\s*\(/),
      ],
      hint: "for (int angle = 0; angle <= 180; angle += 2) { arm.write(angle); delay(15); } sweeps one way. Add a second loop going down. Show me gives the full sketch.",
      after: "The Servo library sends the 20 ms pulse train for you. write(angle) turns an angle into a pulse between about 0.5 and 2.4 milliseconds wide.",
      solution: (prev) => ({ ...prev, code: SKETCHES.servo }),
    },
    {
      title: "Watch it sweep",
      body: "Upload and run. Select the servo to see the angle and the **pulse width** the sketch is sending. The horn should sweep through its whole range.",
      goals: [
        built,
        running,
        seen("The horn reached 170° or more", (c) => c.trace.some((f) => Object.values(f.parts).some((p) => (p.deg ?? 0) >= 170))),
        seen("The horn came back to 10° or less", (c) => c.trace.some((f) => Object.values(f.parts).some((p) => p.deg !== undefined && p.deg <= 10))),
      ],
      hint: "Give it a few seconds: a full sweep takes about a second and a half in each direction.",
      after: "A short pulse (about 0.5 ms) means 0°; a long one (about 2.4 ms) means 180°. The servo's own electronics compare the pulse width with its shaft position and drive the motor until they match.",
      solution: (prev) => prev,
      demo: (d) => d.run(3),
    },
  ],
  takeaways: [
    "A servo is told an angle by the width of a pulse repeated every 20 ms.",
    "The Servo library does that for you: attach a pin, then write an angle.",
    "Motors draw much more current than a pin can supply: give servos power from 5V, not from a signal pin.",
  ],
};

export const arduinoLessons: Lesson[] = [blink, buttonInput, knob, servo];
