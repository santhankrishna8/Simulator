/**
 * Digital devices that need exact timing: the chip's pin changes reach them with
 * their CPU cycle number, and what they drive back goes to the chip at an exact cycle.
 * The circuit solver only moves in 0.2 ms steps, far too coarse for a 10 µs trigger pulse.
 */
import { Hd44780, type LcdLive } from "./hd44780";
import { CPU_HZ } from "./mcu";

export type { LcdLive };

export interface DeviceLive {
  /** Servo horn angle in degrees. */
  deg?: number;
  lcd?: LcdLive & { contrast: number; backlight: number };
  extra?: Record<string, string>;
}

export interface DeviceCtx {
  /** Current CPU cycle. */
  cycles(): number;
  /** Run `fn` after this many CPU cycles. */
  schedule(cycles: number, fn: () => void): void;
  /** The device drives one of its output pins to a level. */
  drive(pin: string, level: boolean): void;
}

export interface DeviceEnv {
  /** Voltage at one of the device's pins. */
  v(pin: string): number;
  /** Seconds of simulated time this step covers. */
  dt: number;
  /** Supply minus ground, in volts. */
  vcc: number;
  /** Total current drawn from the backlight diode, for the LCD. */
  backlightAmps: number;
}

const us = (micro: number) => Math.round((micro * CPU_HZ) / 1e6);
const cyclesToUs = (c: number) => (c * 1e6) / CPU_HZ;

export abstract class Device {
  /** Pins this device listens to. */
  abstract readonly inputs: readonly string[];
  powered = false;
  outputs: Record<string, boolean> = {};
  props: Record<string, number | string> = {};

  constructor(protected ctx: DeviceCtx) {}

  /** An input pin changed level. */
  input(pin: string, level: boolean): void {
    void pin;
    void level;
  }
  /** Advance analog behaviour (motion, power) by one solver step. */
  step(env: DeviceEnv): void {
    void env;
  }
  /** The Uno restarted; forget anything tied to its old program. */
  onChipReset(): void {}
  /** Ohms across the device's supply pins. */
  abstract load(): number;
  abstract live(): DeviceLive;
}

/* ---------- Servo (SG90 class) ---------- */

export class Servo extends Device {
  readonly inputs = ["sig"] as const;
  private riseAt = -1;
  private pulseUs = 0;
  private target = 90;
  private angle = 90;
  private moving = false;

  input(pin: string, level: boolean) {
    if (pin !== "sig") return;
    const now = this.ctx.cycles();
    if (level) {
      this.riseAt = now;
      return;
    }
    if (this.riseAt < 0) return;
    const width = cyclesToUs(now - this.riseAt);
    this.riseAt = -1;
    // Pulses outside this window are not servo signals (a plain digital output, say).
    if (width < 400 || width > 2700) return;
    this.pulseUs = Math.round(width);
    // The Arduino Servo library maps 0 to 180 degrees onto 544 to 2400 µs.
    this.target = Math.min(180, Math.max(0, ((width - 544) / (2400 - 544)) * 180));
  }

  step(env: DeviceEnv) {
    this.powered = env.vcc >= 4.0;
    if (!this.powered) {
      this.moving = false;
      return;
    }
    // About 0.1 s per 60 degrees with no load.
    const maxStep = 600 * env.dt;
    const err = this.target - this.angle;
    this.moving = Math.abs(err) > 0.3;
    this.angle += Math.abs(err) <= maxStep ? err : Math.sign(err) * maxStep;
  }

  onChipReset() {
    this.riseAt = -1;
  }

  load() {
    // Idle about 10 mA; moving about 200 mA, from the supply.
    return this.moving ? 25 : 500;
  }

  live(): DeviceLive {
    return {
      deg: this.angle,
      extra: {
        Angle: `${this.angle.toFixed(0)}°`,
        "Commanded angle": this.pulseUs ? `${this.target.toFixed(0)}°` : "no signal yet",
        "Pulse width": this.pulseUs ? `${this.pulseUs} µs` : "–",
        State: !this.powered ? "No power (needs 4 to 6 V)" : this.moving ? "Moving" : "Holding",
      },
    };
  }
}

/* ---------- HC-SR04 ultrasonic ranger ---------- */

const SPEED_OF_SOUND = 343.4; // m/s at 20 °C

