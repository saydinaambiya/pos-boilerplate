import "server-only";

import { asc, desc, eq } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { bankAccounts, marketplaces } from "@/db/schema";

import type { BankAccountInput, MarketplaceInput } from "./schemas";

export async function listBankAccounts() {
  return db
    .select()
    .from(bankAccounts)
    .orderBy(desc(bankAccounts.isActive), asc(bankAccounts.bankName));
}

export async function findBankAccount(id: string) {
  const [row] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, id)).limit(1);
  return row;
}

export async function insertBankAccount(executor: Executor, values: BankAccountInput) {
  const [row] = await executor
    .insert(bankAccounts)
    .values(values)
    .returning({ id: bankAccounts.id });
  if (!row) throw new Error("Bank account insert returned no row");
  return row.id;
}

export async function updateBankAccountRow(
  executor: Executor,
  id: string,
  values: Partial<BankAccountInput> & { isActive?: boolean },
): Promise<void> {
  await executor.update(bankAccounts).set(values).where(eq(bankAccounts.id, id));
}

export async function listMarketplaces() {
  return db
    .select()
    .from(marketplaces)
    .orderBy(desc(marketplaces.isActive), asc(marketplaces.name));
}

export async function findMarketplace(id: string) {
  const [row] = await db.select().from(marketplaces).where(eq(marketplaces.id, id)).limit(1);
  return row;
}

export async function insertMarketplace(executor: Executor, values: MarketplaceInput) {
  const [row] = await executor
    .insert(marketplaces)
    .values(values)
    .returning({ id: marketplaces.id });
  if (!row) throw new Error("Marketplace insert returned no row");
  return row.id;
}

export async function updateMarketplaceRow(
  executor: Executor,
  id: string,
  values: Partial<MarketplaceInput> & { isActive?: boolean },
): Promise<void> {
  await executor.update(marketplaces).set(values).where(eq(marketplaces.id, id));
}
