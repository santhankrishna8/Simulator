// Compiles an Arduino sketch for the Uno with avr-gcc and the official Arduino core.
// Pure Node, no dependencies. Used by server.mjs and by the prebuild script.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const ROOT = process.env.ARDUINO_ROOT ?? "/opt/arduino";
export const FLASH_MAX = 32256; // Uno flash minus the bootloader
export const RAM_MAX = 2048;
const MAX_SOURCE = 60_000;
const TIMEOUT_MS = 25_000;

const LIBRARIES = {
  "Wire.h": "Wire",
  "SPI.h": "SPI",
  "EEPROM.h": "EEPROM",
  "SoftwareSerial.h": "SoftwareSerial",
  "Servo.h": "Servo",
  "LiquidCrystal.h": "LiquidCrystal",
};

const MCU = "atmega328p";
const COMMON = [
  `-mmcu=${MCU}`, "-DF_CPU=16000000L", "-DARDUINO=10819", "-DARDUINO_AVR_UNO", "-DARDUINO_ARCH_AVR",
  `-I${ROOT}/cores/arduino`, `-I${ROOT}/variants/standard`,
];
const CXXFLAGS = ["-c", "-Os", "-w", "-std=gnu++11", "-fpermissive", "-fno-exceptions", "-ffunction-sections", "-fdata-sections", "-fno-threadsafe-statics", ...COMMON];

/* ---------- source checks and preprocessing ---------- */

const INCLUDE_OK = /^#\s*include\s*<([A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*\.(?:h|hpp))>\s*(?:\/\/.*)?$/;

/** Reject anything that could pull files from the host into the output. */
export function checkSource(src) {
  if (typeof src !== "string" || !src.trim()) return { line: 1, message: "The sketch is empty." };
  if (src.length > MAX_SOURCE) return { line: 1, message: `The sketch is longer than ${MAX_SOURCE} characters.` };
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^#\s*include/.test(t) && !INCLUDE_OK.test(t)) {
      return { line: i + 1, message: 'Only library includes like #include <Servo.h> are supported here. Put all your code in this one file.' };
    }
    if (/incbin|\.include|include_next|#\s*import\b/.test(t)) {
      return { line: i + 1, message: "Embedding files is not allowed in the simulator." };
    }
  }
  return null;
}

/** Replace comments, strings and preprocessor lines with spaces, keeping every offset. */
function blank(src) {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  const wipe = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " "; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { let j = i; while (j < n && src[j] !== "\n") j++; wipe(i, j); i = j; }
    else if (c === "/" && d === "*") { let j = src.indexOf("*/", i + 2); j = j < 0 ? n : j + 2; wipe(i, j); i = j; }
    else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === "\\") j++; j++; }
      wipe(i + 1, Math.min(j, n)); i = j + 1;
    } else if (c === "#" && /^\s*$/.test(src.slice(src.lastIndexOf("\n", i - 1) + 1, i))) {
      let j = i;
      while (j < n && !(src[j] === "\n" && src[j - 1] !== "\\")) j++;
      wipe(i, j); i = j;
    } else i++;
  }
  return out.join("");
}

const NOT_FUNCTION = /^(?:if|for|while|switch|else|do|struct|class|enum|union|namespace|typedef|template|extern|return)\b/;

/**
 * Arduino lets you call a function before it is defined. Collect the signatures
 * of the sketch's top-level functions so they can be declared up front.
 */
export function findPrototypes(src) {
  const text = blank(src);
  const protos = [];
  let depth = 0, paren = 0, start = 0, firstFn = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") paren++;
    else if (c === ")") paren--;
    else if (c === "{" && paren === 0) {
      if (depth === 0) {
        const head = text.slice(start, i);
        const trimmed = head.trim();
        const m = /^([\s\S]*?\b([A-Za-z_]\w*)\s*)\(([\s\S]*)\)\s*(?:const\s*)?$/.exec(trimmed);
        if (m && !NOT_FUNCTION.test(trimmed) && !/[=]/.test(trimmed.slice(0, trimmed.indexOf("("))) && !/\boperator\b/.test(trimmed) && !m[3].includes("=") && /\s/.test(m[1].trim())) {
          const offset = start + head.indexOf(trimmed);
          if (firstFn < 0) firstFn = offset;
          protos.push(original(src, offset, trimmed.length) + ";");
        }
      }
      depth++;
      if (depth === 1) start = i + 1;
    } else if (c === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) start = i + 1;
    } else if (c === ";" && depth === 0 && paren === 0) start = i + 1;
  }
  return { protos, firstFn };
}
const original = (src, at, len) => src.slice(at, at + len);

export function prepare(src) {
  const { protos, firstFn } = findPrototypes(src);
  const head = '#include <Arduino.h>\n#line 1 "sketch.ino"\n';
  if (firstFn < 0 || !protos.length) return head + src;
  const line = src.slice(0, firstFn).split("\n").length;
  return head + src.slice(0, firstFn) + `\n${protos.join("\n")}\n#line ${line} "sketch.ino"\n` + src.slice(firstFn);
}

/* ---------- running tools ---------- */

function run(cmd, args, cwd, deadline) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: { PATH: process.env.PATH, LANG: "C", TMPDIR: cwd } });
    let out = "";
    const kill = setTimeout(() => p.kill("SIGKILL"), Math.max(1000, deadline - Date.now()));
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("error", (e) => { clearTimeout(kill); resolve({ code: -1, out: String(e) }); });
    p.on("close", (code) => { clearTimeout(kill); resolve({ code, out }); });
  });
}

