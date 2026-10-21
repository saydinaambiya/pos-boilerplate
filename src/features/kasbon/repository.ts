import "server-only";

import { and, asc, desc, eq, ilike, isNotNull, isNull, ne, or, type SQL, sql } from "drizzle-orm";

import type { ShiftKind } from "@/features/shifts/kind";
import { openShiftScope } from "@/features/shifts/repository";
import { db, type Executor } from "@/db/client";
import {
  approvals,
  bankAccounts,
  customers,
  kasbons,
  payments,
  sales,
  shifts,
  users,
} from "@/db/schema";

import type { CustomerInput, KasbonFilter } from "./schemas";

/**
 * Finds the customer by phone or creates them; a repeat customer keeps one
 * row and their name and note follow the latest entry (FR-KSB-01). A
 * customer without a phone gets a row of their own (ADR-0047).
 */
export async function upsertCustomer(executor: Executor, input: CustomerInput): Promise<string> {
  const note = input.note === "" ? null : input.note;
  if (input.phone === null) {
    const [row] = await executor
      .insert(customers)
      .values({ name: input.name, phone: null, note })
      .returning({ id: customers.id });
    if (!row) throw new Error("Customer insert returned no row");
    return row.id;
  }
  const [row] = await executor
    .insert(customers)
    .values({ name: input.name, phone: input.phone, note })
    .onConflictDoUpdate({
      target: customers.phone,
      set: {
        name: input.name,
        note: sql`coalesce(${note}, ${customers.note})`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: customers.id });
  if (!row) throw new Error("Customer upsert returned no row");
  return row.id;
}

/**
 * Inserts a store credit: from a sale, or entered by hand with the date it
 * was given and who entered it (FR-KSB-08).
 */
export async function insertKasbon(
  executor: Executor,
  values: { customerId: string; total: number; dueDate: string | null } & (
    | { saleId: string }
    | {
        openedOn: string;
        reference: string | null;
        description: string | null;
        createdBy: string;
      }
  ),
): Promise<string> {
  const [row] = await executor
    .insert(kasbons)
    .values({ ...values, balance: values.total })
    .returning({ id: kasbons.id });
  if (!row) throw new Error("Kasbon insert returned no row");
  return row.id;
}

/**
 * Customers with a phone matching a name or phone fragment, for
 * re-selection at the POS (ADR-0047).
 */
export async function queryCustomers(term: string, limit: number) {
  const pattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const digits = term.replace(/\D/g, "").replace(/^0/, "");
  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      note: customers.note,
    })
    .from(customers)
    .where(
      and(
        isNotNull(customers.phone),
        or(
          ilike(customers.name, pattern),
          ...(digits.length >= 3 ? [ilike(customers.phone, `%${digits}%`)] : []),
        ),
      ),
    )
    .orderBy(asc(customers.name))
    .limit(limit);
}

/** Locks a store credit so payments are checked and applied one at a time (FR-KSB-05). */
export async function lockKasbon(executor: Executor, kasbonId: string) {
  const [row] = await executor
    .select({
      id: kasbons.id,
      total: kasbons.total,
      paidTotal: kasbons.paidTotal,
      balance: kasbons.balance,
      status: kasbons.status,
    })
    .from(kasbons)
    .where(eq(kasbons.id, kasbonId))
    .for("update");
  return row;
}

/**
 * Customer name and invoice number of a store credit, for approval
 * snapshots; one entered by hand shows its note number (FR-KSB-08).
 */
export async function findKasbonLabels(executor: Executor, kasbonId: string) {
  const [row] = await executor
    .select({
      customerName: customers.name,
      invoiceNo: sql<string>`coalesce(${sales.invoiceNo}, ${kasbons.reference}, '—')`,
    })
    .from(kasbons)
    .innerJoin(customers, eq(customers.id, kasbons.customerId))
    .leftJoin(sales, eq(sales.id, kasbons.saleId))
    .where(eq(kasbons.id, kasbonId))
    .limit(1);
  return row;
}

/** Sum of installments still waiting for a decision. */
export async function pendingPaymentTotal(executor: Executor, kasbonId: string): Promise<number> {
  const [row] = await executor
    .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
    .from(payments)
    .where(and(eq(payments.kasbonId, kasbonId), eq(payments.status, "PENDING")));
  return row?.total ?? 0;
}

