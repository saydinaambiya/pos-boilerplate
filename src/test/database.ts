import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { seed, type SeedOptions } from "@/db/seed";
import { clearSettingsCache } from "@/lib/settings/store";

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
    sql`TRUNCATE approvals, voucher_revisions, vouchers, idempotency_keys, payments, sale_items, sales, shifts, invoice_counters, audit_logs, sessions, users, role_permissions, roles, settings, bank_accounts, marketplaces, stock_movements, product_variants, products, categories RESTART IDENTITY CASCADE`,
  );
  clearSettingsCache();
  await seed(db, fixtures);
}
