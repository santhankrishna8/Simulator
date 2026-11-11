import { BATTERIES, HOLE_BY_ID, formatSI } from "./catalog";
import { CPU_HZ, Mcu, UNO_PIN_IDS, parseHex, type PinMode } from "./mcu";
import { compile, type Compiled, type Doc, type PinRef, type Runtime, type UnoHandle } from "./model";
import { currentOf, makeState, solve } from "./solver";

export interface PartLive {
  /** Voltage across the part's main terminals. */
  v: number;
  /** Current through the part, in amps. */
  i: number;
  /** Power dissipated (or delivered, for batteries), in watts. */
  p: number;
  burned?: boolean;
  /** 0..1 light output for LEDs. */
  glow?: number;
  /** Motor shaft angle in radians and speed in rpm. */
  angle?: number;
  rpm?: number;
  /** Buzzer sounding. */
  sounding?: boolean;
  /** Battery charge used so far, mAh. */
  usedMah?: number;
  /** Multimeter reading text. */
  reading?: string;
  /** Arduino Uno state. */
  uno?: UnoLive;
}

export interface UnoLive {
  powered: boolean;
  /** Held in reset by the RESET pin. */
  inReset: boolean;
  hasProgram: boolean;
  running: boolean;
  /** The L LED on pin 13, and the serial activity LEDs. */
  l: boolean;
  tx: boolean;
  rx: boolean;
  baud: number;
  pins: Record<string, { mode: PinMode | "off"; v: number; i: number }>;
}

export interface Warning {
  id: string;
  level: "danger" | "warn" | "info";
  part?: string;
  title: string;
  why: string;
  fix: string;
}

export interface Snapshot {
  time: number;
  parts: Record<string, PartLive>;
  /** Signed current per wire id, positive from end a to end b. */
  wires: Record<string, number>;
  warnings: Warning[];
  /** Node voltage by "part.pin" (or "board#strip" for breadboard strips). */
  volts: Record<string, number>;
}

/** Voltage at any pin or breadboard hole, or undefined if it is not part of the circuit. */
export function voltageAt(snap: Snapshot, doc: Doc, ref: PinRef): number | undefined {
  const part = doc.parts.find((p) => p.id === ref.part);
  if (!part) return undefined;
  if (part.type === "breadboard") {
    const hole = HOLE_BY_ID.get(ref.pin);
    return hole ? snap.volts[`${part.id}#${hole.strip}`] : undefined;
  }
  return snap.volts[`${ref.part}.${ref.pin}`];
}

const OFF = 1e9; // ohms: an unpowered or high-impedance pin
const PIN_OHMS = 25; // output driver resistance of an ATmega328P pin
const PULLUP_OHMS = 35_000;

const DT = 0.0002;
const MAX_STEPS = 120;

// Hobby "130" motor constants.
const MOTOR_K = 0.00286; // V·s/rad and N·m/A
const MOTOR_J = 1e-6; // kg·m², rotor plus a small propeller
const MOTOR_B = 3.4e-7; // viscous friction

export class Engine {
  time = 0;
  private burned = new Set<string>();
  private stress = new Map<string, number>();
  private heat = new Map<string, number>();
  private omega = new Map<string, number>();
  private angle = new Map<string, number>();
  private usedMah = new Map<string, number>();
  private capV = new Map<string, number>();
  private diodeV = new Map<string, number>();

  /* ----- the Uno's chip ----- */
  private program: Uint16Array | null = null;
  private mcu: Mcu | null = null;
  private unoPowered = false;
  private unoInReset = false;
  private cycleDebt = 0;
  private lastModes: (PinMode | "off")[] = [];
  private lastLevel: (boolean | undefined)[] = [];
  private serialBytes: number[] = [];
  private decoder = new TextDecoder();
  private lastTx = -1;
  private lastRx = -1;
  private seenTx = 0;
  private seenRx = 0;
  private baud = 0;
  /** Last-seen voltages that decide whether the board is powered or in reset. */
  private uV = { v5: 0, vin: 0, reset: 5 };

