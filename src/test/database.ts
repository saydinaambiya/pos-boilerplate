import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { seed, type SeedOptions } from "@/db/seed";

export const fixtures = {
  owner: { username: "owner", name: "Owner", password: "correct-horse-battery" },
  employees: [
    { username: "kasir", name: "Kasir", pin: "123456", mustChangePin: false },
    { username: "kasir-baru", name: "Kasir Baru", pin: "111111", mustChangePin: true },
  ],
} satisfies SeedOptions;

/** Empties every table and re-seeds the fixtures; call in `beforeEach`. */
export async function resetDatabase(): Promise<void> {
  await db.execute(
    sql`TRUNCATE audit_logs, sessions, users, role_permissions, roles RESTART IDENTITY CASCADE`,
  );
  await seed(db, fixtures);
}
