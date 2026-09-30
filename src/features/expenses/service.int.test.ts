import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE, type Permission } from "@/config/permissions";
import { db } from "@/db/client";
import { rolePermissions, roles } from "@/db/schema";
import { updateSettings } from "@/features/settings/service";
import { closeShift, getOpenShift, openShift } from "@/features/shifts/service";
import { ForbiddenError } from "@/lib/auth/authorize";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import { expenseInput } from "./schemas";
import { getExpensesOfDay, recordExpense } from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const cashier = () => signIn("kasir", "123456");

async function grant(...permissions: Permission[]) {
  const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
  await db
    .insert(rolePermissions)
    .values(permissions.map((permission) => ({ roleId: role?.id ?? "", permission })));
}

beforeEach(resetDatabase);

describe("daily staff expenses (FR-EXP-01..03, ADR-0027)", () => {
  it("pays out of the open shift's drawer and lowers the expected cash", async () => {
    await grant("expense:record", "page:expenses");
    const session = await cashier();
    const colleague = await owner();
    const meal = {
      category: "MEAL" as const,
      recipientId: colleague.user.id,
      amount: 20_000,
      note: "",
    };
    expect(await recordExpense(session, meal, testContext())).toEqual({
      ok: false,
      reason: "no-open-shift",
    });

    await openShift(session, { openingCash: 100_000 }, testContext());
    expect((await recordExpense(session, meal, testContext())).ok).toBe(true);
    expect(
      (
        await recordExpense(
          session,
          { category: "FUEL", recipientId: session.user.id, amount: 15_000, note: "Antar barang" },
          testContext(),
        )
      ).ok,
    ).toBe(true);

    expect((await getOpenShift(session))?.expectedCash).toBe(65_000);
    const closed = await closeShift(session, { countedCash: 65_000, note: "" }, testContext());
    expect(closed.ok).toBe(true);

    const today = await getExpensesOfDay(session);
    expect(today.total).toBe(35_000);
    expect(today.rows.map((row) => [row.category, row.recipientName, row.actorName])).toEqual([
      ["FUEL", "Kasir", "Kasir"],
      ["MEAL", "Owner", "Kasir"],
    ]);
  });

  it("requires a recipient except for donations and other, and a note for other", () => {
    const base = { recipientId: null, amount: 5000, note: "" };
    expect(expenseInput.safeParse({ ...base, category: "MEAL" }).success).toBe(false);
    expect(expenseInput.safeParse({ ...base, category: "DONATION" }).success).toBe(true);
    expect(expenseInput.safeParse({ ...base, category: "OTHER" }).success).toBe(false);
    expect(expenseInput.safeParse({ ...base, category: "OTHER", note: "Parkir" }).success).toBe(
      true,
    );
    expect(expenseInput.safeParse({ ...base, category: "DONATION", amount: 0 }).success).toBe(
      false,
    );
  });

  it("refuses employees outside store hours, but not the Owner (FR-SET-09, ADR-0036)", async () => {
    await grant("expense:record");
    const session = await cashier();
    await openShift(session, { openingCash: 50_000 }, testContext());
    const day = { closed: false, open: "08:00", close: "21:00" };
    await updateSettings(
      await owner(),
      "store.hours",
      { enabled: true, days: [day, day, day, day, day, { ...day, closed: true }, day] },
      testContext(),
    );
    const saturday = new Date("2026-09-26T03:00:00Z");
    const donation = { category: "DONATION" as const, recipientId: null, amount: 1000, note: "" };

    expect(await recordExpense(session, donation, testContext(), saturday)).toEqual({
      ok: false,
      reason: "store-closed",
    });
    expect((await getOpenShift(session))?.expectedCash).toBe(50_000);

    const ownerSession = await owner();
    await openShift(ownerSession, { openingCash: 0 }, testContext(), saturday);
    expect((await recordExpense(ownerSession, donation, testContext(), saturday)).ok).toBe(true);
  });

  it("needs expense:record to record", async () => {
    const session = await cashier();
    await openShift(session, { openingCash: 0 }, testContext());
    await expect(
      recordExpense(
        session,
        { category: "DONATION", recipientId: null, amount: 1000, note: "" },
        testContext(),
      ),
    ).rejects.toThrow(ForbiddenError);
  });
});