  /** Load a compiled sketch (Intel HEX). The chip restarts at the next step; null clears it. */
  loadProgram(hex: string | null) {
    this.program = hex ? parseHex(hex) : null;
    this.mcu = null;
    this.cycleDebt = 0;
    this.serialBytes = [];
  }

  /** Text the sketch has printed to Serial since the last call. */
  takeSerial(): string {
    if (!this.serialBytes.length) return "";
    const text = this.decoder.decode(Uint8Array.from(this.serialBytes), { stream: true });
    this.serialBytes = [];
    return text;
  }

  /** Send text to the sketch's Serial.read(). */
  serialIn(text: string) {
    this.mcu?.receive(text);
  }

  private driveUno(h: UnoHandle) {
    const v = this.uV;
    const ext = h.part.props.power === "ext";
    const vin = v.vin;
    const regulator = ext && vin > 6.3;
    const powered = !ext || regulator || v.v5 > 4.3;
    const set = (e: UnoHandle["v5"], volts: number, ohms: number) => {
      e.v = volts;
      e.r = ohms;
    };
    if (!ext) set(h.v5, 5, 0.5);
    else if (regulator) set(h.v5, 5, 1);
    else set(h.v5, 0, OFF);
    if (powered) {
      set(h.v33, 3.3, 3);
      set(h.reset, 5, 10_000);
    } else {
      set(h.v33, 0, OFF);
      set(h.reset, 0, OFF);
    }
    this.unoPowered = powered;
    // The reset pin pulls to 5 V through 10 k; a button to ground holds the chip in reset.
    this.unoInReset = powered && v.v5 > 3 && v.reset < 1;

    if (!powered || this.unoInReset) this.mcu = null;
    else if (!this.mcu && this.program) {
      this.mcu = new Mcu(this.program);
      this.cycleDebt = 0;
      this.lastLevel = [];
      this.seenTx = this.seenRx = 0;
    }

    const vcc = Math.min(5.5, Math.max(0, v.v5));
    UNO_PIN_IDS.forEach((id, i) => {
      const e = h.drivers.get(id)!;
      const mode: PinMode | "off" = this.mcu ? this.mcu.pinMode(i) : "off";
      if (mode !== this.lastModes[i]) this.lastLevel[i] = undefined;
      this.lastModes[i] = mode;
      if (mode === "high") set(e, vcc, PIN_OHMS);
      else if (mode === "low") set(e, 0, PIN_OHMS);
      else if (mode === "pullup") set(e, vcc, PULLUP_OHMS);
      else set(e, 0, OFF);
    });
  }

  /** After a solve: tell the chip what its input pins see, then let it run for `dt`. */
  private senseUno(h: UnoHandle, v: Float64Array, dt: number, nodes: Map<string, number>) {
    const mcu = this.mcu;
    if (!mcu) return;
    const vcc = Math.max(0.1, v[h.n5v]);
    UNO_PIN_IDS.forEach((id, i) => {
      const node = nodes.get(`${h.part.id}.${id}`)!;
      const volts = v[node];
      if (i >= 14) mcu.adc.channelValues[i - 14] = Math.min(5, Math.max(0, volts));
      const mode = this.lastModes[i];
      if (mode !== "input" && mode !== "pullup") return;
      // Schmitt-trigger thresholds from the datasheet: high above 0.6 Vcc, low below 0.3 Vcc.
      const prev = this.lastLevel[i];
      const level = volts > 0.6 * vcc ? true : volts < 0.3 * vcc ? false : (prev ?? false);
      if (level !== prev) {
        mcu.setInput(i, level);
        this.lastLevel[i] = level;
      }
    });
    mcu.adc.avcc = vcc;
    this.cycleDebt += dt * CPU_HZ;
    const cycles = Math.floor(this.cycleDebt);
    this.cycleDebt -= cycles;
    mcu.pumpSerial();
    mcu.run(cycles);
    const out = mcu.takeOutput();
    if (out.length) for (const b of out) this.serialBytes.push(b);
    if (mcu.txActivity !== this.seenTx) { this.seenTx = mcu.txActivity; this.lastTx = this.time; }
    if (mcu.rxActivity !== this.seenRx) { this.seenRx = mcu.rxActivity; this.lastRx = this.time; }
    this.baud = mcu.baud;
  }