export function parseDiagnostics(log, dir) {
  const diags = [];
  const clean = log.split(dir).join(".");
  for (const m of clean.matchAll(/^(?:\.\/)?([\w./-]+?):(\d+):(?:(\d+):)?\s*(fatal error|error|warning):\s*(.+)$/gm)) {
    const file = m[1];
    diags.push({
      file: file.endsWith("sketch.ino") ? "sketch.ino" : path.basename(file),
      line: Number(m[2]),
      column: m[3] ? Number(m[3]) : 1,
      severity: m[4] === "warning" ? "warning" : "error",
      message: m[5].trim(),
    });
  }
  return diags;
}

function sizes(out) {
  let text = 0, data = 0, bss = 0;
  for (const m of out.matchAll(/^\.(text|data|bss)\s+(\d+)/gm)) {
    if (m[1] === "text") text = Number(m[2]);
    if (m[1] === "data") data = Number(m[2]);
    if (m[1] === "bss") bss = Number(m[2]);
  }
  return { flash: text + data, ram: data + bss };
}

const cache = new Map();

/** @returns {Promise<{ok:true,hex:string,flash:number,ram:number,ms:number}|{ok:false,diagnostics:object[],log:string}>} */
export async function compile(source) {
  const bad = checkSource(source);
  if (bad) return { ok: false, diagnostics: [{ file: "sketch.ino", line: bad.line, column: 1, severity: "error", message: bad.message }], log: "" };

  const key = createHash("sha256").update(source).digest("hex");
  if (cache.has(key)) return { ...cache.get(key), cached: true };

  const t0 = Date.now();
  const deadline = t0 + TIMEOUT_MS;
  const dir = path.join(tmpdir(), `sketch-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(path.join(dir, "sketch.cpp"), prepare(source));
    const libs = [...new Set([...source.matchAll(/#\s*include\s*<([^>]+)>/g)].map((m) => LIBRARIES[m[1]]).filter(Boolean))];
    // Wire pulls in nothing else, but libraries may include one another.
    const incs = libs.flatMap((l) => {
      const base = existsSync(path.join(ROOT, "libraries", l, "src")) ? path.join(ROOT, "libraries", l, "src") : path.join(ROOT, "libraries", l);
      return [`-I${base}`, ...(existsSync(path.join(base, "utility")) ? [`-I${path.join(base, "utility")}`] : [])];
    });

    const cc = await run("avr-g++", [...CXXFLAGS, ...incs, "sketch.cpp", "-o", "sketch.o"], dir, deadline);
    if (cc.code !== 0) {
      const diagnostics = parseDiagnostics(cc.out, dir);
      return { ok: false, diagnostics: diagnostics.length ? diagnostics : [{ file: "sketch.ino", line: 1, column: 1, severity: "error", message: cc.out.split("\n")[0] || "Compiler failed." }], log: cc.out.split(dir).join(".").slice(0, 4000) };
    }

    const archives = [...libs.map((l) => path.join(ROOT, "build", `lib-${l}.a`)), path.join(ROOT, "build", "core.a")];
    const ld = await run("avr-gcc", ["-w", "-Os", "-Wl,--gc-sections", `-mmcu=${MCU}`, "-o", "sketch.elf", "sketch.o", ...archives, "-lm"], dir, deadline);
    if (ld.code !== 0) {
      const undefinedRef = /undefined reference to `([^']+)'/.exec(ld.out);
      if (/region `(data|text)' overflowed|not within region `(data|text)'/.test(ld.out)) {
        const ram = /region `data'/.test(ld.out);
        return { ok: false, diagnostics: [{ file: "sketch.ino", line: 1, column: 1, severity: "error", message: ram ? `Not enough RAM: the Uno has ${RAM_MAX} bytes for variables and the stack. Shrink large arrays or keep text in flash with F("...").` : `Sketch is too big for the Uno's ${FLASH_MAX} bytes of flash.` }], log: ld.out.slice(0, 4000) };
      }
      return { ok: false, diagnostics: [{ file: "sketch.ino", line: 1, column: 1, severity: "error", message: undefinedRef ? `Undefined reference to ${undefinedRef[1]}. Is it declared but never defined?` : "Linking failed." }], log: ld.out.slice(0, 4000) };
    }

    const sz = await run("avr-size", ["-A", "sketch.elf"], dir, deadline);
    const { flash, ram } = sizes(sz.out);
    if (flash > FLASH_MAX) {
      return { ok: false, diagnostics: [{ file: "sketch.ino", line: 1, column: 1, severity: "error", message: `Sketch uses ${flash} bytes of flash; the Uno has ${FLASH_MAX}.` }], log: "" };
    }
    const hx = await run("avr-objcopy", ["-O", "ihex", "-R", ".eeprom", "sketch.elf", "sketch.hex"], dir, deadline);
    if (hx.code !== 0) return { ok: false, diagnostics: [{ file: "sketch.ino", line: 1, column: 1, severity: "error", message: "Could not produce a hex file." }], log: hx.out };
    const hex = await readFile(path.join(dir, "sketch.hex"), "utf8");
    const result = { ok: true, hex, flash, ram, flashMax: FLASH_MAX, ramMax: RAM_MAX, ms: Date.now() - t0 };
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, result);
    return result;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