export async function insertKasbonPayment(
  executor: Executor,
  values: {
    kasbonId: string;
    installmentId: string;
    shiftId: string | null;
    method: "CASH" | "TRANSFER";
    amount: number;
    bankAccountId: string | null;
    reference: string | null;
  },
): Promise<string> {
  const [row] = await executor
    .insert(payments)
    .values({ ...values, status: "PENDING" })
    .returning({ id: payments.id });
  if (!row) throw new Error("Payment insert returned no row");
  return row.id;
}

/** Locks every part (cash, transfer) of one installment. */
export async function lockInstallment(executor: Executor, installmentId: string) {
  return executor
    .select({
      id: payments.id,
      kasbonId: payments.kasbonId,
      amount: payments.amount,
      status: payments.status,
    })
    .from(payments)
    .where(eq(payments.installmentId, installmentId))
    .for("update");
}

export async function setInstallmentStatus(
  executor: Executor,
  installmentId: string,
  status: "SETTLED" | "FAILED",
): Promise<void> {
  await executor
    .update(payments)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(payments.installmentId, installmentId), eq(payments.status, "PENDING")));
}

export async function updateKasbonAmounts(
  executor: Executor,
  kasbonId: string,
  values: { paidTotal: number; balance: number; status: "PARTIALLY_PAID" | "SETTLED" },
): Promise<void> {
  await executor
    .update(kasbons)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(kasbons.id, kasbonId));
}

/** The caller's open shift and its kind, without locking it (ADR-0044). */
export async function findOpenShiftForPayment(executor: Executor, userId: string, kind: ShiftKind) {
  const scope = openShiftScope(userId, kind);
  const [row] = await executor
    .select({ id: shifts.id, kind: shifts.kind })
    .from(shifts)
    .where(scope.where)
    .orderBy(...scope.orderBy)
    .limit(1);
  return row;
}

/** The caller's open shift, share-locked so it cannot close mid-payment (FR-SHF-01). */
export async function lockOpenShiftForPayment(executor: Executor, userId: string, kind: ShiftKind) {
  const scope = openShiftScope(userId, kind);
  const [row] = await executor
    .select({ id: shifts.id, kind: shifts.kind })
    .from(shifts)
    .where(scope.where)
    .orderBy(...scope.orderBy)
    .limit(1)
    .for("share");
  return row;
}

export async function isActiveBankAccount(executor: Executor, id: string): Promise<boolean> {
  const [row] = await executor
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.isActive, true)))
    .limit(1);
  return row !== undefined;
}

/** Store date a credit was given: its own on one entered by hand (FR-KSB-08). */
const openedOnSql = (timeZone: string) =>
  sql`coalesce(${kasbons.openedOn}, (${kasbons.createdAt} at time zone ${timeZone})::date)`;

const listColumns = {
  id: kasbons.id,
  saleId: kasbons.saleId,
  /** The sale's invoice, or the old note number of one entered by hand (FR-KSB-08). */
  invoiceNo: sql<string | null>`coalesce(${sales.invoiceNo}, ${kasbons.reference})`,
  openedOn: kasbons.openedOn,
  description: kasbons.description,
  customerName: customers.name,
  customerPhone: customers.phone,
  total: kasbons.total,
  paidTotal: kasbons.paidTotal,
  balance: kasbons.balance,
  dueDate: kasbons.dueDate,
  status: kasbons.status,
  createdAt: kasbons.createdAt,
  pendingTotal: sql<number>`coalesce((
    select sum(${payments.amount}) from ${payments}
    where ${payments.kasbonId} = ${kasbons.id} and ${payments.status} = 'PENDING'
  ), 0)`.mapWith(Number),
};

