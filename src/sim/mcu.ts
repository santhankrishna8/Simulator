/**
 * An ATmega328P running at 16 MHz, built on avr8js. The circuit engine owns the
 * wiring: it tells the chip what voltage each input pin sees, and asks what
 * each output pin is driving.
 */
import {
  AVRADC, AVRIOPort, AVRSPI, AVRTimer, AVRTWI, AVRUSART, CPU, PinState,
  adcConfig, avrInstruction, portBConfig, portCConfig, portDConfig,
  spiConfig, timer0Config, timer1Config, timer2Config, twiConfig, usart0Config,
} from "avr8js";

export const CPU_HZ = 16_000_000;

export type PinMode = "high" | "low" | "input" | "pullup";

/** Intel HEX to AVR program memory (16-bit words, little endian). */
export function parseHex(hex: string): Uint16Array {
  const bytes = new Uint8Array(32768);
  let top = 0;
  for (const raw of hex.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith(":")) continue;
    const len = parseInt(line.slice(1, 3), 16);
    const addr = parseInt(line.slice(3, 7), 16);
    const type = parseInt(line.slice(7, 9), 16);
    if (type === 1) break;
    if (type !== 0) continue;
    for (let i = 0; i < len; i++) {
      const at = addr + i;
      if (at >= bytes.length) throw new Error("Program is larger than the Uno's flash memory.");
      bytes[at] = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
      top = Math.max(top, at + 1);
    }
  }
  if (!top) throw new Error("The hex file is empty.");
  return new Uint16Array(bytes.buffer, 0, 16384).slice();
}

/** Arduino pin number to port and bit. D0-D7 are PORTD, D8-D13 PORTB, A0-A5 PORTC. */
export function pinToPort(pin: number): { port: "B" | "C" | "D"; bit: number } {
  if (pin < 8) return { port: "D", bit: pin };
  if (pin < 14) return { port: "B", bit: pin - 8 };
  return { port: "C", bit: pin - 14 };
}

export { UNO_PIN_IDS } from "./pins";

export class Mcu {
  readonly cpu: CPU;
  readonly usart: AVRUSART;
  readonly adc: AVRADC;
  private readonly ports: Record<"B" | "C" | "D", AVRIOPort>;
  private readonly tx: number[] = [];
  private readonly rxQueue: number[] = [];
  /** Counters that tick when the matching serial LED should blink. */
  txActivity = 0;
  rxActivity = 0;
  /**
   * Called the instant a pin the sketch drives changes level, from inside the instruction that
   * changed it, so `this.cycles` is the exact clock cycle of the edge.
   */
  onPin: ((pin: number, level: boolean) => void) | null = null;
  private readonly emitted: (boolean | undefined)[] = new Array(20).fill(undefined);

  constructor(program: Uint16Array) {
    this.cpu = new CPU(program);
    this.ports = {
      B: new AVRIOPort(this.cpu, portBConfig),
      C: new AVRIOPort(this.cpu, portCConfig),
      D: new AVRIOPort(this.cpu, portDConfig),
    };
    const watch = (port: AVRIOPort, base: number, bits: number) =>
      port.addListener(() => {
        if (!this.onPin) return;
        for (let bit = 0; bit < bits; bit++) {
          const state = port.pinState(bit);
          if (state !== PinState.High && state !== PinState.Low) continue;
          const level = state === PinState.High;
          if (this.emitted[base + bit] === level) continue;
          this.emitted[base + bit] = level;
          this.onPin(base + bit, level);
        }
      });
    watch(this.ports.D, 0, 8);
    watch(this.ports.B, 8, 6);
    watch(this.ports.C, 14, 6);
    new AVRTimer(this.cpu, timer0Config);
    new AVRTimer(this.cpu, timer1Config);
    new AVRTimer(this.cpu, timer2Config);
    new AVRSPI(this.cpu, spiConfig, CPU_HZ);
    new AVRTWI(this.cpu, twiConfig, CPU_HZ);
    this.usart = new AVRUSART(this.cpu, usart0Config, CPU_HZ);
    this.usart.onByteTransmit = (b) => {
      this.tx.push(b);
      this.txActivity++;
    };
    this.adc = new AVRADC(this.cpu, adcConfig);
  }

  /** Execute for the given number of clock cycles. */
  run(cycles: number) {
    const cpu = this.cpu;
    const end = cpu.cycles + cycles;
    while (cpu.cycles < end) {
      avrInstruction(cpu);
      cpu.tick();
    }
  }

  get cycles() {
    return this.cpu.cycles;
  }

  /** Run `fn` after `cycles` more clock cycles, at that exact cycle. */
  schedule(cycles: number, fn: () => void) {
    this.cpu.addClockEvent(fn, Math.max(1, cycles));
  }

  /** What the sketch has the pin configured to do right now. */
  pinMode(pin: number): PinMode {
    const { port, bit } = pinToPort(pin);
    switch (this.ports[port].pinState(bit)) {
      case PinState.High: return "high";
      case PinState.Low: return "low";
      case PinState.InputPullUp: return "pullup";
      default: return "input";
    }
  }

  /** The level the circuit presents to a pin that is configured as an input. */
  setInput(pin: number, high: boolean) {
    const { port, bit } = pinToPort(pin);
    this.ports[port].setPin(bit, high);
  }

  /** Send bytes to the sketch's Serial.read(). */
  receive(text: string) {
    for (const b of new TextEncoder().encode(text)) this.rxQueue.push(b);
  }

  /** Feed queued serial input as the receiver becomes free. Call every step. */
  pumpSerial() {
    while (this.rxQueue.length && !this.usart.rxBusy) {
      if (this.usart.writeByte(this.rxQueue[0]) === false) break;
      this.rxQueue.shift();
      this.rxActivity++;
    }
  }

  /** Everything the sketch has printed since the last call. */
  takeOutput(): Uint8Array {
    return Uint8Array.from(this.tx.splice(0));
  }

  /** The serial speed the sketch asked for, rounded to the standard rate (the hardware divider is slightly off). */
  get baud() {
    const actual = this.usart.baudRate;
    if (!actual) return 0;
    const standard = [300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 31250, 38400, 57600, 76800, 115200, 230400, 250000, 500000, 1000000];
    const near = standard.reduce((a, b) => (Math.abs(b - actual) < Math.abs(a - actual) ? b : a));
    return Math.abs(near - actual) / near < 0.04 ? near : Math.round(actual);
  }
}