  reset() {
    this.mcu = null;
    this.cycleDebt = 0;
    this.serialBytes = [];
    this.lastTx = this.lastRx = -1;
    this.lastModes = [];
    this.lastLevel = [];
    this.time = 0;
    this.burned.clear();
    this.stress.clear();
    this.heat.clear();
    this.omega.clear();
    this.angle.clear();
    this.usedMah.clear();
    this.capV.clear();
    this.diodeV.clear();
  }

  /** Swap a burnt part for a fresh one. */
  replace(partId: string) {
    this.burned.delete(partId);
    this.stress.delete(partId);
    this.heat.delete(partId);
  }

  /** Advance the simulation by `seconds` of circuit time. */
  advance(doc: Doc, pressed: Set<string>, seconds: number): Snapshot {
    const emf = new Map<string, number>();
    this.omega.forEach((w, id) => emf.set(id, MOTOR_K * w));
    const rt: Runtime = { pressed, burned: this.burned, emf };
    let c: Compiled = compile(doc, rt);
    let state = makeState(c.elems);
    const load = () => {
      c.elems.forEach((e, idx) => {
        if (e.k === "C") state.vc[idx] = this.capV.get(e.part) ?? 0;
        if (e.k === "D") state.vd[idx] = this.diodeV.get(e.part) ?? 0;
      });
    };
    load();

    const steps = Math.max(1, Math.min(MAX_STEPS, Math.round(seconds / DT)));
    const dt = seconds > 0 ? seconds / steps : DT;
    let v: Float64Array = new Float64Array(c.nodeCount);
    const iSum = new Map<string, number>();
    const pinSum: Record<string, number> = {};
    const wireI: Record<string, number> = {};

    for (let s = 0; s < steps; s++) {
      if (c.uno) this.driveUno(c.uno);
      const vcPrev = Float64Array.from(state.vc);
      v = solve(c.nodeCount, c.elems, state, dt);
      this.time += dt;
      if (c.uno) this.uV = { v5: v[c.uno.n5v], vin: v[c.uno.nVin], reset: v[c.uno.nReset] };
      let burnedNow = false;

      c.elems.forEach((e, idx) => {
        const i = currentOf(e, idx, v, state, dt, vcPrev[idx]);
        if (e.k === "W") {
          wireI[e.wire] = i;
          return;
        }
        if (e.k === "V" && e.pin) {
          // A Uno pin or supply: current flowing out of the board.
          pinSum[e.pin] = (pinSum[e.pin] ?? 0) - i;
          return;
        }
        if (e.k === "R" && e.tag) {
          if (e.tag !== "upper") return;
        }
        const id = e.part!;
        iSum.set(id, (iSum.get(id) ?? 0) + i);
        const part = doc.parts.find((p) => p.id === id)!;

        if (e.k === "C") this.capV.set(id, state.vc[idx]);
        if (e.k === "D") this.diodeV.set(id, state.vd[idx]);

        if (part.type === "led") {
          // Overcurrent stress: instant failure past 120 mA, slower above 30 mA.
          let st = this.stress.get(id) ?? 0;
          if (i > 0.03) st += (i - 0.03) * dt;
          else st = Math.max(0, st - 0.01 * dt);
          this.stress.set(id, st);
          if (i > 0.12 || st > 0.06) {
            this.burned.add(id);
            burnedNow = true;
          }
        } else if (part.type === "resistor") {
          const p = e.k === "R" ? i * i * e.r : 0;
          let h = this.heat.get(id) ?? 0;
          if (p > 0.25) h += (p - 0.25) * dt;
          else h = Math.max(0, h - 0.2 * dt);
          this.heat.set(id, h);
          if (h > 1.5) {
            this.burned.add(id);
            burnedNow = true;
          }
        } else if (part.type === "motor" && e.k === "V") {
          let w = this.omega.get(id) ?? 0;
          const torque = MOTOR_K * i - MOTOR_B * w;
          w += (torque / MOTOR_J) * dt;
          this.omega.set(id, w);
          this.angle.set(id, ((this.angle.get(id) ?? 0) + w * dt) % (Math.PI * 2));
          e.v = MOTOR_K * w;
        } else if (part.type in BATTERIES) {
          const out = -i;
          this.usedMah.set(id, (this.usedMah.get(id) ?? 0) + (Math.max(0, out) * dt * 1000) / 3600);
        }
      });

      if (c.uno) this.senseUno(c.uno, v, dt, c.nodeOf);

      if (burnedNow) {
        // A part just failed open; rebuild the netlist without it.
        c = compile(doc, rt);
        state = makeState(c.elems);
        load();
      }
    }
    // Currents are averaged over the frame, so a PWM-dimmed LED shows its mean current.
    const partI = new Map<string, number>();
    iSum.forEach((sum, id) => partI.set(id, sum / steps));

    const parts: Record<string, PartLive> = {};
    const warnings: Warning[] = [];
    const nv = (partId: string, pin: string) => {
      const n = c.nodeOf.get(`${partId}.${pin}`);
      return n === undefined ? 0 : (v[n] ?? 0);
    };

    for (const part of doc.parts) {
      const id = part.id;
      const i = partI.get(id) ?? 0;
      const burned = this.burned.has(id);
      switch (part.type) {
        case "breadboard":
          break;
        case "uno": {
          const h = c.uno;
          if (!h || h.part.id !== id) break;
          const pins: UnoLive["pins"] = {};
          let worst = 0;
          UNO_PIN_IDS.forEach((pid, k) => {
            const cur = pinSum[pid] !== undefined ? pinSum[pid] / steps : 0;
            const node = c.nodeOf.get(`${id}.${pid}`)!;
            pins[pid] = { mode: this.lastModes[k] ?? "off", v: v[node] ?? 0, i: cur };
            if (Math.abs(cur) > Math.abs(worst)) worst = cur;
            const amps = Math.abs(cur);
            if (amps > 0.04) {
              warnings.push({
                id: `pin-${pid}`, level: "danger", part: id,
                title: `Pin ${pid.toUpperCase()} is overloaded`,
                why: `It is ${cur > 0 ? "supplying" : "sinking"} ${formatSI(amps, "A")}. An Uno pin is rated for 40 mA at the very most and 20 mA for everyday use. This is usually a pin wired straight to the opposite level, or an LED with no resistor.`,
                fix: "Put a resistor in series, such as 220 Ω for an LED, or switch bigger loads with a transistor.",
              });
            } else if (amps > 0.02) {
              warnings.push({
                id: `pinwarn-${pid}`, level: "warn", part: id,
                title: `Pin ${pid.toUpperCase()} is above 20 mA`,
                why: `It is carrying ${formatSI(amps, "A")}. That is within the 40 mA absolute maximum but above the 20 mA recommended for long life.`,
                fix: "Use a larger series resistor.",
              });
            }
          });
          const supply = (pinSum["5v"] ?? 0) / steps;
          if (supply > 0.5) {
            warnings.push({
              id: "usb-limit", level: "danger", part: id,
              title: "5V pin is overloaded",
              why: `${formatSI(supply, "A")} is being drawn from the 5V pin. USB provides 500 mA, and the board's resettable fuse would trip and cut the power.`,
              fix: "Check for a short between 5V and GND, or power motors from their own battery.",
            });
          }
          const tx = this.lastTx >= 0 && this.time - this.lastTx < 0.06;
          const rx = this.lastRx >= 0 && this.time - this.lastRx < 0.06;
          parts[id] = {
            v: v[h.n5v] ?? 0,
            i: supply,
            p: (v[h.n5v] ?? 0) * supply,
            uno: {
              powered: this.unoPowered,
              inReset: this.unoInReset,
              hasProgram: !!this.program,
              running: !!this.mcu,
              l: this.lastModes[13] === "high",
              tx,
              rx,
              baud: this.baud,
              pins,
            },
          };
          if (!this.unoPowered) {
            warnings.push({
              id: "unpowered", level: "info", part: id,
              title: "The Uno has no power",
              why: "The board is set to take power from VIN or the 5V pin, and nothing is supplying it.",
              fix: "Feed 7 to 12 V into VIN, or exactly 5 V into the 5V pin, and connect GND. Or choose USB power in the inspector.",
            });
          } else if (!this.program) {
            warnings.push({
              id: "noprog", level: "info", part: id,
              title: "No sketch uploaded yet",
              why: "The Uno is powered but its chip has nothing to run.",
              fix: "Open the Code panel and press Upload.",
            });
          }
          break;
        }
        case "battery9v":
        case "batteryAA2":
        case "batteryAA4":
        case "coincell": {
          const spec = BATTERIES[part.type];
          const vt = nv(id, "pos") - nv(id, "neg");
          const out = -i;
          parts[id] = { v: vt, i: out, p: vt * out, usedMah: this.usedMah.get(id) ?? 0 };
          if (out > spec.shortAmps) {
            warnings.push({
              id: `short-${id}`,
              level: "danger",
              part: id,
              title: "Short circuit",
              why: `The battery is pushing ${formatSI(out, "A")} with almost nothing to limit it. Its voltage has collapsed to ${formatSI(vt, "V")}. A real battery would get hot and drain in minutes.`,
              fix: "Find the path that joins + straight to − and put a load, such as a resistor and LED, in it.",
            });
          }
          break;
        }
        case "resistor": {
          const vd = nv(id, "a") - nv(id, "b");
          const p = burned ? 0 : Math.abs(vd * i);
          parts[id] = { v: vd, i: burned ? 0 : i, p, burned };
          if (burned) {
            warnings.push({
              id: `rburn-${id}`,
              level: "danger",
              part: id,
              title: "Resistor burnt out",
              why: "It carried far more than its ¼ W rating until it failed. It no longer conducts.",
              fix: "Replace it and use a higher resistance, or lower the supply voltage.",
            });
          } else if (p > 0.25) {
            warnings.push({
              id: `rhot-${id}`,
              level: "warn",
              part: id,
              title: "Resistor overheating",
              why: `It is dissipating ${formatSI(p, "W")}, above its ¼ W rating. Power is voltage × current: ${formatSI(Math.abs(vd), "V")} × ${formatSI(Math.abs(i), "A")}.`,
              fix: "Use a higher resistance so less current flows.",
            });
          }
          break;
        }
        case "led": {
          const vd = nv(id, "anode") - nv(id, "cathode");
          const cur = burned ? 0 : Math.max(0, i);
          parts[id] = { v: vd, i: cur, p: vd * cur, burned, glow: Math.min(1, Math.pow(cur / 0.02, 0.6)) };
          if (burned) {
            warnings.push({
              id: `lburn-${id}`,
              level: "danger",
              part: id,
              title: "LED burnt out",
              why: "Too much current flowed through it. An LED has almost no resistance of its own once it turns on, so something else must limit the current.",
              fix: "Replace the LED and add a resistor in series. 220 Ω to 1 kΩ suits most batteries.",
            });
          } else if (cur > 0.03) {
            warnings.push({
              id: `lhot-${id}`,
              level: "warn",
              part: id,
              title: "LED over its limit",
              why: `${formatSI(cur, "A")} is flowing. A standard LED is rated for about 20 mA and will fail soon at this level.`,
              fix: "Increase the series resistor.",
            });
          } else if (vd < -1) {
            warnings.push({
              id: `lrev-${id}`,
              level: "info",
              part: id,
              title: "LED is in backwards",
              why: "The voltage is pushing from the short leg to the long leg. An LED only conducts from anode (long leg) to cathode.",
              fix: "Turn the LED around.",
            });
          }
          break;
        }
        case "diode": {
          const vd = nv(id, "anode") - nv(id, "cathode");
          parts[id] = { v: vd, i: Math.max(0, i), p: vd * Math.max(0, i) };
          break;
        }
        case "capacitor": {
          const vc = nv(id, "pos") - nv(id, "neg");
          parts[id] = { v: vc, i, p: vc * i };
          if (vc < -1) {
            warnings.push({
              id: `crev-${id}`,
              level: "warn",
              part: id,
              title: "Capacitor is reversed",
              why: "An electrolytic capacitor must have its + leg at the higher voltage. Reversed, a real one heats up and can burst.",
              fix: "Turn the capacitor around so the stripe faces the negative side.",
            });
          } else if (vc > 16) {
            warnings.push({
              id: `cover-${id}`,
              level: "warn",
              part: id,
              title: "Capacitor over its voltage rating",
              why: `It has ${formatSI(vc, "V")} across it and is rated for 16 V.`,
              fix: "Lower the supply voltage.",
            });
          }
          break;
        }
        case "button":
        case "switch":
          parts[id] = { v: 0, i, p: 0 };
          break;
        case "pot": {
          const va = nv(id, "a") - nv(id, "b");
          parts[id] = { v: nv(id, "w") - nv(id, "b"), i, p: Math.abs(va * i) };
          if (Math.abs(va * i) > 0.2) {
            warnings.push({
              id: `pothot-${id}`,
              level: "warn",
              part: id,
              title: "Potentiometer overloaded",
              why: "Its track is thin and rated for about 0.1 W. With the knob near one end, nearly all the current passes through a tiny piece of track.",
              fix: "Add a fixed resistor in series, or use the potentiometer only to set a voltage.",
            });
          }
          break;
        }
        case "ldr": {
          const vd = nv(id, "a") - nv(id, "b");
          parts[id] = { v: vd, i, p: Math.abs(vd * i) };
          break;
        }
        case "buzzer": {
          const vd = nv(id, "pos") - nv(id, "neg");
          parts[id] = { v: vd, i, p: Math.abs(vd * i), sounding: vd > 1.5 };
          if (vd < -1.5) {
            warnings.push({
              id: `bzrev-${id}`,
              level: "info",
              part: id,
              title: "Buzzer is in backwards",
              why: "An active buzzer only works with its + pin toward positive.",
              fix: "Turn the buzzer around.",
            });
          }
          break;
        }
        case "motor": {
          const vd = nv(id, "pos") - nv(id, "neg");
          const w = this.omega.get(id) ?? 0;
          parts[id] = { v: vd, i, p: vd * i, angle: this.angle.get(id) ?? 0, rpm: (w * 60) / (2 * Math.PI) };
          break;
        }
        case "meter": {
          const vd = nv(id, "v") - nv(id, "com");
          const amps = part.props.mode === "A";
          const value = amps ? i : vd;
          parts[id] = { v: vd, i, p: 0, reading: formatSI(Math.abs(value) < (amps ? 1e-6 : 1e-4) ? 0 : value, amps ? "A" : "V", 4) };
          break;
        }
      }
    }

    const batteries = doc.parts.filter((p) => p.type in BATTERIES);
    if (batteries.length && !warnings.length && doc.parts.length > 1) {
      const idle = batteries.every((b) => Math.abs(parts[b.id]?.i ?? 0) < 1e-6);
      if (idle) {
        warnings.push({
          id: "open",
          level: "info",
          title: "No current is flowing",
          why: "Current needs a complete loop: out of the battery's + terminal, through your parts, and back to −.",
          fix: "Trace the path with your finger. Look for a gap, an open switch, or a part in backwards.",
        });
      }
    }

    const volts: Record<string, number> = {};
    c.nodeOf.forEach((n, key) => (volts[key] = v[n] ?? 0));
    return {
      time: this.time,
      parts,
      wires: wireI,
      warnings,
      volts,
    };
  }
}
