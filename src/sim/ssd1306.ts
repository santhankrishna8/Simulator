import type { I2cSlave } from "./i2c";

export const OLED_W = 128;
export const OLED_H = 64;
const PAGES = OLED_H / 8;

export interface OledLive {
  /** 128 columns by 8 pages of 8 vertical pixels; bit 0 of each byte is the top pixel. */
  gddram: Uint8Array;
  /** Changes whenever the picture does, so a drawing can skip unchanged frames. */
  version: number;
  /** How many full screens have been sent. */
  frames: number;
  /** The display is switched on and has its charge pump running, so it is actually lit. */
  lit: boolean;
  displayOn: boolean;
  pumpOn: boolean;
  contrast: number;
  invert: boolean;
  allOn: boolean;
  flipX: boolean;
  flipY: boolean;
}

/** Parameter bytes each command takes. */
const PARAMS: Record<number, number> = {
  0x81: 1, 0x20: 1, 0x21: 2, 0x22: 2, 0xa8: 1, 0xd3: 1, 0xd5: 1, 0xd9: 1, 0xda: 1, 0xdb: 1, 0x8d: 1, 0xad: 1,
  0xa3: 2, 0x26: 6, 0x27: 6, 0x29: 5, 0x2a: 5,
};

/** The SSD1306 OLED controller behind the common 0.96 inch 128x64 modules. */
export class Ssd1306 implements I2cSlave {
  private ram = new Uint8Array(OLED_W * PAGES);
  version = 0;
  /** Complete screens written, counted each time the write position wraps from the last page to the first. */
  frames = 0;
  private displayOn = false;
  private pumpOn = false;
  private contrast = 0x7f;
  private invert = false;
  private allOn = false;
  private flipX = false;
  private flipY = false;
  private mode: 0 | 1 | 2 = 2; // power-on default: page addressing
  private colStart = 0;
  private colEnd = OLED_W - 1;
  private pageStart = 0;
  private pageEnd = PAGES - 1;
  private col = 0;
  private page = 0;

  private phase: "control" | "command" | "data" = "control";
  private more = false; // the control byte said another control byte follows each byte
  private pending: { cmd: number; need: number; args: number[] } | null = null;

  start() {
    this.phase = "control";
    // A command that is waiting for its parameter keeps waiting: the Adafruit library sends the
    // command and its parameter in separate transactions, and the chip does not forget in between.
  }
  connect() {
    return true;
  }
  stop() {
    this.phase = "control";
  }
  read() {
    return 0;
  }

  write(byte: number): boolean {
    switch (this.phase) {
      case "control":
        this.more = !!(byte & 0x80);
        this.phase = byte & 0x40 ? "data" : "command";
        return true;
      case "command":
        this.command(byte);
        if (this.more) this.phase = "control"; // with Co set, a control byte precedes every byte, parameters included
        return true;
      case "data":
        this.data(byte);
        if (this.more) this.phase = "control";
        return true;
    }
  }

  private command(b: number) {
    if (this.pending) {
      this.pending.args.push(b);
      if (this.pending.args.length >= this.pending.need) {
        this.apply(this.pending.cmd, this.pending.args);
        this.pending = null;
      }
      return;
    }
    const need = PARAMS[b];
    if (need) {
      this.pending = { cmd: b, need, args: [] };
      return;
    }
    if (b === 0xae || b === 0xaf) this.displayOn = b === 0xaf;
    else if (b === 0xa4 || b === 0xa5) this.allOn = b === 0xa5;
    else if (b === 0xa6 || b === 0xa7) this.invert = b === 0xa7;
    else if (b === 0xa0 || b === 0xa1) this.flipX = b === 0xa1;
    else if (b === 0xc0 || b === 0xc8) this.flipY = b === 0xc8;
    else if ((b & 0xf8) === 0xb0) this.page = b & 0x07; // page start, in page addressing mode
    else if ((b & 0xf0) === 0x00) this.col = (this.col & 0xf0) | (b & 0x0f); // low column nibble
    else if ((b & 0xf0) === 0x10) this.col = (this.col & 0x0f) | ((b & 0x0f) << 4); // high column nibble
    this.version++;
  }

  private apply(cmd: number, a: number[]) {
    if (cmd === 0x81) this.contrast = a[0];
    else if (cmd === 0x20) this.mode = (a[0] & 3) === 0 ? 0 : (a[0] & 3) === 1 ? 1 : 2;
    else if (cmd === 0x21) {
      this.colStart = a[0] & 0x7f;
      this.colEnd = a[1] & 0x7f;
      this.col = this.colStart;
    } else if (cmd === 0x22) {
      this.pageStart = a[0] & 7;
      this.pageEnd = a[1] & 7;
      this.page = this.pageStart;
    } else if (cmd === 0x8d) this.pumpOn = (a[0] & 0x04) !== 0; // 0x14 turns the charge pump on, 0x10 off
    this.version++;
  }

  private data(b: number) {
    this.ram[this.page * OLED_W + this.col] = b;
    this.version++;
    if (this.mode === 2) {
      this.col = (this.col + 1) & 0x7f; // page mode: wraps within the page
    } else if (this.mode === 0) {
      if (this.col >= this.colEnd) {
        this.col = this.colStart;
        if (this.page >= this.pageEnd) {
          this.page = this.pageStart;
          this.frames++;
        } else this.page++;
      } else this.col++;
    } else {
      if (this.page >= this.pageEnd) {
        this.page = this.pageStart;
        this.col = this.col >= this.colEnd ? this.colStart : this.col + 1;
      } else this.page++;
    }
  }

  /** Whether the display is actually lighting pixels: switched on, with its charge pump running. */
  get lit() {
    return this.displayOn && this.pumpOn;
  }

  snapshot(): OledLive {
    return {
      gddram: this.ram.slice(),
      version: this.version,
      frames: this.frames,
      lit: this.displayOn && this.pumpOn,
      displayOn: this.displayOn,
      pumpOn: this.pumpOn,
      contrast: this.contrast,
      invert: this.invert,
      allOn: this.allOn,
      flipX: this.flipX,
      flipY: this.flipY,
    };
  }
}

/**
 * Is this pixel lit on the glass? The memory is read the way the chip drives a typical module:
 * with the segment-remap and COM-scan commands that the Adafruit library sends (A1 and C8), the
 * picture is upright; with the power-on defaults it comes out turned 180 degrees.
 */
export function pixel(live: OledLive, x: number, y: number): boolean {
  if (live.allOn) return true;
  const col = live.flipX ? x : OLED_W - 1 - x;
  const row = live.flipY ? y : OLED_H - 1 - y;
  const on = ((live.gddram[(row >> 3) * OLED_W + col] >> (row & 7)) & 1) === 1;
  return live.invert ? !on : on;
}
