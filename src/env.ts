import { z } from "zod";

/**
 * Server-side environment, validated once. Missing optional values are fine:
 * the app falls back to the bundled example programs when no compile service is set.
 */
const schema = z.object({
  COMPILE_SERVICE_URL: z.url().optional(),
  COMPILE_SERVICE_TOKEN: z.string().min(16, "use a long random token").optional(),
  /** Secret key for the AI tutor. Server-side only: never exposed to the browser. */
  OPENAI_API_KEY: z.string().min(20, "that does not look like an API key").optional(),
  /** Which model answers. Set it to any chat model your key can use. */
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  /** Override to use a proxy or compatible gateway. */
  OPENAI_BASE_URL: z.url().default("https://api.openai.com/v1"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse({
      COMPILE_SERVICE_URL: process.env.COMPILE_SERVICE_URL || undefined,
      COMPILE_SERVICE_TOKEN: process.env.COMPILE_SERVICE_TOKEN || undefined,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined,
      OPENAI_MODEL: process.env.OPENAI_MODEL || undefined,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || undefined,
    });
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}
