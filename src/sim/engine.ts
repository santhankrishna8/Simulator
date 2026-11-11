import { BATTERIES, HOLE_BY_ID, formatSI } from "./catalog";
import { Device, HcSr04, Lcd1602, Oled, Servo, type DeviceCtx, type DeviceLive } from "./devices";
import type { I2cSlave } from "./i2c";
import { CPU_HZ, Mcu, UNO_PIN_IDS, parseHex, type PinMode } from "./mcu";
import { compile, type Compiled, type Doc, type PinRef, type Runtime, type UnoHandle } from "./model";
import { DEVICE_SUPPLY, I2C_SCL, I2C_SDA } from "./pins";
import { ScopeBuf, scopeView, type ScopeStats } from "./scope";
import { bjtCurrents, currentOf, makeState, solve } from "./solver";

export interface PartLive extends DeviceLive {
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
  /** Brightness 0..1 of each LED in a multi-LED part (RGB LED: r g b; 7-segment: a to g, dp). */
  channels?: Record<string, number>;
  /** Relay contacts changed over. */
  on?: boolean;
  /** Extra labelled readings for the inspector. */
  extra?: Record<string, string>;
  /** Oscilloscope screen contents. */
  scope?: ScopeLive;
}

export interface ScopeLive {
  t: number[];
  ch1: number[];
  ch2: number[];
  triggered: boolean;
  stats1: ScopeStats;
  stats2: ScopeStats;
  tdiv: number;
  v1div: number;
  v2div: number;
  trig: number;
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
/** With an oscilloscope on the bench the circuit is solved twice as often (10 kHz sampling). */
const DT_SCOPE = 0.0001;
const MAX_STEPS = 120;
const MAX_STEPS_SCOPE = 240;

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
  private coilI = new Map<string, number>();
  private bjtV = new Map<string, [number, number]>();
  private relays = new Set<string>();
  private scopes = new Map<string, ScopeBuf>();
  /** Per-part LED-style channel currents from the latest step (the LCD's backlight). */
  private chanNow = new Map<string, Record<string, number>>();
  private burnWhy = new Map<string, "spike" | "current" | "heat" | "reverse">();

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
  /* ----- exact-timing devices (servo, ultrasonic sensor, LCD) ----- */
  private devices = new Map<string, Device>();
  private devKinds = new Map<string, string>();
  private bindings = new Map<string, number>();
  private byUnoPin = new Map<number, { device: Device; pin: string }[]>();
  /** Uno pins whose input level comes straight from a device's output, not the circuit solver. */
  private directPins = new Set<number>();
  /** I²C devices on the bus, by address; shared with the chip's bus. */
  private i2cSlaves = new Map<number, I2cSlave>();
  private devLevel = new Map<string, boolean>();
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
    else if (!this.mcu && this.program && v.v5 > 3) {
      // The chip starts once the 5 V rail is up, by which time everything on it has power too.
      this.mcu = new Mcu(this.program);
      this.mcu.i2c.slaves = this.i2cSlaves;
      this.mcu.onPin = (pin, level) => this.byUnoPin.get(pin)?.forEach((t) => t.device.input(t.pin, level));
      this.devices.forEach((d) => d.onChipReset());
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
      if (this.directPins.has(i)) return; // a device sets this input at an exact cycle
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
    this.coilI.clear();
    this.bjtV.clear();
    this.relays.clear();
    this.burnWhy.clear();
    this.devices.clear();
    this.devKinds.clear();
    this.devLevel.clear();
    this.chanNow.clear();
    this.scopes.clear();
  }


