import "server-only";

import { and, desc, eq, ilike, isNull, ne, or, sql, type SQL } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { purchasePayments, purchases, users } from "@/db/schema";

import type { PurchaseFilter } from "./schemas";

/** Derived status of a bill from its amounts (FR-PRB-02). */
export function statusFor(total: number, paidTotal: number): "OPEN" | "PARTIALLY_PAID" | "SETTLED" {
  if (paidTotal >= total) return "SETTLED";
  return paidTotal > 0 ? "PARTIALLY_PAID" : "OPEN";
}

export async function insertPurchase(
  executor: Executor,
  values: {
    companyName: string;
    invoiceNo: string;
    total: number;
    paidTotal: number;
    balance: number;
    status: "OPEN" | "PARTIALLY_PAID" | "SETTLED";
    orderDate: string;
    dueDate: string | null;
    note: string | null;
    createdBy: string;
  },
): Promise<string> {
  const [row] = await executor.insert(purchases).values(values).returning({ id: purchases.id });
  if (!row) throw new Error("Purchase insert returned no row");
  return row.id;
}

/** Locks a bill so installments are checked and applied one at a time (FR-PRB-03). */
export async function lockPurchase(executor: Executor, purchaseId: string) {
  const [row] = await executor
    .select({
      id: purchases.id,
      total: purchases.total,
      paidTotal: purchases.paidTotal,
      balance: purchases.balance,
      status: purchases.status,
      orderDate: purchases.orderDate,
    })
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .for("update");
  return row;
}

export async function updatePurchase(
  executor: Executor,
  purchaseId: string,
  values: Partial<{
    companyName: string;
    invoiceNo: string;
    total: number;
    paidTotal: number;
    balance: number;
    status: "OPEN" | "PARTIALLY_PAID" | "SETTLED";
    orderDate: string;
    dueDate: string | null;
    note: string | null;
  }>,
): Promise<void> {
  await executor
    .update(purchases)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(purchases.id, purchaseId));
}

/** Removes a bill and, by cascade, its installments (FR-PRB-01). */
export async function deletePurchase(executor: Executor, purchaseId: string): Promise<void> {
  await executor.delete(purchases).where(eq(purchases.id, purchaseId));
}

export async function insertPurchasePayment(
  executor: Executor,
  values: {
    purchaseId: string;
    amount: number;
    paidOn: string;
    method: "CASH" | "TRANSFER";
    note: string | null;
    createdBy: string;
  },
): Promise<string> {
  const [row] = await executor
    .insert(purchasePayments)
    .values(values)
    .returning({ id: purchasePayments.id });
  if (!row) throw new Error("Purchase payment insert returned no row");
  return row.id;
}

export async function deletePurchasePaymentRow(
  executor: Executor,
  paymentId: string,
): Promise<void> {
  await executor.delete(purchasePayments).where(eq(purchasePayments.id, paymentId));
}

export async function findPurchasePayment(executor: Executor, paymentId: string) {
  const [row] = await executor
    .select({
      id: purchasePayments.id,
      purchaseId: purchasePayments.purchaseId,
      amount: purchasePayments.amount,
    })
    .from(purchasePayments)
    .where(eq(purchasePayments.id, paymentId))
    .limit(1);
  return row;
}

export async function sumPurchasePayments(executor: Executor, purchaseId: string): Promise<number> {
  const [row] = await executor
    .select({ total: sql<number>`coalesce(sum(${purchasePayments.amount}), 0)`.mapWith(Number) })
    .from(purchasePayments)
    .where(eq(purchasePayments.purchaseId, purchaseId));
  return row?.total ?? 0;
}

const listColumns = {
  id: purchases.id,
  companyName: purchases.companyName,
  invoiceNo: purchases.invoiceNo,
  total: purchases.total,
  paidTotal: purchases.paidTotal,
  balance: purchases.balance,
  status: purchases.status,
  orderDate: purchases.orderDate,
  dueDate: purchases.dueDate,
  note: purchases.note,
  createdAt: purchases.createdAt,
};

/** Supplier bill list, unsettled first and newest order date first (FR-PRB-04). */
export async function queryPurchases(
  filters: { filter: PurchaseFilter; search: string; today: string; includeArchived: boolean },
  page: number,
  pageSize: number,
) {
  const conditions: SQL[] = [];
  if (!filters.includeArchived) conditions.push(isNull(purchases.archivedAt));
  if (filters.filter === "credit") conditions.push(ne(purchases.status, "SETTLED"));
  if (filters.filter === "settled") conditions.push(eq(purchases.status, "SETTLED"));
  if (filters.filter === "overdue") {
    conditions.push(ne(purchases.status, "SETTLED"), sql`${purchases.dueDate} < ${filters.today}`);
  }
  if (filters.search !== "") {
    const pattern = `%${filters.search.replace(/[\\%_]/g, "\\$&")}%`;
    const search = or(ilike(purchases.companyName, pattern), ilike(purchases.invoiceNo, pattern));
    if (search) conditions.push(search);
  }
  return db
    .select(listColumns)
    .from(purchases)
    .where(and(...conditions))
    .orderBy(
      sql`${purchases.status} = 'SETTLED'`,
      desc(purchases.orderDate),
      desc(purchases.createdAt),
    )
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
}

/** Outstanding payable, its count and how many are past due (FR-PRB-04). */
export async function outstandingPurchases(today: string) {
  const [row] = await db
    .select({
      outstanding: sql<number>`coalesce(sum(${purchases.balance}), 0)`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where ${purchases.dueDate} < ${today})`.mapWith(Number),
    })
    .from(purchases)
    .where(ne(purchases.status, "SETTLED"));
  return {
    outstanding: row?.outstanding ?? 0,
    count: row?.count ?? 0,
    overdue: row?.overdue ?? 0,
  };
}

/** One bill with its supplier-typed header and every installment (FR-PRB-01/03). */
export async function findPurchaseDetail(purchaseId: string) {
  const [purchase] = await db
    .select({ ...listColumns, createdByName: users.name })
    .from(purchases)
    .leftJoin(users, eq(users.id, purchases.createdBy))
    .where(eq(purchases.id, purchaseId))
    .limit(1);
  if (!purchase) return undefined;

  const history = await db
    .select({
      id: purchasePayments.id,
      amount: purchasePayments.amount,
      paidOn: purchasePayments.paidOn,
      method: purchasePayments.method,
      note: purchasePayments.note,
      createdAt: purchasePayments.createdAt,
      createdByName: users.name,
    })
    .from(purchasePayments)
    .leftJoin(users, eq(users.id, purchasePayments.createdBy))
    .where(eq(purchasePayments.purchaseId, purchaseId))
    .orderBy(desc(purchasePayments.paidOn), desc(purchasePayments.createdAt));
  return { ...purchase, payments: history };
}
