import "server-only";

import { env } from "@/config/env";

/** Fixed-window failure counter (PRD FR-AUTH-04, BRD R-03). */
export interface FailureCounter {
  /** Current count and seconds until the window resets. */
  get(key: string): Promise<{ count: number; resetSeconds: number }>;
  /** Adds one failure; the window starts at the first failure. */
  increment(key: string, windowSeconds: number): Promise<void>;
}

/**
 * Per-instance counter for local development and tests. Serverless
 * instances do not share memory, so production uses Upstash.
 */
export function createMemoryCounter(now: () => number = Date.now): FailureCounter {
  const entries = new Map<string, { count: number; resetAt: number }>();
  const live = (key: string) => {
    const entry = entries.get(key);
    if (entry && entry.resetAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    get(key) {
      const entry = live(key);
      return Promise.resolve(
        entry
          ? { count: entry.count, resetSeconds: Math.ceil((entry.resetAt - now()) / 1000) }
          : { count: 0, resetSeconds: 0 },
      );
    },
    increment(key, windowSeconds) {
      const entry = live(key);
      if (entry) entry.count += 1;
      else entries.set(key, { count: 1, resetAt: now() + windowSeconds * 1000 });
      return Promise.resolve();
    },
  };
}

/** Upstash Redis over its REST pipeline API; no client library needed. */
export function createUpstashCounter(url: string, token: string): FailureCounter {
  const pipeline = async (commands: (string | number)[][]): Promise<unknown[]> => {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Upstash responded ${response.status}`);
    const results = (await response.json()) as { result?: unknown; error?: string }[];
    return results.map((entry) => {
      if (entry.error) throw new Error(`Upstash error: ${entry.error}`);
      return entry.result;
    });
  };
  return {
    async get(key) {
      const [count, ttl] = await pipeline([
        ["GET", key],
        ["TTL", key],
      ]);
      return { count: Number(count ?? 0), resetSeconds: Math.max(Number(ttl ?? 0), 0) };
    },
    async increment(key, windowSeconds) {
      await pipeline([
        ["INCR", key],
        ["EXPIRE", key, windowSeconds, "NX"],
      ]);
    },
  };
}

const globalForLimiter = globalThis as unknown as { posFailureCounter?: FailureCounter };

export const failureCounter: FailureCounter =
  globalForLimiter.posFailureCounter ??
  (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? createUpstashCounter(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN)
    : createMemoryCounter());

globalForLimiter.posFailureCounter = failureCounter;
