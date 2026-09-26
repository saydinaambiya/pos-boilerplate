import { beforeEach, describe, expect, it } from "vitest";

import { fixtures, resetDatabase } from "@/test/database";
import { signIn } from "@/test/sessions";

import { clearCapacityCache, getCapacity, getCapacityWarning } from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);

beforeEach(async () => {
  await resetDatabase();
  clearCapacityCache();
});

describe("database capacity (FR-CAP-01..04)", () => {
  it("reads the database size once per hour with the largest tables", async () => {
    const session = await owner();
    const first = await getCapacity(session);
    expect(first.usedBytes).toBeGreaterThan(0);
    expect(first.limitBytes).toBe(500 * 1024 * 1024);
    expect(first.tables.length).toBeGreaterThan(0);
    expect(first.tables.length).toBeLessThanOrEqual(8);
    expect(first.tables[0]?.bytes).toBeGreaterThanOrEqual(first.tables.at(-1)?.bytes ?? 0);
    expect((await getCapacity(session)).checkedAt).toBe(first.checkedAt);
  });

  it("warns only housekeeping users and only from 70 percent", async () => {
    expect(await getCapacityWarning(await owner())).toBeNull();
    const cashier = await signIn("kasir", "123456");
    expect(await getCapacityWarning(cashier)).toBeNull();
    await expect(getCapacity(cashier)).rejects.toThrow();
  });
});