export class HcSr04 extends Device {
  readonly inputs = ["trig"] as const;
  private trigAt = -1;
  private busy = false;
  private lastCm = 0;

  input(pin: string, level: boolean) {
    if (pin !== "trig") return;
    const now = this.ctx.cycles();
    if (level) {
      this.trigAt = now;
      return;
    }
    if (this.trigAt < 0) return;
    const width = cyclesToUs(now - this.trigAt);
    this.trigAt = -1;
    if (width >= 8 && !this.busy && this.powered) this.measure();
  }

  private measure() {
    this.busy = true;
    const cm = Math.min(400, Math.max(2, Number(this.props.cm ?? 100)));
    this.lastCm = cm;
    // Nothing in range: the module holds ECHO high for about 38 ms and gives up.
    const echoUs = cm >= 400 ? 38_000 : (cm * 2 * 1e4) / SPEED_OF_SOUND;
    // The module sends eight 40 kHz bursts (about 200 µs) before it listens.
    this.ctx.schedule(us(500), () => {
      this.ctx.drive("echo", true);
      this.ctx.schedule(us(echoUs), () => {
        this.ctx.drive("echo", false);
        this.busy = false;
      });
    });
  }

  step(env: DeviceEnv) {
    this.powered = env.vcc >= 4.5;
  }

  onChipReset() {
    this.trigAt = -1;
    this.busy = false;
    this.outputs.echo = false;
  }

  load() {
    return 333; // about 15 mA
  }

  live(): DeviceLive {
    return {
      extra: {
        "Object distance": `${Number(this.props.cm ?? 100)} cm`,
        "Last echo": this.lastCm ? `${Math.round((this.lastCm * 2 * 1e4) / SPEED_OF_SOUND)} µs` : "–",
        State: !this.powered ? "No power (needs 5 V)" : this.busy ? "Measuring" : "Ready",
      },
    };
  }
}

/* ---------- 16x2 character LCD (HD44780) ---------- */

export class Lcd1602 extends Device {
  readonly inputs = ["rs", "rw", "e", "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7"] as const;
  private chip = new Hd44780();
  private level: Record<string, boolean> = {};
  private contrast = 0;
  private backlight = 0;

  input(pin: string, level: boolean) {
    this.level[pin] = level;
    if (pin !== "e" || level || !this.powered) return;
    if (this.level.rw) return; // reads are not modelled
    const l = this.level;
    // 8-bit wiring uses D0..D7. In 4-bit mode the chip ignores D0..D3.
    const bus = (l.d7 ? 128 : 0) | (l.d6 ? 64 : 0) | (l.d5 ? 32 : 0) | (l.d4 ? 16 : 0) | (l.d3 ? 8 : 0) | (l.d2 ? 4 : 0) | (l.d1 ? 2 : 0) | (l.d0 ? 1 : 0);
    this.chip.latch(!!l.rs, bus);
  }

  step(env: DeviceEnv) {
    const was = this.powered;
    this.powered = env.vcc >= 4.0;
    if (was && !this.powered) this.chip = new Hd44780(); // losing power wipes the display
    // V0 sets contrast: best near 0.5 V, fading to invisible by about 2 V; at 0 V everything goes dark.
    const v0 = env.v("v0");
    this.contrast = v0 >= 2.2 ? 0 : v0 > 0.3 ? 1 - (v0 - 0.3) / 1.9 : 1;
    // A module's backlight looks fully lit at around 15 mA.
    this.backlight = Math.min(1, env.backlightAmps / 0.015);
    this.tooDark = v0 < 0.08;
  }

  tooDark = false;

  load() {
    return 5000; // about 1 mA for the logic
  }

  live(): DeviceLive {
    const lcd = this.chip.snapshot();
    return {
      lcd: { ...lcd, on: lcd.on && this.powered, contrast: this.tooDark ? 1 : this.contrast, backlight: this.backlight, blocks: this.powered && (lcd.blocks || this.tooDark) },
      extra: {
        Display: !this.powered ? "No power" : lcd.blocks ? "Not initialised" : lcd.on ? "On" : "Off",
        Contrast: !this.powered ? "–" : this.tooDark ? "Too dark (V0 near 0 V)" : this.contrast < 0.15 ? "Too faint (V0 too high)" : "Readable",
        Backlight: this.backlight > 0.05 ? "On" : "Off",
      },
    };
  }
}