  /** Create, update and remove device models to match the document. Run once per frame. */
  private syncDevices(doc: Doc, c: Compiled) {
    const live = new Set<string>();
    for (const part of doc.parts) {
      if (!(part.type in DEVICE_SUPPLY)) continue;
      live.add(part.id);
      if (this.devKinds.get(part.id) !== part.type) {
        const id = part.id;
        const ctx: DeviceCtx = {
          cycles: () => this.mcu?.cycles ?? 0,
          schedule: (cycles, fn) => this.mcu?.schedule(cycles, fn),
          drive: (pin, level) => {
            const dev = this.devices.get(id);
            if (dev) dev.outputs[pin] = level;
            const up = this.bindings.get(`${id}.${pin}`);
            const mode = up === undefined ? undefined : this.lastModes[up];
            if (up !== undefined && this.mcu && (mode === "input" || mode === "pullup")) {
              this.mcu.setInput(up, level);
              this.lastLevel[up] = level;
            }
          },
        };
        this.devices.set(id, part.type === "servo" ? new Servo(ctx) : part.type === "hcsr04" ? new HcSr04(ctx) : part.type === "oled" ? new Oled(ctx) : new Lcd1602(ctx));
        this.devKinds.set(id, part.type);
      }
      this.devices.get(part.id)!.props = part.props;
    }
    for (const id of [...this.devices.keys()]) {
      if (live.has(id)) continue;
      this.devices.delete(id);
      this.devKinds.delete(id);
    }
    this.bindings = c.bindings;
    this.byUnoPin.clear();
    this.directPins.clear();
    c.bindings.forEach((unoPin, key) => {
      const [id, pin] = key.split(".");
      const device = this.devices.get(id);
      if (!device) return;
      if (device.inputs.includes(pin as never)) {
        const list = this.byUnoPin.get(unoPin) ?? [];
        list.push({ device, pin });
        this.byUnoPin.set(unoPin, list);
      } else this.directPins.add(unoPin); // an output pin such as ECHO
    });

    for (const [id, dev] of this.devices) {
      if (dev instanceof Oled) dev.onBus = c.bindings.get(`${id}.sda`) === I2C_SDA && c.bindings.get(`${id}.scl`) === I2C_SCL;
    }
    this.refreshI2c();
  }

  /** I²C devices answer only if SDA and SCL reach the Uno's A4 and A5 and they have power. Checked every step. */
  private refreshI2c() {
    this.i2cSlaves.clear();
    for (const dev of this.devices.values()) if (dev instanceof Oled && dev.onBus && dev.powered) this.i2cSlaves.set(dev.address, dev.slave);
  }

  /** Before a solve: set each device's load and output drivers. */
  private driveDevices(c: Compiled) {
    c.devices.forEach((h, id) => {
      const dev = this.devices.get(id);
      if (!dev) return;
      if (h.load) h.load.r = dev.load();
      h.drivers.forEach((e, pin) => {
        e.v = dev.outputs[pin] ? 5 : 0;
        e.r = dev.powered ? 50 : OFF;
      });
    });
  }

  /** After a solve: read each device's supply and unwired inputs, and let it move. */
  private senseDevices(c: Compiled, v: Float64Array, dt: number) {
    c.devices.forEach((h, id) => {
      const dev = this.devices.get(id);
      if (!dev) return;
      const vcc = v[h.vcc] - v[h.gnd];
      const pinV = (pin: string) => {
        const n = c.nodeOf.get(`${id}.${pin}`);
        return n === undefined ? 0 : v[n] - v[h.gnd];
      };
      // Inputs that are not wired straight to a Uno pin are read as voltages.
      for (const pin of dev.inputs) {
        if (this.bindings.has(`${id}.${pin}`)) continue;
        const key = `${id}.${pin}`;
        const volts = pinV(pin);
        const prev = this.devLevel.get(key);
        const level = volts > 3.0 ? true : volts < 1.5 ? false : (prev ?? false);
        if (level === prev) continue;
        this.devLevel.set(key, level);
        if (prev !== undefined || level) dev.input(pin, level);
      }
      let backlightAmps = 0;
      const dm = this.chanNow.get(id)?.bl;
      if (dm !== undefined) backlightAmps = dm;
      dev.step({ v: pinV, dt, vcc, backlightAmps });
    });
  }

  /** Swap a burnt part (or all burnt channels of a part) for a fresh one. */
  replace(partId: string) {
    const mine = (k: string) => k === partId || k.startsWith(`${partId}:`);
    for (const k of [...this.burned]) if (mine(k)) this.burned.delete(k);
    for (const k of [...this.stress.keys()]) if (mine(k)) this.stress.delete(k);
    this.heat.delete(partId);
    this.burnWhy.delete(partId);
  }

