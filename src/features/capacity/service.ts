import "server-only";

import { sql } from "drizzle-orm";

import { env } from "@/config/env";
import { db } from "@/db/client";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";

import { type CapacityLevel, capacityLevel, usedPercent } from "./levels";

const CACHE_TTL_MS = 60 * 60 * 1000;
const MB = 1024 * 1024;

export interface CapacitySnapshot {
  usedBytes: number;
  limitBytes: number;
  percent: number;
  level: CapacityLevel;
  checkedAt: Date;
  tables: { name: string; bytes: number }[];
}

let cached: { value: CapacitySnapshot; expiresAt: number } | null = null;

async function measure(): Promise<CapacitySnapshot> {
  const [size] = await db.execute<{ bytes: string }>(
    sql`select pg_database_size(current_database())::text as bytes`,
  );
  const tables = await db.execute<{ name: string; bytes: string }>(sql`
    select c.relname as name, pg_total_relation_size(c.oid)::text as bytes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by pg_total_relation_size(c.oid) desc
    limit 8
  `);
  const usedBytes = Number(size?.bytes ?? 0);
  const limitBytes = env.DB_STORAGE_LIMIT_MB * MB;
  const percent = usedPercent(usedBytes, limitBytes);
  return {
    usedBytes,
    limitBytes,
    percent,
    level: capacityLevel(percent),
    checkedAt: new Date(),
    tables: [...tables].map((row) => ({ name: row.name, bytes: Number(row.bytes) })),
  };
}

/**
 * Database size against the configured quota, read with
 * `pg_database_size()` at most once an hour per server instance
 * (FR-CAP-01/02), with the largest tables as housekeeping hints (FR-CAP-04).
 */
async function snapshot(now = Date.now()): Promise<CapacitySnapshot> {
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await measure();
  cached = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/** Capacity for the dashboard and housekeeping widget; housekeeping access only. */
export async function getCapacity(session: Session) {
  assertPermission(session, "page:housekeeping");
  return snapshot();
}

/**
 * Banner data for every page (FR-CAP-03): only for viewers who can act on
 * it (housekeeping access) and only from 70 % up.
 */
export async function getCapacityWarning(session: Session) {
  if (!session.permissions.has("page:housekeeping")) return null;
  const value = await snapshot();
  return value.level === "ok" ? null : { level: value.level, percent: value.percent };
}

/** Drops the cached size, e.g. between integration tests. */
export function clearCapacityCache(): void {
  cached = null;
}
