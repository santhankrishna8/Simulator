import type { AVRTWI, TWIEventHandler } from "avr8js";

/** A device on the I²C bus. */
export interface I2cSlave {
  /** A transaction began (a START condition). */
  start(): void;
  /** Called when the master addresses this device. Return true to acknowledge it. */
  connect(write: boolean): boolean;
  /** One byte written to the device. Return true to acknowledge it. */
  write(byte: number): boolean;
  /** One byte read from the device. `ack` says the master wants more after this one. */
  read(ack: boolean): number;
  /** The transaction ended (a STOP condition). */
  stop(): void;
}

/**
 * The Uno's two-wire interface connected to whatever is on the bus. avr8js answers instantly,
 * but a real byte takes nine clock pulses (about 90 µs at the 100 kHz Wire uses), which is why
 * redrawing an OLED takes around a tenth of a second. So every step is delayed by its real time.
 */
export class I2cBus implements TWIEventHandler {
  /** Devices that are powered and wired to SDA and SCL, by 7-bit address. The engine keeps this current. */
  slaves = new Map<number, I2cSlave>();
  private current: I2cSlave | null = null;

  constructor(
    private readonly twi: AVRTWI,
    private readonly later: (cycles: number, fn: () => void) => void,
    private readonly cpuHz: number,
  ) {}

  /** CPU cycles in one SCL clock pulse. */
  private bit(): number {
    return this.cpuHz / Math.max(1000, this.twi.sclFrequency);
  }

  start() {
    this.later(this.bit() / 2, () => {
      this.current = null;
      this.slaves.forEach((s) => s.start());
      this.twi.completeStart();
    });
  }

  stop() {
    this.later(this.bit() / 2, () => {
      this.current?.stop();
      this.current = null;
      this.twi.completeStop();
    });
  }

  connectToSlave(address: number, write: boolean) {
    const slave = this.slaves.get(address);
    const ack = !!slave && slave.connect(write);
    this.current = ack ? slave! : null;
    this.later(this.bit() * 9, () => this.twi.completeConnect(ack));
  }

  writeByte(value: number) {
    const ack = this.current ? this.current.write(value) : false;
    this.later(this.bit() * 9, () => this.twi.completeWrite(ack));
  }

  readByte(ack: boolean) {
    const value = this.current ? this.current.read(ack) : 0xff;
    this.later(this.bit() * 9, () => this.twi.completeRead(value));
  }
}
