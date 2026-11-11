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

Planned next: OLED and I²C, guided lessons, an AI tutor, and ESP32/IoT.

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
- Libraries available to sketches: Wire, SPI, EEPROM, SoftwareSerial, Servo and LiquidCrystal. Wire and SPI compile, but no I²C or SPI devices exist yet.
