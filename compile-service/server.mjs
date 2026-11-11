// Tiny HTTP front for compile.mjs.
//   POST /compile   { "sketch": "..." }  ->  { ok, hex, flash, ram, ... } | { ok:false, diagnostics }
//   GET  /health
// Environment: PORT (8080), COMPILE_TOKEN (optional shared secret), ARDUINO_ROOT.
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { compile } from "./compile.mjs";

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN = process.env.COMPILE_TOKEN ?? "";
const MAX_BODY = 100_000;
const MAX_PARALLEL = 2;
const MAX_WAITING = 8;

let running = 0;
const waiting = [];
const slot = () =>
  new Promise((resolve) => {
    if (running < MAX_PARALLEL) { running++; resolve(true); }
    else if (waiting.length >= MAX_WAITING) resolve(false);
    else waiting.push(resolve);
  });
const release = () => {
  const next = waiting.shift();
  if (next) next(true);
  else running--;
};

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

const authorised = (req) => {
  if (!TOKEN) return true;
  const given = Buffer.from(String(req.headers.authorization ?? ""));
  const want = Buffer.from(`Bearer ${TOKEN}`);
  return given.length === want.length && timingSafeEqual(given, want);
};

createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
  if (req.method !== "POST" || req.url !== "/compile") return send(res, 404, { error: "not found" });
  if (!authorised(req)) return send(res, 401, { error: "unauthorised" });

  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) return send(res, 413, { error: "sketch too large" });
  }
  let sketch;
  try {
    sketch = JSON.parse(body).sketch;
  } catch {
    return send(res, 400, { error: "invalid JSON" });
  }
  if (typeof sketch !== "string") return send(res, 400, { error: "sketch must be a string" });

  if (!(await slot())) return send(res, 429, { error: "busy, try again in a moment" });
  try {
    send(res, 200, await compile(sketch));
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "compiler crashed" });
  } finally {
    release();
  }
}).listen(PORT, () => console.log(`compile service on :${PORT}`));
