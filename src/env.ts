import { z } from "zod";

/**
 * Server-side environment, validated once. Missing optional values are fine:
 * the app falls back to the bundled example programs when no compile service is set.
 */
const schema = z.object({
  COMPILE_SERVICE_URL: z.url().optional(),
  COMPILE_SERVICE_TOKEN: z.string().min(16, "use a long random token").optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse({
      COMPILE_SERVICE_URL: process.env.COMPILE_SERVICE_URL || undefined,
      COMPILE_SERVICE_TOKEN: process.env.COMPILE_SERVICE_TOKEN || undefined,
    });
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}
