/**
 * Seeds the E2E database with the owner and employee fixtures. Employees are
 * reset on every run, so lockouts and PIN changes from earlier runs vanish.
 */
import { db } from "@/db/client";
import { seed } from "@/db/seed";

import { accounts } from "./accounts";

await seed(db, {
  owner: accounts.owner,
  employees: [accounts.cashier, accounts.newCashier, accounts.lockedCashier, accounts.posCashier],
});
await db.$client.end();
