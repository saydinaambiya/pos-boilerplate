import "server-only";

import { z } from "zod";

/**
 * Server environment, validated once at startup (PRD NFR-SEC-08).
 * Add every new variable here and to `.env.example`; never read
 * `process.env` elsewhere.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    /** Postgres connection string; use the pooled endpoint on Neon (ADR-0005, NFR-PERF-06). */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Enables diagnostics endpoints and the UI showcase; staging only. */
    ENABLE_DIAGNOSTICS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    /**
     * Signs public invoice download links (FR-PDF-04). Rotating it revokes
     * every link already shared (FR-PDF-06).
     */
    INVOICE_LINK_SECRET: z.string().min(32),
    /** Upstash Redis REST credentials for the per-IP login limit (FR-AUTH-04). */
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      (value.UPSTASH_REDIS_REST_URL === undefined) ===
      (value.UPSTASH_REDIS_REST_TOKEN === undefined),
    { message: "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together." },
  );

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env = loadEnv();
