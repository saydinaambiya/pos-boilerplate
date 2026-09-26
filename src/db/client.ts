import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import { env } from "@/config/env";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema> & { $client: Sql };

/** A transaction handle; accepted wherever a query may join an outer transaction. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type Executor = Database | Transaction;

const globalForDb = globalThis as unknown as { posDb?: Database };

/**
 * Single pooled client per server instance (ADR-0005). `prepare: false`
 * keeps it compatible with PgBouncer-style poolers such as Neon's pooled
 * endpoint. The instance is cached on `globalThis` so dev reloads do not
 * leak connections.
 */
function createDatabase(): Database {
  const client = postgres(env.DATABASE_URL, { max: 5, prepare: false, idle_timeout: 20 });
  return drizzle({ client, schema, casing: "snake_case" });
}

export const db: Database = globalForDb.posDb ?? createDatabase();

if (env.NODE_ENV !== "production") globalForDb.posDb = db;
