# Simulator

An electronics bench in the browser. Build circuits on a breadboard with real internal wiring, power them from batteries, and watch a live circuit solver work out every voltage and current.

## What works today (Phase 1)

- **Breadboard** with true connectivity: power rails, five-hole strips, centre gap, one lead per hole.
- **Parts**: 9V battery, AA holders, coin cell, resistor, LED (five colours), diode, capacitor, push button, slide switch, potentiometer, light sensor, buzzer, DC motor, multimeter.
- **Physics**: nodal analysis with Newton-Raphson for diodes and time-stepped capacitors and motors. Batteries sag under load through their internal resistance.
- **Consequences**: LEDs burn out without a resistor, resistors overheat past ¼ W, shorts are flagged, and each warning explains the cause and the fix.
- **Learning aids**: hover a hole to see which holes it joins and its live voltage; every part has a short datasheet card; five starter circuits.

Planned next: Arduino Uno with real compiled sketches, more parts and instruments, guided lessons, an AI tutor, and ESP32/IoT.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000.

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
| `src/sim/engine.ts` | Time stepping, part damage, warnings |
| `src/sim/catalog.ts` | Part definitions, pins and learning text |
| `src/components/` | Canvas, part drawings, parts drawer, inspector |

## Deploy

The app is a static Next.js site and deploys to Vercel with no configuration or environment variables.
