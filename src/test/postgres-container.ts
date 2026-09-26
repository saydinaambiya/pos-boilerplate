import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/** Starts a throwaway Postgres, applies the real migrations and shares its URL with test files. */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  const url = container.getConnectionUri();
  const client = postgres(url, { max: 1, onnotice: () => undefined });
  await migrate(drizzle({ client }), { migrationsFolder: "./src/db/migrations" });
  await client.end();
  project.provide("databaseUrl", url);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
