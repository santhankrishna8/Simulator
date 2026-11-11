# Simulator

An electronics bench in the browser. Build circuits on a breadboard with real internal wiring, power them from batteries, and watch a live circuit solver work out every voltage and current.

## What works today

**Phase 1: the bench**

- **Breadboard** with true connectivity: power rails, five-hole strips, centre gap, one lead per hole.
- **Parts**: 9V battery, AA holders, coin cell, resistor, LED (five colours), diode, capacitor, push button, slide switch, potentiometer, light sensor, buzzer, DC motor, multimeter.
- **Physics**: nodal analysis with Newton-Raphson for diodes and time-stepped capacitors and motors. Batteries sag under load through their internal resistance.
- **Consequences**: LEDs burn out without a resistor, resistors overheat past ¼ W, shorts are flagged, and each warning explains the cause and the fix.

**Phase 2: Arduino**

- **Arduino Uno** with its ATmega328P emulated at 16 MHz (avr8js): timers and PWM, `millis()`/`delay()`, GPIO with pull-ups, the 10-bit ADC, serial, interrupts. It runs in a Web Worker so the page stays smooth.
- **Wired to the physics**: pins drive the circuit through a 25 Ω output stage, so an LED with no resistor really does overload a pin; inputs read the solved voltage with the datasheet's logic thresholds; `analogRead` follows the circuit's voltage and the 5V rail's droop. Power the board from USB or from VIN, and press its RESET button.
- **Real compiler**: the sketch is built with `avr-gcc` and the official Arduino core by the [compile service](compile-service/README.md), with line-accurate error messages in the editor.
- **Serial monitor** with input, six example sketches, and a code editor with syntax highlighting.

**Phase 3: more parts and instruments**

- **NPN transistor** (Ebers-Moll) and **relay**. The relay coil is a resistor in series with an inductor, so switching it off with no flyback diode destroys the transistor, and the warning says why.
- **RGB LED** and **7-segment display**, where each colour or segment is its own LED with its own brightness and burns out on its own.
- **Servo (SG90)**: measures the real pulse width the sketch sends, moves at a realistic speed, and draws more current while moving.
- **HC-SR04 ultrasonic sensor**: answers a trigger pulse with an echo timed to the microsecond, so `pulseIn()` returns the right distance. Slide the object's distance in the inspector.
- **16×2 LCD** with a full HD44780 controller (4-bit and 8-bit modes, custom characters, cursor, shifting), drawn with real 5×7 glyphs. Contrast depends on the V0 voltage, and the backlight on its own current.
- **Oscilloscope**: two channels, time and volt scales, a rising-edge trigger, and automatic frequency, duty cycle and peak-to-peak readings.
- **Serial plotter** tab that graphs the numbers your sketch prints, with `name:value` labels.

These devices need exact timing, which the circuit solver's 0.2 ms steps cannot give. So pin changes reach them with their exact CPU cycle, and what they drive back reaches the chip at an exact cycle.

**I²C and the OLED display**

- A real **I²C bus** on the Uno's A4 and A5 (SDA and SCL), with each byte delayed by its true time (about 90 µs at 100 kHz), so a full-screen redraw takes the real fraction of a second. Devices answer only if they are powered and wired to the right pins, so a missing wire fails the way it does on a bench.
- An **SSD1306 OLED** (128×64): the controller's three addressing modes, commands that arrive in separate transactions, orientation, contrast, invert, and the charge pump (a sketch that starts it with the wrong voltage option leaves the screen dark, as on a real module). It is drawn from the actual framebuffer, so whatever your sketch draws is what you see.
- The compile service builds the Adafruit GFX, SSD1306 and BusIO libraries, so real OLED sketches compile unchanged. An I²C scanner example, an OLED example, and two lessons use them.

**Phase 4: guided lessons**

- **Fourteen lessons** in two tracks. Circuits: light an LED, voltage and the multimeter, control it with a button, capacitors and time, switch a load with a transistor. Arduino: blink, read a button, read a knob, move a servo, write to an LCD, measure distance with sound, see a signal with the oscilloscope, find devices on the I²C bus, draw on an OLED. Each is a short series of steps (67 in all).
- **Goals are checked against what you actually built.** "The resistor sits between the + rail and the LED's anode" is verified from your wiring, "the LED blinked" from the live simulation, and "your sketch calls `digitalWrite`" from the editor. Steps tick off as you go and the lesson moves on when you choose.
- **Hints, "show me" and explanations.** Every step has a hint, a "Show me" that builds the answer (undoable, and it asks twice), and an explanation of what just happened using your circuit's real numbers.
- **Parts light up** in the drawer when a step asks for them. Progress is saved in the browser.
- Every step of every lesson is tested: its model solution must pass all its goals when played the way a learner would, and a step must not already be complete when you arrive. Wrong answers (an LED with no resistor, a button wired around the resistor) are tested to be rejected.