/** Store credit list, oldest outstanding first (FR-KSB-06). */
export async function queryKasbons(
  filters: {
    filter: KasbonFilter;
    search: string;
    today: string;
    timeZone: string;
    includeArchived: boolean;
  },
  page: number,
  pageSize: number,
) {
  const conditions: SQL[] = [];
  if (!filters.includeArchived) conditions.push(isNull(kasbons.archivedAt));
  if (filters.filter === "open") conditions.push(ne(kasbons.status, "SETTLED"));
  if (filters.filter === "settled") conditions.push(eq(kasbons.status, "SETTLED"));
  if (filters.filter === "overdue") {
    conditions.push(ne(kasbons.status, "SETTLED"), sql`${kasbons.dueDate} < ${filters.today}`);
  }
  if (filters.search !== "") {
    const pattern = `%${filters.search.replace(/[\\%_]/g, "\\$&")}%`;
    const digits = filters.search.replace(/\D/g, "").replace(/^0/, "");
    const matches = [
      ilike(customers.name, pattern),
      ilike(sales.invoiceNo, pattern),
      ilike(kasbons.reference, pattern),
    ];
    if (digits.length >= 3) matches.push(ilike(customers.phone, `%${digits}%`));
    const search = or(...matches);
    if (search) conditions.push(search);
  }
  return db
    .select(listColumns)
    .from(kasbons)
    .innerJoin(customers, eq(customers.id, kasbons.customerId))
    .leftJoin(sales, eq(sales.id, kasbons.saleId))
    .where(and(...conditions))
    .orderBy(
      sql`${kasbons.status} = 'SETTLED'`,
      asc(openedOnSql(filters.timeZone)),
      asc(kasbons.createdAt),
    )
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
}

/**
 * Outstanding balance per age bucket in store days (FR-KSB-06, FR-DSH-01).
 * `today` is the store's calendar date.
 */
export async function outstandingByAge(timeZone: string, today: string) {
  const age = sql`(${today}::date - ${openedOnSql(timeZone)})`;
  const [row] = await db
    .select({
      current:
        sql<number>`coalesce(sum(${kasbons.balance}) filter (where ${age} <= 30), 0)`.mapWith(
          Number,
        ),
      days31to60:
        sql<number>`coalesce(sum(${kasbons.balance}) filter (where ${age} between 31 and 60), 0)`.mapWith(
          Number,
        ),
      over60: sql<number>`coalesce(sum(${kasbons.balance}) filter (where ${age} > 60), 0)`.mapWith(
        Number,
      ),
      count: sql<number>`count(*)`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where ${kasbons.dueDate} < ${today})`.mapWith(Number),
    })
    .from(kasbons)
    .where(ne(kasbons.status, "SETTLED"));
  return {
    current: row?.current ?? 0,
    days31to60: row?.days31to60 ?? 0,
    over60: row?.over60 ?? 0,
    count: row?.count ?? 0,
    overdue: row?.overdue ?? 0,
  };
}

/**
 * One store credit with its customer, sale and payment history
 * (FR-KSB-02..04). `cashierName` is who entered it on one entered by hand
 * (FR-KSB-08).
 */
export async function findKasbonDetail(kasbonId: string) {
  const [kasbon] = await db
    .select({
      ...listColumns,
      customerId: customers.id,
      customerNote: customers.note,
      cashierName: users.name,
    })
    .from(kasbons)
    .innerJoin(customers, eq(customers.id, kasbons.customerId))
    .leftJoin(sales, eq(sales.id, kasbons.saleId))
    .leftJoin(users, sql`${users.id} = coalesce(${sales.cashierId}, ${kasbons.createdBy})`)
    .where(eq(kasbons.id, kasbonId))
    .limit(1);
  if (!kasbon) return undefined;

  const history = await db
    .select({
      id: payments.id,
      installmentId: payments.installmentId,
      method: payments.method,
      amount: payments.amount,
      status: payments.status,
      reference: payments.reference,
      bankName: bankAccounts.bankName,
      createdAt: payments.createdAt,
      approvalId: approvals.id,
      approvalStatus: approvals.status,
      approvalVersion: approvals.version,
      approvalNote: approvals.note,
      requestedBy: approvals.requestedBy,
      requesterName: users.name,
    })
    .from(payments)
    .leftJoin(bankAccounts, eq(bankAccounts.id, payments.bankAccountId))
    .leftJoin(
      approvals,
      and(eq(approvals.targetId, payments.installmentId), eq(approvals.type, "KASBON_PAYMENT")),
    )
    .leftJoin(users, eq(users.id, approvals.requestedBy))
    .where(eq(payments.kasbonId, kasbonId))
    .orderBy(desc(payments.createdAt));
  return { ...kasbon, payments: history };
}

/** Store credit attached to a sale, for its invoice (FR-INV-04). */
export async function findKasbonForSale(saleId: string) {
  const [row] = await db
    .select({
      id: kasbons.id,
      total: kasbons.total,
      balance: kasbons.balance,
      dueDate: kasbons.dueDate,
      status: kasbons.status,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(kasbons)
    .innerJoin(customers, eq(customers.id, kasbons.customerId))
    .where(eq(kasbons.saleId, saleId))
    .limit(1);
  return row;
}
