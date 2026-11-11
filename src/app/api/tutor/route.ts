import { z } from "zod";
import { env } from "@/env";
import { benchMessage, SYSTEM_PROMPT } from "@/tutor/prompt";

export const maxDuration = 60;

const message = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) });

const body = z.object({
  question: z.string().trim().min(1).max(1500),
  /** The earlier turns of this conversation, oldest first. */
  history: z.array(message).max(10).default([]),
  /** Plain-text description of the bench, built in the browser. */
  bench: z.string().max(18_000).default(""),
});

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const fail = (status: number, kind: string, message: string) => json({ error: { kind, message } }, status);

/* ---------- a small per-visitor limit ---------- */
// Serverless instances do not share memory, so this only slows a single busy visitor; the
// real spending cap is the one you set on the key in the OpenAI dashboard.
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function limited(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return false;
}

/** Whether the tutor is set up, so the page can say so before anyone types a question. */
export async function GET() {
  try {
    return json({ configured: !!env().OPENAI_API_KEY });
  } catch {
    return json({ configured: false });
  }
}

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad-request", "Ask a question of up to 1,500 characters.");

  let cfg;
  try {
    cfg = env();
  } catch (e) {
    console.error(e);
    return fail(503, "unconfigured", "The tutor's settings are invalid.");
  }
  if (!cfg.OPENAI_API_KEY) return fail(503, "unconfigured", "The tutor is not switched on yet: no OpenAI key has been added.");

  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (limited(ip)) return fail(429, "busy", "That is a lot of questions in a short time. Try again in a few minutes.");

  const { question, history, bench } = parsed.data;
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(bench ? [{ role: "system", content: benchMessage(bench) }] : []),
    ...history,
    { role: "user", content: question },
  ];

  let upstream: Response;
  try {
    upstream = await fetch(`${cfg.OPENAI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: cfg.OPENAI_MODEL, messages, stream: true, max_tokens: 700, temperature: 0.4 }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]),
    });
  } catch {
    return fail(502, "unavailable", "Could not reach the tutor's service. Try again in a moment.");
  }
  if (!upstream.ok || !upstream.body) {
    // Never pass the provider's message on: it can mention the key.
    console.error("tutor upstream", upstream.status);
    if (upstream.status === 429) return fail(429, "busy", "The tutor is busy right now. Try again in a minute.");
    return fail(502, "unavailable", upstream.status === 401 ? "The tutor's key was refused. Whoever runs this site needs to check it." : "The tutor's service returned an error.");
  }

  // Turn the provider's server-sent events into plain text the page can append as it arrives.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const text = JSON.parse(data)?.choices?.[0]?.delta?.content;
            if (typeof text === "string" && text) controller.enqueue(encoder.encode(text));
          } catch {
            /* a partial or non-JSON line: skip it */
          }
        }
      } catch {
        controller.error(new Error("stream interrupted"));
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
