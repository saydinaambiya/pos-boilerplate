import "server-only";

import { z } from "zod";

/**
 * Server environment, validated once at startup (PRD NFR-SEC-08).
 * Add every new variable here and to `.env.example`; never read
 * `process.env` elsewhere.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  /** Enables diagnostics endpoints and the UI showcase; staging only. */
  ENABLE_DIAGNOSTICS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env = loadEnv();
