import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { login } from "@/features/auth/service";
import { ForbiddenError } from "@/lib/auth/authorize";
import { validateSessionToken } from "@/lib/auth/session";
import { settingDefinitions } from "@/lib/settings/schemas";
import { readSetting } from "@/lib/settings/store";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import {
  changeBankAccountStatus,
  changeMarketplaceStatus,
  createBankAccount,
  createMarketplace,
  getBankAccounts,
  getSettings,
  updateBankAccount,
  updateMarketplace,
  updateSettings,
} from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);

async function lastAudit() {
  const [entry] = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
  return entry;
}

beforeEach(resetDatabase);

describe("settings sections (FR-SET-01/04/07)", () => {
  it("returns defaults until saved, then the saved value", async () => {
    const session = await owner();
    expect(await getSettings(session, "tax")).toEqual(settingDefinitions.tax.defaults);

    const tax = { ...settingDefinitions.tax.defaults, ppnEnabled: true, ppnRateBps: 1100 };
    await updateSettings(session, "tax", tax, testContext());
    expect(await getSettings(session, "tax")).toEqual(tax);
  });

  it("audits only the fields that changed", async () => {
    const session = await owner();
    await updateSettings(
      session,
      "store.profile",
      { ...settingDefinitions["store.profile"].defaults, phone: "+6281234567890" },
      testContext(),
    );
    expect(await lastAudit()).toMatchObject({
      action: "settings.updated",
      entityId: "store.profile",
      diff: { phone: { from: "", to: "+6281234567890" } },
    });
  });

  it("applies the session idle limit to new and refreshed sessions (FR-AUTH-05)", async () => {
    const session = await owner();
    await updateSettings(
      session,
      "operations",
      { ...settingDefinitions.operations.defaults, sessionIdleMinutes: 30 },
      testContext(),
    );
    const before = Date.now();
    const result = await login({ username: "kasir", secret: "123456" }, testContext());
    if (!result.ok) throw new Error("login failed");
    const minutes = (result.expiresAt.getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30.1);
    expect(await validateSessionToken(result.token, new Date(before + 31 * 60_000))).toBeNull();
  });

  it("lets employees read but not change settings when only page access is granted", async () => {
    const cashier = await signIn("kasir", "123456");
    await expect(getSettings(cashier, "tax")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateSettings(cashier, "tax", settingDefinitions.tax.defaults, testContext()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("falls back to defaults for keys never saved", async () => {
    expect((await readSetting("operations")).timeZone).toBe("Asia/Jakarta");
  });
});

describe("bank accounts (FR-SET-05)", () => {
  it("creates, updates and deactivates with audit entries", async () => {
    const session = await owner();
    const created = await createBankAccount(
      session,
      { bankName: "BCA", accountNo: "1234567890", accountName: "Toko Contoh" },
      testContext(),
    );
    if (!created.ok) throw new Error(created.reason);

    await updateBankAccount(
      session,
      created.id,
      { bankName: "BCA", accountNo: "1234567890", accountName: "PT Toko Contoh" },
      testContext(),
    );
    expect((await lastAudit())?.diff).toEqual({
      accountName: { from: "Toko Contoh", to: "PT Toko Contoh" },
    });

    await changeBankAccountStatus(session, created.id, false, testContext());
    expect((await getBankAccounts(session))[0]).toMatchObject({ isActive: false });
    expect((await lastAudit())?.action).toBe("bank-account.deactivated");
  });
});

describe("marketplaces (FR-SET-06)", () => {
  it("rejects duplicate names case-insensitively", async () => {
    const session = await owner();
    const shopee = await createMarketplace(session, { name: "Shopee" }, testContext());
    const tokped = await createMarketplace(session, { name: "Tokopedia" }, testContext());
    if (!shopee.ok || !tokped.ok) throw new Error("create failed");

    expect(await createMarketplace(session, { name: "shopee" }, testContext())).toEqual({
      ok: false,
      reason: "name-taken",
    });
    expect(await updateMarketplace(session, tokped.id, { name: "SHOPEE" }, testContext())).toEqual({
      ok: false,
      reason: "name-taken",
    });
    expect(await changeMarketplaceStatus(session, shopee.id, false, testContext())).toEqual({
      ok: true,
      id: shopee.id,
    });
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "marketplace.deactivated"));
    expect(audit?.entityId).toBe(shopee.id);
  });
});
