import "server-only";

import { db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { recordAudit } from "@/lib/audit/audit";
import { changedFields } from "@/lib/audit/diff";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import type { SettingKey, SettingValue } from "@/lib/settings/schemas";
import { readSetting, writeSetting } from "@/lib/settings/store";

import {
  findBankAccount,
  findMarketplace,
  insertBankAccount,
  insertMarketplace,
  listBankAccounts,
  listMarketplaces,
  updateBankAccountRow,
  updateMarketplaceRow,
} from "./repository";
import type { BankAccountInput, MarketplaceInput } from "./schemas";

export async function getSettings<K extends SettingKey>(session: Session, key: K) {
  assertPermission(session, "page:settings");
  return readSetting(key);
}

/** Saves one settings section and audits the changed fields (FR-SET-01/04/07, FR-AUD-02). */
export async function updateSettings<K extends SettingKey>(
  session: Session,
  key: K,
  value: SettingValue<K>,
  context: RequestContext,
): Promise<void> {
  assertPermission(session, "settings:manage");
  const before = await readSetting(key);
  await db.transaction(async (tx) => {
    await writeSetting(tx, key, value);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "settings.updated",
        entity: "settings",
        entityId: key,
        diff: changedFields(before, value),
      },
      context,
    );
  });
}

export type MasterDataResult =
  { ok: true; id: string } | { ok: false; reason: "not-found" | "name-taken" };

export async function getBankAccounts(session: Session) {
  assertPermission(session, "page:settings");
  return listBankAccounts();
}

export async function getBankAccount(session: Session, id: string) {
  assertPermission(session, "page:settings");
  return findBankAccount(id);
}

/** Adds a transfer destination (FR-SET-05). */
export async function createBankAccount(
  session: Session,
  input: BankAccountInput,
  context: RequestContext,
): Promise<MasterDataResult> {
  assertPermission(session, "settings:manage");
  const id = await db.transaction(async (tx) => {
    const created = await insertBankAccount(tx, input);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "bank-account.created",
        entity: "bank-account",
        entityId: created,
        diff: input,
      },
      context,
    );
    return created;
  });
  return { ok: true, id };
}

export async function updateBankAccount(
  session: Session,
  id: string,
  input: BankAccountInput,
  context: RequestContext,
): Promise<MasterDataResult> {
  assertPermission(session, "settings:manage");
  const current = await findBankAccount(id);
  if (!current) return { ok: false, reason: "not-found" };
  await db.transaction(async (tx) => {
    await updateBankAccountRow(tx, id, input);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "bank-account.updated",
        entity: "bank-account",
        entityId: id,
        diff: changedFields(current, input),
      },
      context,
    );
  });
  return { ok: true, id };
}

/** Inactive accounts stay for history but are not offered at checkout. */
export async function changeBankAccountStatus(
  session: Session,
  id: string,
  isActive: boolean,
  context: RequestContext,
): Promise<MasterDataResult> {
  assertPermission(session, "settings:manage");
  const current = await findBankAccount(id);
  if (!current) return { ok: false, reason: "not-found" };
  if (current.isActive === isActive) return { ok: true, id };
  await db.transaction(async (tx) => {
    await updateBankAccountRow(tx, id, { isActive });
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: isActive ? "bank-account.activated" : "bank-account.deactivated",
        entity: "bank-account",
        entityId: id,
      },
      context,
    );
  });
  return { ok: true, id };
}

export async function getMarketplaces(session: Session) {
  assertPermission(session, "page:settings");
  return listMarketplaces();
}

export async function getMarketplace(session: Session, id: string) {
  assertPermission(session, "page:settings");
  return findMarketplace(id);
}

/** Adds a marketplace (FR-SET-06). */
export async function createMarketplace(
  session: Session,
  input: MarketplaceInput,
  context: RequestContext,
): Promise<MasterDataResult> {
  assertPermission(session, "settings:manage");
  try {
    const id = await db.transaction(async (tx) => {
      const created = await insertMarketplace(tx, input);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "marketplace.created",
          entity: "marketplace",
          entityId: created,
          diff: input,
        },
        context,
      );
      return created;
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "name-taken" };
    throw error;
  }
}

export async function updateMarketplace(
  session: Session,
  id: string,
  input: MarketplaceInput,
  context: RequestContext,
): Promise<MasterDataResult> {
  assertPermission(session, "settings:manage");
  const current = await findMarketplace(id);
  if (!current) return { ok: false, reason: "not-found" };
  try {
    await db.transaction(async (tx) => {
      await updateMarketplaceRow(tx, id, input);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "marketplace.updated",
          entity: "marketplace",
          entityId: id,
          diff: changedFields(current, input),
        },
        context,
      );
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "name-taken" };
    throw error;
  }
}

export async function changeMarketplaceStatus(
  session: Session,
  id: string,
  isActive: boolean,
  context: RequestContext,
): Promise<MasterDataResult> {
  assertPermission(session, "settings:manage");
  const current = await findMarketplace(id);
  if (!current) return { ok: false, reason: "not-found" };
  if (current.isActive === isActive) return { ok: true, id };
  await db.transaction(async (tx) => {
    await updateMarketplaceRow(tx, id, { isActive });
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: isActive ? "marketplace.activated" : "marketplace.deactivated",
        entity: "marketplace",
        entityId: id,
      },
      context,
    );
  });
  return { ok: true, id };
}

/** Active transfer destinations offered at checkout (FR-PAY-04); needs only POS access. */
export async function getCheckoutBankAccounts(session: Session) {
  assertPermission(session, "page:pos");
  const accounts = await listBankAccounts();
  return accounts
    .filter((account) => account.isActive)
    .map((account) => ({
      id: account.id,
      label: `${account.bankName} · ${account.accountNo} · ${account.accountName}`,
    }));
}
