import { sql } from "drizzle-orm";

import { db } from "@/db/client";

import pkg from "../../../../package.json" with { type: "json" };

const DB_TIMEOUT_MS = 3_000;

async function databaseReachable(): Promise<boolean> {
  const timeout = new Promise<false>((resolve) =>
    setTimeout(() => {
      resolve(false);
    }, DB_TIMEOUT_MS),
  );
  const probe = db.execute(sql`select 1`).then(
    () => true,
    () => false,
  );
  return Promise.race([probe, timeout]);
}

/** Liveness and database connectivity (PRD NFR-REL-03); 503 when the database is unreachable. */
export async function GET(): Promise<Response> {
  const database = (await databaseReachable()) ? "ok" : "unreachable";
  return Response.json(
    {
      status: database === "ok" ? "ok" : "degraded",
      database,
      version: pkg.version,
      time: new Date().toISOString(),
    },
    { status: database === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
