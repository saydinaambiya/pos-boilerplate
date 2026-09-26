import "server-only";

import { eq } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { settings } from "@/db/schema";

import { type SettingKey, type SettingValue, settingDefinitions } from "./schemas";

/**
 * Settings are read on hot paths (every session check, every i18n request),
 * so each instance caches them briefly. Writes clear the local cache; other
 * serverless instances pick up changes within the TTL.
 */
const CACHE_TTL_MS = 30_000;

const cache = new Map<SettingKey, { value: unknown; expiresAt: number }>();

function parseStored<K extends SettingKey>(key: K, stored: unknown): SettingValue<K> {
  const { schema, defaults } = settingDefinitions[key];
  const merged =
    typeof stored === "object" && stored !== null ? { ...defaults, ...stored } : defaults;
  const result = schema.safeParse(merged);
  if (result.success) return result.data as SettingValue<K>;
  console.error(
    JSON.stringify({ level: "error", msg: "invalid stored setting, using defaults", key }),
  );
  return defaults as SettingValue<K>;
}

/** Current value of a settings key, falling back to its defaults (FR-SET-08). */
export async function readSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as SettingValue<K>;

  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  const value = parseStored(key, row?.value);
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Upserts an already-validated value; call inside the audited transaction. */
export async function writeSetting<K extends SettingKey>(
  executor: Executor,
  key: K,
  value: SettingValue<K>,
): Promise<void> {
  await executor
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
  cache.delete(key);
}

/** Drops cached values, e.g. between integration tests. */
export function clearSettingsCache(): void {
  cache.clear();
}
