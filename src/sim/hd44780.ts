/**
 * Hitachi HD44780 character LCD controller: the chip behind every 16x2 module.
 * Supports the 4-bit and 8-bit interfaces, both display lines, custom characters,
 * cursor and blink, and display shifting. It does not model the busy flag, which
 * the Arduino LiquidCrystal library never reads.
 */

export interface LcdLive {
  /** Character codes on screen, row by row (what a person sees). */
  rows: [number[], number[]];
  /** Eight custom 5x8 characters, one byte per row (bits 4..0). */
  cgram: number[][];
  cursor: { row: number; col: number; underline: boolean; blink: boolean } | null;
  /** The display is switched on (and the controller initialised). */
  on: boolean;
  /** Before the controller is initialised, row 1 shows solid blocks like a real module. */
  blocks: boolean;
}

const LINE = 40;

export class Hd44780 {
  private ddram = new Uint8Array(80).fill(0x20);
  private cgram = new Uint8Array(64);
  private addr = 0;
  private inCg = false;
  private increment = true;
  private shiftOnWrite = false;
  private displayOn = false;
  private cursorOn = false;
  private blinkOn = false;
  private shift = 0;
  private eightBit = true;
  private twoLine = false;
  private initialised = false;
  private pending: number | null = null;

  /**
   * Latch one transfer, on the falling edge of E. `bus` has D7 at bit 7. In 4-bit
   * mode only D7..D4 are used and two transfers make a byte, high nibble first.
   */
  latch(rs: boolean, bus: number) {
    if (this.eightBit) {
      this.execute(rs, bus & 0xff);
      return;
    }
    const nibble = (bus >> 4) & 0x0f;
    if (this.pending === null) {
      this.pending = nibble;
      return;
    }
    const byte = (this.pending << 4) | nibble;
    this.pending = null;
    this.execute(rs, byte);
  }

  private execute(rs: boolean, byte: number) {
    if (rs) this.writeData(byte);
    else this.command(byte);
  }

  private command(b: number) {
    if (b & 0x80) {
      this.addr = b & 0x7f;
      this.inCg = false;
    } else if (b & 0x40) {
      this.addr = b & 0x3f;
      this.inCg = true;
    } else if (b & 0x20) {
      const was8 = this.eightBit;
      this.eightBit = !!(b & 0x10);
      this.twoLine = !!(b & 0x08);
      // The very first 4-bit function set arrives as a single nibble; it must not start a pair.
      if (was8 && !this.eightBit) this.pending = null;
      this.initialised = true;
    } else if (b & 0x10) {
      const display = !!(b & 0x08);
      const right = !!(b & 0x04);
      if (display) this.shift = (this.shift + (right ? LINE - 1 : 1)) % LINE;
      else this.addr = (this.addr + (right ? 1 : 0x7f)) & 0x7f;
    } else if (b & 0x08) {
      this.displayOn = !!(b & 0x04);
      this.cursorOn = !!(b & 0x02);
      this.blinkOn = !!(b & 0x01);
    } else if (b & 0x04) {
      this.increment = !!(b & 0x02);
      this.shiftOnWrite = !!(b & 0x01);
    } else if (b & 0x02) {
      this.addr = 0;
      this.shift = 0;
      this.inCg = false;
    } else if (b & 0x01) {
      this.ddram.fill(0x20);
      this.addr = 0;
      this.shift = 0;
      this.inCg = false;
      this.increment = true;
    }
  }

  /** DDRAM index for an address, or -1 if the address maps to nothing. */
  private index(addr: number): number {
    if (!this.twoLine) return addr < 80 ? addr : -1;
    if (addr < LINE) return addr;
    if (addr >= 0x40 && addr < 0x40 + LINE) return LINE + (addr - 0x40);
    return -1;
  }

  private writeData(b: number) {
    if (this.inCg) {
      this.cgram[this.addr & 0x3f] = b & 0x1f;
      this.addr = (this.addr + (this.increment ? 1 : 63)) & 0x3f;
      return;
    }
    const i = this.index(this.addr);
    if (i >= 0) this.ddram[i] = b;
    this.addr = (this.addr + (this.increment ? 1 : 0x7f)) & 0x7f;
    if (this.shiftOnWrite) this.shift = (this.shift + (this.increment ? 1 : LINE - 1)) % LINE;
  }

  snapshot(): LcdLive {
    const rows: [number[], number[]] = [[], []];
    for (let c = 0; c < 16; c++) {
      const at = (c + this.shift) % LINE;
      rows[0].push(this.ddram[at]);
      rows[1].push(this.ddram[this.twoLine ? LINE + at : (at + 16 + LINE) % 80]);
    }
    if (!this.twoLine) {
      // One-line mode shows 16 of the 80 characters in a single row.
      rows[0] = Array.from({ length: 16 }, (_, c) => this.ddram[(c + this.shift) % 80]);
      rows[1] = new Array(16).fill(0x20);
    }
    let cursor: LcdLive["cursor"] = null;
    if (this.cursorOn || this.blinkOn) {
      let row = -1, col = -1;
      if (this.twoLine) {
        if (this.addr < LINE) { row = 0; col = (this.addr - this.shift + LINE) % LINE; }
        else if (this.addr >= 0x40 && this.addr < 0x40 + LINE) { row = 1; col = (this.addr - 0x40 - this.shift + LINE) % LINE; }
      } else if (this.addr < 80) {
        row = 0;
        col = (this.addr - this.shift + 80) % 80;
      }
      if (row >= 0 && col < 16) cursor = { row, col, underline: this.cursorOn, blink: this.blinkOn };
    }
    const cg: number[][] = [];
    for (let k = 0; k < 8; k++) cg.push(Array.from(this.cgram.slice(k * 8, k * 8 + 8)));
    return { rows, cgram: cg, cursor, on: this.initialised && this.displayOn, blocks: !this.initialised };
  }
}
