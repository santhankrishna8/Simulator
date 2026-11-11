/** Pin ids of the Uno's usable I/O, in Arduino numbering: D0 to D13, then A0 to A5 as 14 to 19. */
export const UNO_PIN_IDS = [
  ...Array.from({ length: 14 }, (_, i) => `d${i}`),
  ...Array.from({ length: 6 }, (_, i) => `a${i}`),
];

/** Parts that talk to the chip with exact timing, and the pins that carry their supply. */
export const DEVICE_SUPPLY: Record<string, { vcc: string; gnd: string }> = {
  servo: { vcc: "vcc", gnd: "gnd" },
  hcsr04: { vcc: "vcc", gnd: "gnd" },
  lcd1602: { vcc: "vdd", gnd: "vss" },
  oled: { vcc: "vcc", gnd: "gnd" },
};

/** The Uno's I²C pins in Arduino numbering: SDA is A4 (18) and SCL is A5 (19). */
export const I2C_SDA = 18;
export const I2C_SCL = 19;