  /** Overcurrent wear for an LED: instant failure past 120 mA, gradual above 30 mA. */
  private overstress(key: string, i: number, dt: number): boolean {
    let st = this.stress.get(key) ?? 0;
    if (i > 0.03) st += (i - 0.03) * dt;
    else st = Math.max(0, st - 0.01 * dt);
    this.stress.set(key, st);
    return i > 0.12 || st > 0.06;
  }

  /** Advance the simulation by `seconds` of circuit time. */
  advance(doc: Doc, pressed: Set<string>, seconds: number): Snapshot {
    const emf = new Map<string, number>();
    this.omega.forEach((w, id) => emf.set(id, MOTOR_K * w));
    const rt: Runtime = { pressed, burned: this.burned, emf, relays: this.relays };
    let c: Compiled = compile(doc, rt);
    this.syncDevices(doc, c);
    let state = makeState(c.elems);
    const load = () => {
      c.elems.forEach((e, idx) => {
        if (e.k === "C") state.vc[idx] = this.capV.get(e.part) ?? 0;
        else if (e.k === "D") state.vd[idx] = this.diodeV.get(`${e.part}:${e.tag ?? ""}`) ?? 0;
        else if (e.k === "L") state.il[idx] = this.coilI.get(e.part) ?? 0;
        else if (e.k === "Q") {
          const [be, bc] = this.bjtV.get(e.part) ?? [0, 0];
          state.vd[idx] = be;
          state.vd2[idx] = bc;
        }
      });
    };
    load();

    const scopeParts = doc.parts.filter((p) => p.type === "scope");
    const baseDt = scopeParts.length ? DT_SCOPE : DT;
    const steps = Math.max(1, Math.min(scopeParts.length ? MAX_STEPS_SCOPE : MAX_STEPS, Math.round(seconds / baseDt)));
    const dt = seconds > 0 ? seconds / steps : baseDt;
    for (const id of [...this.scopes.keys()]) if (!scopeParts.some((p) => p.id === id)) this.scopes.delete(id);
    for (const p of scopeParts) if (!this.scopes.has(p.id)) this.scopes.set(p.id, new ScopeBuf());
    let v: Float64Array = new Float64Array(c.nodeCount);
    const iSum = new Map<string, number>();
    const ibSum = new Map<string, number>();
    const chanSum = new Map<string, Record<string, number>>();
    const pinSum: Record<string, number> = {};
    const wireI: Record<string, number> = {};

    for (let s = 0; s < steps; s++) {
      if (c.uno) this.driveUno(c.uno);
      this.driveDevices(c);
      const vcPrev = Float64Array.from(state.vc);
      v = solve(c.nodeCount, c.elems, state, dt);
      this.time += dt;
      if (c.uno) this.uV = { v5: v[c.uno.n5v], vin: v[c.uno.nVin], reset: v[c.uno.nReset] };
      let burnedNow = false;
      const kicks: number[] = [];

      c.elems.forEach((e, idx) => {
        const i = currentOf(e, idx, v, state, dt, vcPrev[idx]);
        if (e.k === "W") {
          wireI[e.wire] = i;
          return;
        }
        if (e.k === "V" && e.dev) return;
        if (e.k === "V" && e.pin) {
          // A Uno pin or supply: current flowing out of the board.
          pinSum[e.pin] = (pinSum[e.pin] ?? 0) - i;
          return;
        }
        if (e.k === "Q") {
          const id = e.part;
          const { ic, ib } = bjtCurrents(e, state.vd[idx], state.vd2[idx]);
          iSum.set(id, (iSum.get(id) ?? 0) + ic);
          ibSum.set(id, (ibSum.get(id) ?? 0) + ib);
          this.bjtV.set(id, [state.vd[idx], state.vd2[idx]]);
          const vce = v[e.c] - v[e.e];
          const watts = vce * ic + (v[e.b] - v[e.e]) * ib;
          let h = this.heat.get(id) ?? 0;
          if (watts > 0.6) h += (watts - 0.6) * dt;
          else h = Math.max(0, h - 0.2 * dt);
          this.heat.set(id, h);
          const why = vce > 60 ? "spike" : ic > 1.5 ? "current" : h > 0.5 ? "heat" : v[e.b] - v[e.e] < -6 ? "reverse" : null;
          if (why) {
            this.burned.add(id);
            this.burnWhy.set(id, why);
            burnedNow = true;
          }
          return;
        }
        if (e.k === "L") {
          // An inductor whose current collapses in one step has lost its path. In a real circuit
          // the voltage would climb into the kilovolts until something broke down; the solver's
          // time step hides the size of that spike, so detect the event itself.
          const before = this.coilI.get(e.part) ?? 0;
          const now = state.il[idx];
          if (Math.abs(before) >= 0.005 && Math.abs(now) <= 0.2 * Math.abs(before)) kicks.push(Math.max(v[e.a], v[e.b]));
          this.coilI.set(e.part, now);
          return;
        }
        if (e.k === "R" && e.tag) {
          if (e.tag !== "upper") return;
        }
        const id = e.part!;
        iSum.set(id, (iSum.get(id) ?? 0) + i);
        const part = doc.parts.find((p) => p.id === id)!;

        if (e.k === "C") this.capV.set(id, state.vc[idx]);
        if (e.k === "D") this.diodeV.set(`${id}:${e.tag ?? ""}`, state.vd[idx]);

        if (e.k === "D" && e.tag && (part.type === "rgbled" || part.type === "sevenseg" || part.type === "lcd1602")) {
          const ch = chanSum.get(id) ?? {};
          ch[e.tag] = (ch[e.tag] ?? 0) + i;
          chanSum.set(id, ch);
          this.chanNow.set(id, { ...(this.chanNow.get(id) ?? {}), [e.tag]: i });
          if (part.type !== "lcd1602" && this.overstress(`${id}:${e.tag}`, i, dt)) {
            this.burned.add(`${id}:${e.tag}`);
            burnedNow = true;
          }
        } else if (part.type === "led") {
          if (this.overstress(id, i, dt)) {
            this.burned.add(id);
            burnedNow = true;
          }
        } else if (part.type === "relay" && e.k === "R") {
          // The armature pulls in above about 3.7 V on the coil and lets go near 0.5 V.
          if (Math.abs(i) > 0.05) this.relays.add(id);
          else if (Math.abs(i) < 0.008) this.relays.delete(id);
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

      for (const top of kicks) {
        for (const q of c.elems) {
          if (q.k !== "Q" || this.burned.has(q.part)) continue;
          if (Math.abs(v[q.c] - top) < 2 && v[q.c] - v[q.e] > 15) {
            this.burned.add(q.part);
            this.burnWhy.set(q.part, "spike");
            burnedNow = true;
          }
        }
      }

      for (const sp of scopeParts) {
        const g = c.nodeOf.get(`${sp.id}.gnd`), a = c.nodeOf.get(`${sp.id}.ch1`), b = c.nodeOf.get(`${sp.id}.ch2`);
        if (g === undefined || a === undefined || b === undefined) continue;
        this.scopes.get(sp.id)!.push(this.time, v[a] - v[g], v[b] - v[g]);
      }
      this.senseDevices(c, v, dt);
      this.refreshI2c();
      if (c.uno) this.senseUno(c.uno, v, dt, c.nodeOf);

      if (burnedNow) {
        // A part just failed open; rebuild the netlist without it.
        c = compile(doc, rt);
        this.syncDevices(doc, c);
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
        case "scope": {
          const buf = this.scopes.get(id);
          const tdiv = Number(part.props.tdiv) || 0.002;
          const trig = Number(part.props.trig);
          const view = buf ? scopeView(buf, tdiv, Number.isFinite(trig) ? trig : 2.5) : null;
          if (view) {
            const f = (hz?: number) => (hz === undefined ? "–" : hz >= 1000 ? formatSI(hz, "Hz", 4) : `${hz.toFixed(hz < 100 ? 1 : 0)} Hz`);
            parts[id] = {
              v: 0, i: 0, p: 0,
              scope: { ...view, tdiv, v1div: Number(part.props.v1div) || 1, v2div: Number(part.props.v2div) || 1, trig: Number.isFinite(trig) ? trig : 2.5 },
              extra: {
                "CH1 frequency": f(view.stats1.freq),
                "CH1 duty cycle": view.stats1.duty === undefined ? "–" : `${(view.stats1.duty * 100).toFixed(0)} %`,
                "CH1 peak to peak": formatSI(view.stats1.vpp, "V"),
                "CH1 average": formatSI(view.stats1.mean, "V"),
                "CH2 peak to peak": formatSI(view.stats2.vpp, "V"),
                "CH2 average": formatSI(view.stats2.mean, "V"),
                Trigger: view.triggered ? "Locked" : "Free-running (no edge found)",
              },
            };
          }
          break;
        }
        case "servo":
        case "hcsr04":
        case "lcd1602":
        case "oled": {
          const dev = this.devices.get(id);
          const sup = DEVICE_SUPPLY[part.type];
          const supply = nv(id, sup.vcc) - nv(id, sup.gnd);
          parts[id] = { v: supply, i, p: 0, ...(dev ? dev.live() : {}) };
          if (dev && !dev.powered) {
            warnings.push({
              id: `nopower-${id}`, level: "info", part: id,
              title: `${part.type === "servo" ? "Servo" : part.type === "hcsr04" ? "Ultrasonic sensor" : part.type === "oled" ? "OLED" : "LCD"} has no power`,
              why: `It sees ${formatSI(Math.max(0, supply), "V")} across its supply pins and needs ${part.type === "servo" ? "4 to 6" : "about 5"} V. Check that both the power and ground pins are connected.`,
              fix: "Connect the supply pin to 5 V and the ground pin to GND.",
            });
          } else if (dev instanceof Oled && !dev.onBus) {
            warnings.push({
              id: `i2c-${id}`, level: "info", part: id,
              title: "The OLED is not on the I²C bus",
              why: "A sketch can only reach this display through the Uno's I²C pins: SDA must go to A4 and SCL to A5. Right now at least one of them goes somewhere else.",
              fix: "Wire the display's SDA to A4 and its SCL to A5.",
            });
          } else if (part.type === "lcd1602") {
            const lcd = parts[id].lcd;
            if (lcd && lcd.blocks && !lcd.on && nv(id, "v0") - nv(id, "vss") >= 0.08) {
              warnings.push({
                id: `lcdinit-${id}`, level: "info", part: id,
                title: "LCD is not initialised",
                why: "The display shows blocks on its first row until the sketch sends the start-up commands.",
                fix: "In setup(), call lcd.begin(16, 2) with the pins used in LiquidCrystal lcd(rs, e, d4, d5, d6, d7).",
              });
            }
          }
          break;
        }
        case "npn": {
          const vce = nv(id, "c") - nv(id, "e");
          const vbe = nv(id, "b") - nv(id, "e");
          const ic = burned ? 0 : i;
          const ib = burned ? 0 : (ibSum.get(id) ?? 0) / steps;
          const watts = Math.abs(vce * ic + vbe * ib);
          const region = burned ? "Burnt out" : vbe < 0.5 ? "Off" : vce < 0.35 ? "Saturated (fully on)" : "Active (amplifying)";
          parts[id] = {
            v: vce, i: ic, p: watts, burned,
            extra: {
              "Collector current": formatSI(Math.abs(ic) < 1e-7 ? 0 : ic, "A"),
              "Base current": formatSI(Math.abs(ib) < 1e-8 ? 0 : ib, "A"),
              "Gain (Ic ÷ Ib)": ib > 2e-6 && ic > 0 ? (ic / ib).toFixed(0) : "–",
              "Base-emitter": formatSI(vbe, "V"),
              State: region,
            },
          };
          const why = this.burnWhy.get(id);
          if (burned) {
            warnings.push({
              id: `qburn-${id}`, level: "danger", part: id,
              title: why === "spike" ? "Transistor destroyed by a voltage spike" : why === "current" ? "Transistor burnt out by too much current" : why === "reverse" ? "Transistor burnt out by reverse voltage" : "Transistor overheated",
              why:
                why === "spike"
                  ? "When the transistor switched off, the coil (an inductor) tried to keep its current flowing and pushed the collector up to hundreds of volts. A 2N2222 survives 40 V."
                  : why === "current"
                    ? "More than 1.5 A flowed through it. It is rated for 800 mA."
                    : why === "reverse"
                      ? "More than 6 V was applied backwards across base and emitter."
                      : "It dissipated well over 0.6 W for too long. In saturation the heat is Vce × Ic, so a large current through a half-on transistor gets hot.",
              fix:
                why === "spike"
                  ? "Put a diode across the coil, stripe toward the positive side, so the current has a path when the transistor turns off. Then fit a new transistor."
                  : why === "current"
                    ? "Use a load that draws less current, or a bigger transistor. Then fit a new one."
                    : "Fit a new transistor and check the wiring.",
            });
          } else if (ic > 0.8) {
            warnings.push({ id: `qhot-${id}`, level: "warn", part: id, title: "Transistor over its current rating", why: `${formatSI(ic, "A")} is flowing and the 2N2222 is rated for 800 mA.`, fix: "Use a lighter load or a bigger transistor." });
          } else if (watts > 0.6) {
            warnings.push({ id: `qpower-${id}`, level: "warn", part: id, title: "Transistor is getting hot", why: `It is dissipating ${formatSI(watts, "W")}; the rating is about 0.6 W. A transistor is coolest fully on or fully off.`, fix: "Drive the base harder (a smaller base resistor) so it saturates." });
          }
          break;
        }
        case "rgbled":
        case "sevenseg": {
          const names = part.type === "rgbled" ? ["r", "g", "b"] : ["a", "b", "c", "d", "e", "f", "g", "dp"];
          const sums = chanSum.get(id) ?? {};
          const channels: Record<string, number> = {};
          let total = 0;
          const dead: string[] = [];
          for (const ch of names) {
            const dead1 = this.burned.has(`${id}:${ch}`);
            if (dead1) dead.push(ch.toUpperCase());
            const cur = dead1 ? 0 : Math.max(0, (sums[ch] ?? 0) / steps);
            total += cur;
            channels[ch] = Math.min(1, Math.pow(cur / 0.02, 0.6));
            if (cur > 0.03) {
              warnings.push({
                id: `chhot-${id}-${ch}`, level: "warn", part: id,
                title: `${part.type === "rgbled" ? ({ r: "Red", g: "Green", b: "Blue" } as Record<string, string>)[ch] : `Segment ${ch.toUpperCase()}`} is over its limit`,
                why: `${formatSI(cur, "A")} is flowing; each LED here is rated for about 20 mA.`,
                fix: "Increase that colour's series resistor.",
              });
            }
          }
          parts[id] = { v: 0, i: total, p: 0, channels, burned: dead.length > 0 };
          if (dead.length) {
            warnings.push({
              id: `chburn-${id}`, level: "danger", part: id,
              title: `${part.type === "rgbled" ? "RGB LED" : "Display"}: ${dead.join(", ")} burnt out`,
              why: "Too much current flowed through it. Each colour or segment is a separate LED and needs its own series resistor.",
              fix: "Fit a new part and add a 220 Ω to 330 Ω resistor in series with every anode.",
            });
          }
          break;
        }
        case "relay": {
          const on = this.relays.has(id);
          const coil = nv(id, "coila") - nv(id, "coilb");
          parts[id] = {
            v: coil, i, p: Math.abs(coil * i), on,
            extra: {
              Coil: on ? "Energised" : Math.abs(i) > 0.008 ? "Charging" : "Off",
              Contacts: on ? "Common joined to normally open" : "Common joined to normally closed",
              "Coil current": formatSI(Math.abs(i) < 5e-6 ? 0 : Math.abs(i), "A"),
            },
          };
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