Lessons live in `src/lessons/`. To add one, write a `Lesson` in `src/lessons/content/`: the steps, their goals, and a model solution for each step. The tests then check it automatically.

**Phase 5: AI tutor**

- A **Tutor** button opens a chat panel. It is told, in plain text, what is on your bench: the parts and their values, what is wired to what (including pins left unconnected), the live readings and warnings, your sketch, build errors and serial output, and in a lesson, the step you are on and which goals are done. Nothing about you is sent.
- It is instructed to **teach rather than hand over answers**, to use only the facts it was given, and to keep answers short and in plain words.
- Your project's text (code, serial output) is treated as **data, never instructions**, so a comment saying "ignore your rules" does nothing.
- Answers stream in as they are written, with a Stop button. If no key is set, the panel says so instead of failing.
- The OpenAI key stays on the server (`/api/tutor`). It is never sent to the browser, never echoed in an error, and a per-visitor limit slows runaway use.

To turn it on, add `OPENAI_API_KEY` in Vercel's environment variables (and optionally `OPENAI_MODEL`, default `gpt-4o-mini`), then redeploy. Set a monthly spending limit on the key in the OpenAI dashboard: that is the real cost cap.

**Sharing and building for real**

- **Share** makes a link holding your bench and sketch (compressed into the URL, so nothing is stored on a server), or a project file. Anything opened from outside is validated and needs your confirmation first.
- **Build guide**: a printable shopping list with real part names and resistor colour bands, tick-box placement and wiring in breadboard coordinates, the sketch, and safety checks.

Planned next: more I²C devices (a temperature sensor, a real-time clock), and ESP32/IoT.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. The example Arduino sketches run straight away. To compile your own, start the compile service and point the app at it:

```bash
cp .env.example .env.local
```

Set `COMPILE_SERVICE_URL` there (see [compile-service/README.md](compile-service/README.md)).

## Checks

```bash
npm test
```

```bash
npm run lint
```

## Layout

| Path | What it holds |
|---|---|
| `src/sim/solver.ts` | Circuit solver (pure TypeScript, no UI) |
| `src/sim/model.ts` | Document model, breadboard connectivity, netlist builder |
| `src/sim/engine.ts` | Time stepping, part damage, warnings, the Uno's link to the circuit |
| `src/sim/mcu.ts` | The ATmega328P (avr8js) and Intel HEX loading |
| `src/sim/worker.ts` | Runs the engine off the main thread |
| `src/tutor/` | What the tutor is told about the bench, and its rules |
| `src/app/api/tutor/` | The tutor route: validates, calls OpenAI, streams the answer |
| `src/lessons/` | Lesson content, goal checks, and how steps are evaluated |
| `compile-service/` | Turns sketches into hex files (runs in Docker, not on Vercel) |
| `src/app/api/compile/` | Validates requests and forwards them to the compile service |
| `src/sim/catalog.ts` | Part definitions, pins and learning text |
| `src/components/` | Canvas, part drawings, parts drawer, inspector |

## Deploy

The app deploys to Vercel as-is. Add `COMPILE_SERVICE_URL` and `COMPILE_SERVICE_TOKEN` in the project's environment variables once the compile service is hosted (any Docker host: Render, Fly.io, Railway). Without them the app still works, but only the bundled example sketches can run.

## Known limits

- The circuit is solved every 0.2 ms of simulated time, so very fast bit-banged signals (faster than a few kHz) are not resolved.
- A pin held in a PWM pattern is averaged over a display frame, so LED brightness is right but you cannot see individual pulses yet. An oscilloscope is planned.
- Emulating the chip costs roughly 0.6 to 0.9 s of CPU per simulated second (measured in a cloud sandbox; a typical laptop should be faster). On a device that cannot keep up the simulation falls behind real time and the clock shows the percentage of real speed.
- The oscilloscope samples at 10 kHz, so it shows signals up to a few kilohertz. PWM edges are placed to the nearest 0.1 ms.
- A device's input is matched to the Uno pin that drives it through wires, breadboard strips and a series resistor of up to 1 kΩ. Through anything else (a transistor, a larger resistor) it is read as a voltage, which is too coarse for fast signals.
- A relay coil that loses its current path is treated as a destructive voltage spike: the exact voltage is not computed.
- Libraries available to sketches: Wire, SPI, EEPROM, SoftwareSerial, Servo, LiquidCrystal, and Adafruit GFX, SSD1306 and BusIO. I²C devices work (the OLED); SPI compiles but no SPI devices exist yet. Only one I²C device model exists so far, and the I²C lines are not visible on the oscilloscope.
