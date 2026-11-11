import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOT, checkSource, compile, findPrototypes, parseDiagnostics, prepare } from "./compile.mjs";

describe("sketch preparation", () => {
  it("declares functions that are used before they are defined", () => {
    const out = prepare("int led = 13;\nvoid setup() { blink(); }\nvoid loop() {}\nvoid blink() { }\n");
    expect(out).toContain("void setup();");
    expect(out).toContain("void blink();");
    // Prototypes land before the first function, after the user's globals, and line numbers are restored.
    expect(out.indexOf("int led = 13;")).toBeLessThan(out.indexOf("void setup();"));
    expect(out).toMatch(/#line 2 "sketch\.ino"\nvoid setup\(\)/);
  });

  it("ignores braces and parentheses in comments, strings and macros", () => {
    const src = '#define X(a) { a }\n// void fake() {\nconst char* s = "void nope() {";\nvoid real(int a) { /* } */ }\n';
    expect(findPrototypes(src).protos).toEqual(["void real(int a);"]);
  });

  it("does not turn control flow or structs into prototypes", () => {
    const src = "struct P { int x; };\nvoid f() { if (1) { } for (;;) { } }\n";
    expect(findPrototypes(src).protos).toEqual(["void f();"]);
  });
});

describe("source checks", () => {
  it("allows library includes", () => {
    expect(checkSource("#include <Servo.h>\nvoid setup(){}\nvoid loop(){}")).toBeNull();
    expect(checkSource("#include <avr/pgmspace.h> // flash\nvoid setup(){}")).toBeNull();
  });

  it("rejects ways of reading host files", () => {
    for (const bad of ['#include "/etc/passwd"', "#include </etc/passwd>", "#include <../../etc/passwd>", '#include "local.h"', 'asm(".incbin \\"/etc/passwd\\"");', "#include_next <x.h>"]) {
      expect(checkSource(`${bad}\nvoid setup(){}`), bad).not.toBeNull();
    }
  });

  it("rejects empty and oversized sketches", () => {
    expect(checkSource("   ")).not.toBeNull();
    expect(checkSource("x".repeat(70_000))).not.toBeNull();
  });
});

describe("compiler messages", () => {
  it("parses gcc output and hides the temp directory", () => {
    const log = "/tmp/sketch-1/sketch.cpp: In function 'void setup()':\nsketch.ino:3:1: error: expected ';' before '}' token\n/tmp/sketch-1/lib/x.h:9:2: warning: unused\n";
    expect(parseDiagnostics(log, "/tmp/sketch-1")).toEqual([
      { file: "sketch.ino", line: 3, column: 1, severity: "error", message: "expected ';' before '}' token" },
      { file: "x.h", line: 9, column: 2, severity: "warning", message: "unused" },
    ]);
  });
});

// These need avr-gcc and the prebuilt core; they are skipped where the toolchain is not installed.
describe.skipIf(!existsSync(`${ROOT}/build/core.a`))("avr-gcc", () => {
  it("compiles a sketch to a hex file within the Uno's limits", async () => {
    const r = await compile("void setup(){ pinMode(13, OUTPUT); }\nvoid loop(){ digitalWrite(13, !digitalRead(13)); delay(250); }\n");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hex.startsWith(":")).toBe(true);
      expect(r.flash).toBeGreaterThan(500);
      expect(r.flash).toBeLessThan(2000);
    }
  });

  it("reports the line of a syntax error", async () => {
    const r = await compile("void setup() {\n  pinMode(13, OUTPUT)\n}\nvoid loop() {}\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.diagnostics[0]).toMatchObject({ file: "sketch.ino", line: 3, severity: "error" });
  });

  it("explains running out of RAM", async () => {
    const r = await compile("char big[3000];\nvoid setup(){ big[0]=1; }\nvoid loop(){ big[1]++; }\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r.diagnostics[0] as { message: string }).message).toMatch(/Not enough RAM/);
  });

  it("links the LiquidCrystal library", async () => {
    const r = await compile('#include <LiquidCrystal.h>\nLiquidCrystal lcd(12, 11, 5, 4, 3, 2);\nvoid setup(){ lcd.begin(16, 2); lcd.print("hi"); }\nvoid loop(){}\n');
    expect(r.ok).toBe(true);
  });

  it("links the Servo library", async () => {
    const r = await compile("#include <Servo.h>\nServo s;\nvoid setup(){ s.attach(9); }\nvoid loop(){ s.write(90); }\n");
    expect(r.ok).toBe(true);
  });
});
