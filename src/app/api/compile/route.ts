import { z } from "zod";
import { env } from "@/env";

export const maxDuration = 30;

const body = z.object({ sketch: z.string().min(1).max(60_000) });

const diagnostic = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number(),
  severity: z.enum(["error", "warning"]),
  message: z.string(),
});

const upstream = z.union([
  z.object({ ok: z.literal(true), hex: z.string(), flash: z.number(), ram: z.number(), flashMax: z.number(), ramMax: z.number() }),
  z.object({ ok: z.literal(false), diagnostics: z.array(diagnostic) }),
]);

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, kind: "bad-request", message: "Send a sketch of up to 60,000 characters." }, 400);

  let cfg;
  try {
    cfg = env();
  } catch (e) {
    console.error(e);
    return json({ ok: false, kind: "unconfigured", message: "The compile service settings are invalid." }, 503);
  }
  if (!cfg.COMPILE_SERVICE_URL) {
    return json({ ok: false, kind: "unconfigured", message: "No compile service is connected, so only the built-in examples can run." }, 503);
  }

  try {
    const res = await fetch(new URL("/compile", cfg.COMPILE_SERVICE_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cfg.COMPILE_SERVICE_TOKEN ? { authorization: `Bearer ${cfg.COMPILE_SERVICE_TOKEN}` } : {}),
      },
      body: JSON.stringify({ sketch: parsed.data.sketch }),
      signal: AbortSignal.timeout(28_000),
      cache: "no-store",
    });
    if (res.status === 429) return json({ ok: false, kind: "busy", message: "The compiler is busy. Try again in a moment." }, 429);
    if (!res.ok) return json({ ok: false, kind: "unavailable", message: "The compile service returned an error." }, 502);
    const result = upstream.safeParse(await res.json());
    if (!result.success) return json({ ok: false, kind: "unavailable", message: "The compile service sent an unexpected reply." }, 502);
    return json(result.data);
  } catch {
    return json({ ok: false, kind: "unavailable", message: "Could not reach the compile service." }, 502);
  }
}
