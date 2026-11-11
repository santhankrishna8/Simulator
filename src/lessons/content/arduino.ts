import { pixel } from "@/sim/ssd1306";
import { SKETCHES } from "@/sim/sketches.mjs";
import { add, BLACK, BLUE, breadboard, doc, GREEN, hole, ORANGE, part, pin, RED, wire, YELLOW } from "../author";
import { anyLit, built, codeHas, joined, noTrouble, partsOf, placed, prop, running, seated, seen, seriesResistor, serialHas, serialNumbers, shape, stripComments, transitions } from "../goals";
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
  next: "lcd",
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


/* ------------------------------------------------------------------ */

const TEMPLATE_LCD = `// Show "Hello, world!" on a 16x2 LCD wired in 4-bit mode.

void setup() {
}

void loop() {
}
`;

const lcdText = (c: Ctx) => {
  const lcd = partsOf(c, "lcd1602")[0];
  const rows = lcd ? c.snap?.parts[lcd.id]?.lcd?.rows : undefined;
  return rows ? rows.map((r) => String.fromCharCode(...r)).join("\n") : "";
};

const lcdLesson: Lesson = {
  id: "lcd",
  title: "Write to an LCD",
  track: "arduino",
  level: "Intermediate",
  minutes: 20,
  summary: "Wire a 16×2 character display, tune its contrast, and print text from your sketch.",
  start: { doc: doc([uno(-34, 0)]), code: TEMPLATE_LCD },
  next: "ultrasonic",
  steps: [
    {
      title: "Power the display",
      body: [
        "A character LCD has its own controller chip. Before it can show anything it needs power. Place a **16×2 LCD** on the bench.",
        "- Connect **VSS** to a **GND** socket.",
        "- Connect **VDD** to **5V**.",
        "- Connect **RW** to **GND** (we only ever write to the display).",
      ].join("\n"),
      goals: [
        placed("lcd1602", "An LCD is on the bench"),
        joined("VSS reaches GND", { type: "lcd1602", pin: "vss" }, GND),
        joined("VDD reaches 5V", { type: "lcd1602", pin: "vdd" }, UNO("5v")),
        joined("RW reaches GND", { type: "lcd1602", pin: "rw" }, GND),
      ],
      spotlight: ["lcd1602"],
      hint: "The display's pins are along its top edge, named in tiny letters. Hover a pin to read its name. 5V and GND are on the bottom edge of the Uno.",
      after: "The controller chip is now powered, but nothing is visible yet: it needs a backlight and the right contrast.",
      solution: (prev) => ({
        ...prev,
        doc: add(prev.doc, [part("lcd", "lcd1602", 2, 1)], [wire(pin("lcd", "vss"), pin("uno", "gnd2"), BLACK), wire(pin("lcd", "vdd"), pin("uno", "5v"), RED), wire(pin("lcd", "rw"), pin("uno", "gnd3"), BLACK)]),
      }),
    },
    {
      title: "Light the backlight",
      body: [
        "The backlight is an LED inside the display, so it needs a resistor just like any other LED.",
        "- Place a **220 Ω resistor**.",
        "- Connect pin **A** (backlight +) through the resistor to **5V**.",
        "- Connect pin **K** (backlight −) to **GND**.",
      ].join("\n"),
      goals: [
        shape("A resistor sits between pin A and 5V", (c) => seriesResistor(c, { type: "lcd1602", pin: "a" }, UNO("5v"))),
        prop("resistor", "ohms", "The resistor is 100 Ω or more", (v) => Number(v) >= 100),
        joined("K reaches GND", { type: "lcd1602", pin: "k" }, GND),
        seen("The backlight is on", (c) => {
          const lcd = partsOf(c, "lcd1602")[0];
          return !!lcd && (c.snap?.parts[lcd.id]?.lcd?.backlight ?? 0) > 0.2;
        }),
        running,
      ],
      spotlight: ["resistor"],
      hint: "Pins A and K are the two rightmost pins. Wire A to one end of the resistor, the other end of the resistor to 5V, and K to GND. Then press Run.",
      after: "Without the resistor the backlight LED would draw far too much current. With it, the glass glows.",
      solution: (prev) => ({
        ...prev,
        doc: add(prev.doc, [part("rbl", "resistor", 22, 24, { ohms: 220 })], [wire(pin("lcd", "a"), pin("rbl", "a"), RED), wire(pin("rbl", "b"), pin("uno", "5v"), RED), wire(pin("lcd", "k"), pin("uno", "gnd3"), BLACK)]),
      }),
      demo: (d) => d.run(0.5),
    },
    {
      title: "Set the contrast",
      body: [
        "Pin **V0** sets how dark the pixels are. Too high a voltage and the text is invisible; near 0 V it is a row of solid blocks. A **potentiometer** lets you dial in the right level, about 0.5 V.",
        "- Place a potentiometer.",
        "- Connect one outer leg to **5V** and the other to **GND**.",
        "- Connect the **middle leg** to **V0**.",
        "Press **Run**, select the potentiometer, and move its slider until the display shows a clear row of boxes or text.",
      ].join("\n"),
      goals: [
        shape("The potentiometer has 5V and GND on its outer legs", (c) => {
          const has = (a: PinSpec, b: PinSpec) => c.nets.resolve(a).some((x) => c.nets.resolve(b).some((y) => x.net === y.net && x.partId !== y.partId));
          const a: PinSpec = { type: "pot", pin: "a" }, b: PinSpec = { type: "pot", pin: "b" };
          return (has(a, UNO("5v")) && has(b, GND)) || (has(a, GND) && has(b, UNO("5v")));
        }),
        joined("The wiper reaches V0", { type: "pot", pin: "w" }, { type: "lcd1602", pin: "v0" }),
        running,
        seen("The contrast is readable", (c) => {
          const lcd = partsOf(c, "lcd1602")[0];
          return lcd ? c.snap?.parts[lcd.id]?.extra?.Contrast === "Readable" : false;
        }),
      ],
      spotlight: ["pot"],
      hint: "The wiper voltage is 5 V × (1 − knob position), so you want the knob well towards the end. Try 0.9 on the slider and look at the display's State in the panel.",
      after: "The display's contrast is set by one voltage. This is a voltage divider again, just like the multimeter lesson.",
      solution: (prev) => ({
        ...prev,
        doc: add(prev.doc, [part("pot1", "pot", 12, 25, { ohms: 10000, t: 0.9 })], [
          wire(pin("pot1", "a"), pin("uno", "5v"), RED), wire(pin("pot1", "b"), pin("uno", "gnd3"), BLACK), wire(pin("lcd", "v0"), pin("pot1", "w"), BLUE),
        ]),
      }),
      demo: (d) => d.run(0.5),
    },
    {
      title: "Wire the data lines",
      body: [
        "Now the signals. In 4-bit mode the display needs six wires from the Uno. Use these pins, which match the sketch you will write next:",
        "- **RS** to pin **12**",
        "- **E** (enable) to pin **11**",
        "- **D4** to pin **5**, **D5** to pin **4**, **D6** to pin **3**, **D7** to pin **2**",
        "D0 to D3 stay unconnected: 4-bit mode uses only D4 to D7, sent in two halves.",
      ].join("\n"),
      goals: [
        joined("RS reaches pin 12", { type: "lcd1602", pin: "rs" }, UNO("d12")),
        joined("E reaches pin 11", { type: "lcd1602", pin: "e" }, UNO("d11")),
        joined("D4 reaches pin 5", { type: "lcd1602", pin: "d4" }, UNO("d5")),
        joined("D5 reaches pin 4", { type: "lcd1602", pin: "d5" }, UNO("d4")),
        joined("D6 reaches pin 3", { type: "lcd1602", pin: "d6" }, UNO("d3")),
        joined("D7 reaches pin 2", { type: "lcd1602", pin: "d7" }, UNO("d2")),
      ],
      hint: "Work down the list one wire at a time. Hover a socket to check its name before you click it.",
      after: "RS says whether a byte is a command or a character. E says \"the data is ready, read it now\". The data pins carry the byte.",
      solution: (prev) => ({
        ...prev,
        doc: add(prev.doc, [], [
          wire(pin("lcd", "rs"), pin("uno", "d12"), YELLOW), wire(pin("lcd", "e"), pin("uno", "d11"), GREEN),
          wire(pin("lcd", "d4"), pin("uno", "d5"), ORANGE), wire(pin("lcd", "d5"), pin("uno", "d4"), BLUE),
          wire(pin("lcd", "d6"), pin("uno", "d3"), YELLOW), wire(pin("lcd", "d7"), pin("uno", "d2"), GREEN),
        ]),
      }),
    },
    {
      title: "Write the sketch",
      body: [
        "The **LiquidCrystal** library already knows how to talk to this display. Add `#include <LiquidCrystal.h>` at the top, then tell it which pins you wired: `LiquidCrystal lcd(12, 11, 5, 4, 3, 2);` (RS, E, D4, D5, D6, D7).",
        "In `setup()`, call `lcd.begin(16, 2);` to start it up, then `lcd.print(\"Hello, world!\");`.",
      ].join("\n\n"),
      goals: [
        codeHas("The LiquidCrystal library is included", /#include\s*<LiquidCrystal\.h>/),
        codeHas("It is told the pins: 12, 11, 5, 4, 3, 2", /LiquidCrystal\s+\w+\s*\(\s*12\s*,\s*11\s*,\s*5\s*,\s*4\s*,\s*3\s*,\s*2\s*\)/),
        codeHas("lcd.begin(16, 2) starts the display", /\.begin\s*\(\s*16\s*,\s*2\s*\)/),
        codeHas("lcd.print shows text", /\.print\s*\(/),
      ],
      hint: "The three lines that matter: LiquidCrystal lcd(12, 11, 5, 4, 3, 2); then lcd.begin(16, 2); then lcd.print(\"Hello, world!\"); in setup. Show me gives the full sketch.",
      after: "Until lcd.begin runs, the display is not initialised, so it only shows solid blocks. begin sends the start-up commands over the pins you wired.",
      solution: (prev) => ({ ...prev, code: SKETCHES.lcdhello }),
    },
    {
      title: "Read your message",
      body: "Upload and run. The display should show **Hello, world!** on the first row and a running **Uptime** counter on the second. Select the LCD to see its state.",
      goals: [
        built,
        running,
        seen("The first row says Hello", (c) => /Hello/.test(lcdText(c))),
        seen("The second row shows the uptime", (c) => /Uptime: \d/.test(lcdText(c))),
      ],
      hint: "If you only see blocks, the sketch has not run lcd.begin yet. If you see nothing, turn the contrast knob.",
      after: "Each character you print is turned into a pattern of dots by the display's own chip. The sketch only sends the letters.",
      solution: (prev) => prev,
      demo: (d) => d.run(2),
    },
  ],
  takeaways: [
    "A character LCD needs power, a backlight resistor, a contrast voltage and six signal wires.",
    "The LiquidCrystal library hides the data protocol: begin() then print().",
    "RS chooses command or data, E clocks it in, D4 to D7 carry the byte in two halves.",
    "Contrast is a voltage divider on pin V0.",
  ],
};

/* ------------------------------------------------------------------ */

const TEMPLATE_SONAR = `// Measure distance with an HC-SR04 ultrasonic sensor.

void setup() {
}

void loop() {
}
`;

const readings = (serial: string) => [...serial.matchAll(/(\d+(?:\.\d+)?) cm/g)].map((m) => Number(m[1]));

const ultrasonic: Lesson = {
  id: "ultrasonic",
  title: "Measure distance with sound",
  track: "arduino",
  level: "Intermediate",
  minutes: 15,
  summary: "Use an ultrasonic sensor to measure how far away an object is, and learn why the answer is the echo time divided by 58.",
  start: { doc: doc([uno(-30, 2)]), code: TEMPLATE_SONAR },
  next: "scope",
  steps: [
    {
      title: "Power the sensor",
      body: [
        "An **HC-SR04** sends a burst of ultrasound, too high for people to hear, and listens for the echo. It has four pins: **VCC**, **TRIG**, **ECHO** and **GND**.",
        "Place one on the bench, then connect **VCC** to **5V** and **GND** to a **GND** socket.",
      ].join("\n\n"),
      goals: [
        placed("hcsr04", "An ultrasonic sensor is on the bench"),
        joined("VCC reaches 5V", { type: "hcsr04", pin: "vcc" }, UNO("5v")),
        joined("GND reaches GND", { type: "hcsr04", pin: "gnd" }, GND),
      ],
      spotlight: ["hcsr04"],
      hint: "Hover each pin on the sensor to read its name. 5V and GND are on the bottom edge of the Uno.",
      after: "It needs a steady 5 V; with less, it will not make a reliable measurement.",
      solution: (prev) => ({
        ...prev,
        doc: add(prev.doc, [part("us", "hcsr04", 8, 20, { cm: 100 })], [wire(pin("us", "vcc"), pin("uno", "5v"), RED), wire(pin("us", "gnd"), pin("uno", "gnd2"), BLACK)]),
      }),
    },
    {
      title: "Wire the signals",
      body: [
        "Two pins carry signals. **TRIG** is an input to the sensor: you pulse it to ask for a measurement. **ECHO** is an output from it: it goes high for as long as the sound took to come back.",
        "Connect **TRIG** to pin **9** and **ECHO** to pin **10**.",
      ].join("\n\n"),
      goals: [
        joined("TRIG reaches pin 9", { type: "hcsr04", pin: "trig" }, UNO("d9")),
        joined("ECHO reaches pin 10", { type: "hcsr04", pin: "echo" }, UNO("d10")),
      ],
      hint: "Pin 9 and pin 10 are neighbours in the top row, in the group marked ~11, ~10, ~9. Take care to wire TRIG to 9 and ECHO to 10, not the other way round.",
      after: "The Uno will send a pulse out of pin 9 and time the pulse coming back on pin 10.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [], [wire(pin("us", "trig"), pin("uno", "d9"), YELLOW), wire(pin("us", "echo"), pin("uno", "d10"), GREEN)]) }),
    },
    {
      title: "Write the sketch",
      body: [
        "To measure: set TRIG low for 2 µs to be sure, then **high for 10 µs**, then low again. That pulse starts a measurement.",
        "Then `pulseIn(echoPin, HIGH)` waits for ECHO to go high, times how long it stays high, and returns that time in **microseconds**.",
        "Sound travels about 29 µs per centimetre, and the echo goes there and back, so **distance in cm = echo time ÷ 58**. Print it with `Serial.print`.",
      ].join("\n\n"),
      goals: [
        codeHas("TRIG is made an output and ECHO an input", /pinMode\s*\([^)]*OUTPUT/),
        codeHas("pulseIn times the echo", /pulseIn\s*\(/),
        codeHas("delayMicroseconds makes the short pulse", /delayMicroseconds\s*\(/),
        codeHas("The distance is printed", /Serial\.print(ln)?\s*\(/),
      ],
      hint: "digitalWrite(trigPin, HIGH); delayMicroseconds(10); digitalWrite(trigPin, LOW); long t = pulseIn(echoPin, HIGH); then print t / 58.0. Show me gives the full sketch.",
      after: "pulseIn counts microseconds with the chip's own timer, accurate to better than a millionth of a second. That is how the distance comes out to about half a centimetre.",
      solution: (prev) => ({ ...prev, code: SKETCHES.ultrasonic }),
    },
    {
      title: "Move the object",
      body: "Upload and run. Select the sensor and drag the **Object distance** slider. The serial monitor should follow: try **20 cm**, then **150 cm**.",
      goals: [
        built,
        running,
        seen("The reading was about 20 cm", (c) => readings(c.serial).some((r) => Math.abs(r - 20) < 1.5)),
        seen("The reading was about 150 cm", (c) => readings(c.serial).some((r) => Math.abs(r - 150) < 1.5)),
      ],
      hint: "Click the sensor, then use the Object distance slider in the side panel. Open the Serial monitor tab to read the numbers.",
      after: "Your sketch measured the speed of sound without knowing it: 343 metres per second is what makes 58 microseconds per centimetre of range.",
      solution: (prev) => prev,
      demo: (d) => {
        d.setProp("hcsr04", "cm", 20);
        d.run(1.2);
        d.setProp("hcsr04", "cm", 150);
        d.run(1.2);
      },
    },
  ],
  takeaways: [
    "A 10 µs pulse on TRIG starts a measurement; ECHO stays high for the sound's round trip.",
    "pulseIn measures a pulse's length in microseconds.",
    "Distance in cm = echo time in µs ÷ 58, because sound covers about 1 cm in 29 µs each way.",
    "Sensors like this turn a physical quantity into a time, which a microcontroller can measure very precisely.",
  ],
};

/* ------------------------------------------------------------------ */

const scopeStart = () => {
  const ports = benchWithGround();
  return {
    doc: add(ports, [part("r1", "resistor", 5, 12, { ohms: 10000 }), part("c1", "capacitor", 9, 11, { farads: 1e-6 })], [
      wire(pin("uno", "d9"), hole(5, 14), YELLOW), wire(pin("uno", "a0"), hole(9, 14), BLUE), wire(hole(10, 14), hole(10, 18), BLACK),
    ]),
    code: SKETCHES.pwmscope,
  };
};

const statsOf = (c: Ctx) => {
  const sc = partsOf(c, "scope")[0];
  return sc ? c.snap?.parts[sc.id]?.scope : undefined;
};

const scopeLesson: Lesson = {
  id: "scope",
  title: "See a signal with the oscilloscope",
  track: "arduino",
  level: "Intermediate",
  minutes: 15,
  summary: "Probe a PWM signal and its filtered result, and read frequency and duty cycle off the screen.",
  start: scopeStart(),
  next: "i2c",
  steps: [
    {
      title: "Put a scope on the bench",
      body: [
        "A multimeter gives you one number. An **oscilloscope** draws how a voltage changes over time, so you can see shapes you could never read from a number: pulses, waves, glitches.",
        "A sketch is already loaded: it makes a **PWM** signal on pin 9, which switches on and off about 490 times a second, and a resistor and capacitor smooth it into a steady voltage that pin A0 reads.",
        "Place an **oscilloscope** on the bench.",
      ].join("\n\n"),
      goals: [placed("scope", "An oscilloscope is on the bench")],
      spotlight: ["scope"],
      hint: "Find it in the Parts list under Instruments and drop it to the right of the breadboard.",
      after: "The scope has two probe pins, CH1 and CH2, and a ground clip.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [part("scope1", "scope", 36, 26, { tdiv: "0.002", v1div: "1", v2div: "1", trig: 2.5 })]) }),
    },
    {
      title: "Clip the ground, then probe",
      body: [
        "A scope measures voltage **relative to its ground clip**, so always connect that first.",
        "- Connect the **ground clip** (GND) to the **− rail** (which is joined to the Uno's GND).",
        "- Connect probe **CH1** to the PWM signal: the column the pin 9 wire goes into, next to the resistor.",
        "- Connect probe **CH2** to the smoothed voltage: the column that goes to pin A0.",
      ].join("\n"),
      goals: [
        joined("The ground clip reaches ground", { type: "scope", pin: "gnd" }, GND),
        joined("CH1 is on the pin 9 signal", { type: "scope", pin: "ch1" }, UNO("d9")),
        joined("CH2 is on the A0 node", { type: "scope", pin: "ch2" }, UNO("a0")),
      ],
      hint: "CH1 goes to the same column as the pin 9 wire (column 5). CH2 goes to the same column as the A0 wire (column 9).",
      after: "Probes only listen: they have a very high resistance, so they hardly change the circuit they measure.",
      solution: (prev) => ({
        ...prev,
        doc: add(prev.doc, [], [wire(pin("scope1", "ch1"), hole(5, 15), YELLOW), wire(pin("scope1", "ch2"), hole(9, 15), BLUE), wire(pin("scope1", "gnd"), hole(3, 18), BLACK)]),
      }),
    },
    {
      title: "Read the PWM wave",
      body: [
        "Press **Run** (it uploads the sketch for you). The yellow trace is pin 9: a square wave. For the first 1.5 seconds the sketch uses a **25 % duty cycle**: the pin is high a quarter of the time.",
        "The scope measures the signal itself: look at the top of its screen for the **frequency** (about 490 Hz) and the **duty cycle**.",
      ].join("\n\n"),
      goals: [
        built,
        running,
        seen("The scope read about 490 Hz", (c) => {
          const f = statsOf(c)?.stats1.freq;
          return f !== undefined && f > 470 && f < 510;
        }),
        seen("It read a duty cycle of about 25 %", (c) => {
          const d = statsOf(c)?.stats1.duty;
          return d !== undefined && d > 0.2 && d < 0.3;
        }),
      ],
      hint: "If the wave is not steady, set the scope's Time per division to 2 ms by selecting the scope and choosing it in the side panel.",
      after: (c) => {
        const s = statsOf(c);
        return s?.stats1.freq ? `The scope measured ${Math.round(s.stats1.freq)} Hz. That frequency is set by the chip's timer. The sketch only chooses the duty cycle: 64 out of 255 is about 25 %.` : "The frequency is set by the chip's timer; the sketch only chooses the duty cycle.";
      },
      solution: (prev) => prev,
      demo: (d) => d.run(1.2),
    },
    {
      title: "Slow the timebase",
      body: [
        "The cyan trace is the voltage after the resistor and capacitor. The filter smooths the fast pulses into their **average**: 25 % of 5 V is about 1.25 V, and 75 % is about 3.75 V.",
        "To see this change, select the scope and set **Time per division** to **50 ms** or more, so the screen covers half a second or longer. Then watch for the sketch to switch from 25 % to 75 %.",
      ].join("\n\n"),
      goals: [
        prop("scope", "tdiv", "The timebase is 50 ms per division or slower", (v) => Number(v) >= 0.05),
        seen("The smoothed voltage averaged about 1.25 V", (c) => {
          const m = statsOf(c)?.stats2.mean;
          return m !== undefined && m > 1.1 && m < 1.45;
        }),
        seen("Then it averaged about 3.75 V", (c) => {
          const m = statsOf(c)?.stats2.mean;
          return m !== undefined && m > 3.4 && m < 4.0;
        }),
      ],
      hint: "Click the scope, choose 50 ms under Time per division, and wait a few seconds. The serial monitor also prints the voltage on A0.",
      after: "Pulse-width modulation is a way to make an analog voltage from a digital pin: the duty cycle sets the average. It is how analogWrite dims an LED and sets motor speed.",
      solution: (prev) => ({ ...prev, doc: { ...prev.doc, parts: prev.doc.parts.map((p) => (p.id === "scope1" ? { ...p, props: { ...p.props, tdiv: "0.05" } } : p)) } }),
      demo: (d) => d.run(3.2),
    },
  ],
  takeaways: [
    "An oscilloscope shows voltage against time; connect its ground clip first.",
    "A PWM signal's frequency is fixed by the chip; the duty cycle is what the sketch chooses.",
    "The average voltage of a PWM signal is the duty cycle times the supply.",
    "A resistor and capacitor can smooth pulses into a steady voltage.",
  ],
};


/* ------------------------------------------------------------------ */

const TEMPLATE_I2C = `// Scan the I2C bus and list every device that answers.

void setup() {
}

void loop() {
}
`;

const oledWires = () => [
  wire(pin("oled", "gnd"), pin("uno", "gnd2"), BLACK),
  wire(pin("oled", "vcc"), pin("uno", "5v"), RED),
  wire(pin("oled", "scl"), pin("uno", "a5"), YELLOW),
  wire(pin("oled", "sda"), pin("uno", "a4"), GREEN),
];

const i2cLesson: Lesson = {
  id: "i2c",
  title: "Find devices on the I²C bus",
  track: "arduino",
  level: "Intermediate",
  minutes: 12,
  summary: "Wire a display to the two I²C pins and write a scanner that finds it by its address.",
  start: { doc: doc([uno(-30, 2)]), code: TEMPLATE_I2C },
  next: "oled",
  steps: [
    {
      title: "Power a display",
      body: [
        "**I²C** (say \"I-squared-C\") lets one microcontroller talk to many chips over just **two wires**. Every chip on the bus has a **7-bit address**, a number from 1 to 127, and only answers when it hears its own.",
        "Place an **OLED display** on the bench and give it power: connect **VCC** to **5V** and **GND** to a **GND** socket.",
      ].join("\n\n"),
      goals: [
        placed("oled", "An OLED display is on the bench"),
        joined("VCC reaches 5V", { type: "oled", pin: "vcc" }, UNO("5v")),
        joined("GND reaches GND", { type: "oled", pin: "gnd" }, GND),
      ],
      spotlight: ["oled"],
      hint: "Hover the display's four pins to read their names: GND, VCC, SCL, SDA. 5V and GND are on the bottom edge of the Uno.",
      after: "The display is powered, but the Uno cannot talk to it yet: that needs the two data wires.",
      solution: (prev) => ({
        ...prev,
        doc: add(prev.doc, [part("oled", "oled", 8, 8)], [wire(pin("oled", "gnd"), pin("uno", "gnd2"), BLACK), wire(pin("oled", "vcc"), pin("uno", "5v"), RED)]),
      }),
    },
    {
      title: "Wire the two bus lines",
      body: [
        "The bus is **SDA** (data) and **SCL** (clock). On an Uno they are not free to choose: the hardware I²C pins are **A4 for SDA** and **A5 for SCL**.",
        "Connect the display's **SDA** to **A4**, and its **SCL** to **A5**.",
      ].join("\n\n"),
      goals: [
        joined("SDA reaches A4", { type: "oled", pin: "sda" }, UNO("a4")),
        joined("SCL reaches A5", { type: "oled", pin: "scl" }, UNO("a5")),
      ],
      hint: "A4 and A5 are the last two sockets in the group of six on the bottom right of the Uno (they are also marked SDA and SCL at the top).",
      after: "Many chips can share these same two wires, each with its own address. That is why I²C is popular: sensors, displays and memory chips all on one pair.",
      solution: (prev) => ({ ...prev, doc: add(prev.doc, [], [wire(pin("oled", "scl"), pin("uno", "a5"), YELLOW), wire(pin("oled", "sda"), pin("uno", "a4"), GREEN)]) }),
    },
    {
      title: "Write the scanner",
      body: [
        "To check if an address answers, start a transmission to it and see if it **acknowledges** (ACK). In code:",
        "- `Wire.begin();` in `setup()` starts the bus.",
        "- `Wire.beginTransmission(address);` then `Wire.endTransmission();` asks that address. It returns **0** if a device answered.",
        "Loop `address` from 1 to 126, and `Serial.print` each one that answers.",
      ].join("\n"),
      goals: [
        codeHas("The Wire library is included", /#include\s*<Wire\.h>/),
        codeHas("Wire.begin() starts the bus", /Wire\.begin\s*\(\s*\)/),
        codeHas("beginTransmission and endTransmission ask an address", /beginTransmission\s*\([\s\S]*endTransmission\s*\(/),
        codeHas("It prints what it finds", /Serial\.print(ln)?\s*\(/),
      ],
      hint: "for (byte address = 1; address < 127; address++) { Wire.beginTransmission(address); if (Wire.endTransmission() == 0) { ...print it... } } Show me gives the whole sketch.",
      after: "endTransmission returns 0 for an ACK, and 2 if nobody answered the address. That is all a bus scanner is.",
      solution: (prev) => ({ ...prev, code: SKETCHES.i2cscan }),
    },
    {
      title: "Run the scan",
      body: "Upload and run, then open the **Serial monitor**. It should report one device at **0x3C**: that is the display's address, written in hexadecimal.",
      goals: [built, running, serialHas("The scan found a device at 0x3C", /Found a device at 0x3C/)],
      hint: "Open the Serial monitor tab to read the result. If it finds nothing, check the SDA and SCL wires.",
      after: "0x3C is 60 in everyday numbers. Most small OLEDs answer there; some use 0x3D, which you can choose in the display's settings.",
      solution: (prev) => prev,
      demo: (d) => d.run(1.5),
    },
    {
      title: "Break the bus",
      body: [
        "See what a missing wire looks like. Select the wire going to the display's **SDA** pin and press **Delete**. Then press **Reset**, and **Run** again.",
        "The scan should now report that it found nothing. When an I²C device is \"not detected\", this is the first test to run: wiring faults and missing power both look like this.",
      ].join("\n\n"),
      goals: [
        shape("The SDA wire is gone", (c) => !c.nets.resolve({ type: "oled", pin: "sda" }).some((x) => c.nets.resolve(UNO("a4")).some((y) => y.net === x.net))),
        serialHas("The scan found nothing", /No devices found/),
      ],
      hint: "Click the wire from the display's SDA pin to select it, press Delete, then press Reset and Run.",
      after: "Now you know how to diagnose an I²C device that will not show up: run the scanner, and if the address is missing, check power, then SDA and SCL.",
      solution: (prev) => ({ ...prev, doc: { ...prev.doc, wires: prev.doc.wires.filter((w) => !(w.a.part === "oled" && w.a.pin === "sda")) } }),
      demo: (d) => d.run(1.5),
    },
  ],
  takeaways: [
    "I²C uses two wires, SDA and SCL, shared by many devices.",
    "On an Uno, SDA is A4 and SCL is A5.",
    "Each device has an address; endTransmission() returning 0 means it answered.",
    "A scanner is the first thing to run when an I²C device does not respond.",
  ],
};

/* ------------------------------------------------------------------ */

const TEMPLATE_OLED = `// Draw text and a bar on a 128x64 OLED.

void setup() {
}

void loop() {
}
`;

const OLED_BEGIN = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.setTextColor(SSD1306_WHITE);
}

void loop() {
}
`;

const oledOf = (c: Ctx) => {
  const d = partsOf(c, "oled")[0];
  return d ? c.snap?.parts[d.id]?.oled : undefined;
};
const barPixels = (c: Ctx) => {
  const o = oledOf(c);
  if (!o) return -1;
  let n = 0;
  for (let y = 44; y < 56; y++) for (let x = 2; x < 126; x++) if (pixel(o, x, y)) n++;
  return n;
};
const textPixels = (c: Ctx) => {
  const o = oledOf(c);
  if (!o) return 0;
  let n = 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 80; x++) if (pixel(o, x, y)) n++;
  return n;
};

const oledLesson: Lesson = {
  id: "oled",
  title: "Draw on an OLED screen",
  track: "arduino",
  level: "Intermediate",
  minutes: 18,
  summary: "Use the Adafruit libraries to put text and a knob-controlled bar on a 128×64 display.",
  start: { doc: doc([uno(-30, 2), part("oled", "oled", 8, 8)], oledWires()), code: TEMPLATE_OLED },
  steps: [
    {
      title: "Add a knob",
      body: [
        "The display is already wired to the I²C pins. To give the sketch something live to show, add a **potentiometer** and read it on **A0**.",
        "Connect one outer leg to **5V**, the other to **GND**, and the middle leg to **A0**.",
      ].join("\n\n"),
      goals: [
        shape("The potentiometer has 5V and GND on its outer legs", (c) => {
          const has = (a: PinSpec, b: PinSpec) => c.nets.resolve(a).some((x) => c.nets.resolve(b).some((y) => x.net === y.net && x.partId !== y.partId));
          const a: PinSpec = { type: "pot", pin: "a" }, b: PinSpec = { type: "pot", pin: "b" };
          return (has(a, UNO("5v")) && has(b, GND)) || (has(a, GND) && has(b, UNO("5v")));
        }),
        joined("The wiper reaches A0", { type: "pot", pin: "w" }, UNO("a0")),
      ],
      spotlight: ["pot"],
      hint: "Place the potentiometer anywhere on the bench, then wire its three legs: outer legs to 5V and GND, middle leg to A0.",
      after: "Same as the knob lesson: the wiper makes a voltage between 0 and 5 V that analogRead turns into 0 to 1023.",
      solution: (prev) => ({
        ...prev,
        doc: add(prev.doc, [part("pot1", "pot", 20, 20, { ohms: 10000, t: 0.4 })], [
          wire(pin("pot1", "a"), pin("uno", "5v"), RED), wire(pin("pot1", "b"), pin("uno", "gnd3"), BLACK), wire(pin("pot1", "w"), pin("uno", "a0"), BLUE),
        ]),
      }),
    },
    {
      title: "Start the display",
      body: [
        "Two libraries do the hard work. **Adafruit_GFX** knows how to draw text, lines and shapes. **Adafruit_SSD1306** knows how to send them to this particular chip. Include both, plus `Wire.h`.",
        "Create the display object with its size and the bus: `Adafruit_SSD1306 display(128, 64, &Wire, -1);`",
        "In `setup()`, start it with `display.begin(SSD1306_SWITCHCAPVCC, 0x3C);` and set the text colour with `display.setTextColor(SSD1306_WHITE);`.",
      ].join("\n\n"),
      goals: [
        codeHas("Adafruit_GFX and Adafruit_SSD1306 are included", /#include\s*<Adafruit_GFX\.h>[\s\S]*#include\s*<Adafruit_SSD1306\.h>|#include\s*<Adafruit_SSD1306\.h>[\s\S]*#include\s*<Adafruit_GFX\.h>/),
        codeHas("A 128 × 64 display object is created", /Adafruit_SSD1306\s+\w+\s*\(\s*128\s*,\s*64/),
        codeHas("begin() uses SSD1306_SWITCHCAPVCC and address 0x3C", /\.begin\s*\(\s*SSD1306_SWITCHCAPVCC\s*,\s*0x3[cC]\s*\)/),
      ],
      hint: "SWITCHCAPVCC tells the library to use the display's own voltage pump. With the other choice, a typical module stays dark. Show me gives a starting sketch.",
      after: "begin() sends the display its start-up commands over I²C. SWITCHCAPVCC turns on the charge pump that raises the voltage the pixels need: a typical module has no other way to light.",
      solution: (prev) => ({ ...prev, code: OLED_BEGIN }),
    },
    {
      title: "Draw and send",
      body: [
        "Drawing happens in the Uno's memory first. In `loop()`:",
        "- `display.clearDisplay();` wipes the picture.",
        "- `display.setTextSize(2); display.setCursor(0, 0); display.println(\"Hello,\");` draws text.",
        "- `display.drawRect(0, 42, 128, 16, SSD1306_WHITE);` draws a box, and `display.fillRect(...)` fills one.",
        "- **`display.display();`** sends the picture to the screen. Nothing appears until you call it.",
        "Read the knob with `analogRead(A0)` and use `map(knob, 0, 1023, 0, 124)` as the width of the filled bar.",
      ].join("\n"),
      goals: [
        codeHas("clearDisplay wipes the picture", /\.clearDisplay\s*\(\s*\)/),
        codeHas("Text is drawn with print or println", /\.print(ln)?\s*\(/),
        codeHas("The knob is read with analogRead", /analogRead\s*\(/),
        codeHas("display() sends the picture", /\.display\s*\(\s*\)/),
      ],
      hint: "The order matters: clear, draw things, then display(). Show me gives the finished sketch.",
      after: "The library keeps a 1,024-byte copy of the screen: 128 columns by 8 pages of 8 pixels. display() sends all of it over the bus, which takes about a tenth of a second.",
      solution: (prev) => ({ ...prev, code: SKETCHES.oledhello }),
    },
    {
      title: "See it work",
      body: "Upload and run. The text should appear at the top left, with a bar below it. Turn the potentiometer with its **Knob position** slider and watch the bar grow and shrink.",
      goals: [
        built,
        running,
        seen("The screen lit up", (c) => !!oledOf(c)?.lit),
        seen("Text appeared at the top left", (c) => textPixels(c) > 150),
        seen("The bar was nearly empty", (c) => barPixels(c) >= 0 && barPixels(c) < 40),
        seen("The bar was nearly full", (c) => barPixels(c) > 1000),
      ],
      hint: "Select the potentiometer and drag its slider all the way one way, then the other. The screen redraws about ten times a second.",
      after: "You drew a picture in memory, sent it over two wires, and a chip turned it into light. Every OLED and graphic LCD works this way.",
      solution: (prev) => prev,
      demo: (d) => {
        d.setProp("pot", "t", 1.0);
        d.run(1.2);
        d.setProp("pot", "t", 0.0);
        d.run(1.2);
      },
    },
  ],
  takeaways: [
    "Two libraries split the work: GFX draws, SSD1306 talks to the chip.",
    "You draw into memory, and display() sends the picture to the screen.",
    "begin(SSD1306_SWITCHCAPVCC, address) starts the display and its charge pump.",
    "begin() cannot tell if the display is really connected: use an I²C scanner to check.",
  ],
};

export const arduinoLessons: Lesson[] = [blink, buttonInput, knob, servo, lcdLesson, ultrasonic, scopeLesson, i2cLesson, oledLesson];
