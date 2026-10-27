import "server-only";

import type { Locale } from "@/config/locales";
import { db } from "@/db/client";
import { uniqueViolationConstraint } from "@/db/errors";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { dueState } from "@/lib/format/due";
import { storeDate } from "@/lib/format/zoned-time";
import type { RequestContext } from "@/lib/http/request-context";
import { readSetting } from "@/lib/settings/store";

import { purchasesCsv } from "./export";
import {
  findPurchaseDetail,
  findPurchasePayment,
  insertPurchase,
  insertPurchasePayment,
  lockPurchase,
  queryAllPurchases,
  queryPurchases,
  statusFor,
  summarizePurchases,
  sumPurchasePayments,
  updatePurchase as updatePurchaseRow,
  deletePurchase as deletePurchaseRow,
  deletePurchasePaymentRow,
  type PurchaseListFilter,
} from "./repository";
import type {
  PurchaseCreateInput,
  PurchaseFilter,
  PurchasePaymentInput,
  PurchaseUpdateInput,
} from "./schemas";

export const PURCHASE_PAGE_SIZE = 30;

const INVOICE_CONSTRAINT = "purchases_company_invoice_key";

export type PurchaseCreateResult =
  { ok: true; id: string } | { ok: false; reason: "duplicate-invoice" };

export type PurchaseUpdateResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not-found" | "duplicate-invoice" | "total-below-paid" | "due-required";
    };

export type PurchasePaymentResult =
  | { ok: true; status: "OPEN" | "PARTIALLY_PAID" | "SETTLED" }
  | {
      ok: false;
      reason: "not-found" | "settled" | "exceeds-balance" | "invalid-date";
      available?: number;
    };

export type PurchaseDeleteResult = { ok: true } | { ok: false; reason: "not-found" };

async function storeToday(now: Date): Promise<string> {
  const { timeZone } = await readSetting("operations");
  return storeDate(now, timeZone);
}

/**
 * Records a supplier bill (FR-PRB-01/02). A cash bill is settled for its
 * full total; a credit bill keeps what is left owed and needs a due date.
 * The amount paid at recording is stored as the first installment so the
 * history and the balance always agree (FR-PRB-03). The nota number is
 * unique per supplier typed the same way, catching double entry (FR-PRB-07).
 * Only `purchase:manage` holders (the Owner by default) may write.
 */
export async function createPurchase(
  session: Session,
  input: PurchaseCreateInput,
  context: RequestContext,
): Promise<PurchaseCreateResult> {
  assertPermission(session, "purchase:manage");
  const paidTotal = input.term === "CASH" ? input.total : input.paidNow;
  const balance = input.total - paidTotal;
  const status = statusFor(input.total, paidTotal);
  const dueDate = balance === 0 ? null : input.dueDate;
  try {
    return await db.transaction(async (tx) => {
      const id = await insertPurchase(tx, {
        companyName: input.companyName,
        invoiceNo: input.invoiceNo,
        total: input.total,
        paidTotal,
        balance,
        status,
        orderDate: input.orderDate,
        dueDate,
        note: input.note === "" ? null : input.note,
        createdBy: session.user.id,
      });
      if (paidTotal > 0) {
        await insertPurchasePayment(tx, {
          purchaseId: id,
          amount: paidTotal,
          paidOn: input.orderDate,
          method: input.method,
          note: null,
          createdBy: session.user.id,
        });
      }
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "purchase.recorded",
          entity: "purchase",
          entityId: id,
          diff: {
            companyName: input.companyName,
            invoiceNo: input.invoiceNo,
            total: input.total,
            paidTotal,
            balance,
            orderDate: input.orderDate,
            dueDate,
          },
        },
        context,
      );
      return { ok: true, id } as const;
    });
  } catch (error) {
    if (uniqueViolationConstraint(error) === INVOICE_CONSTRAINT) {
      return { ok: false, reason: "duplicate-invoice" };
    }
    throw error;
  }
}

/**
 * Edits a bill's header (FR-PRB-01). Its installments are kept, so the total
 * cannot drop below what is already paid, and a bill that still owes money
 * keeps a due date.
 */
export async function updatePurchase(
  session: Session,
  purchaseId: string,
  input: PurchaseUpdateInput,
  context: RequestContext,
): Promise<PurchaseUpdateResult> {
  assertPermission(session, "purchase:manage");
  try {
    return await db.transaction(async (tx) => {
      const purchase = await lockPurchase(tx, purchaseId);
      if (!purchase) return { ok: false, reason: "not-found" } as const;
      const paidTotal = await sumPurchasePayments(tx, purchaseId);
      if (input.total < paidTotal) return { ok: false, reason: "total-below-paid" } as const;
      const balance = input.total - paidTotal;
      if (balance > 0 && input.dueDate === null) {
        return { ok: false, reason: "due-required" } as const;
      }
      const status = statusFor(input.total, paidTotal);
      const dueDate = balance === 0 ? null : input.dueDate;
      await updatePurchaseRow(tx, purchaseId, {
        companyName: input.companyName,
        invoiceNo: input.invoiceNo,
        total: input.total,
        paidTotal,
        balance,
        status,
        orderDate: input.orderDate,
        dueDate,
        note: input.note === "" ? null : input.note,
      });
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "purchase.updated",
          entity: "purchase",
          entityId: purchaseId,
          diff: {
            companyName: input.companyName,
            invoiceNo: input.invoiceNo,
            total: input.total,
            orderDate: input.orderDate,
            dueDate,
          },
        },
        context,
      );
      return { ok: true } as const;
    });
  } catch (error) {
    if (uniqueViolationConstraint(error) === INVOICE_CONSTRAINT) {
      return { ok: false, reason: "duplicate-invoice" };
    }
    throw error;
  }
}

/** Removes a bill and its installments; the audit keeps what was there (FR-PRB-01/07). */
export async function deletePurchase(
  session: Session,
  purchaseId: string,
  context: RequestContext,
): Promise<PurchaseDeleteResult> {
  assertPermission(session, "purchase:manage");
  return db.transaction(async (tx) => {
    const purchase = await lockPurchase(tx, purchaseId);
    if (!purchase) return { ok: false, reason: "not-found" } as const;
    await deletePurchaseRow(tx, purchaseId);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "purchase.deleted",
        entity: "purchase",
        entityId: purchaseId,
        diff: {
          total: purchase.total,
          paidTotal: purchase.paidTotal,
          balance: purchase.balance,
          status: purchase.status,
        },
      },
      context,
    );
    return { ok: true } as const;
  });
}

/**
 * Records an installment or payoff of a bill (FR-PRB-03). It never exceeds
 * the remaining balance, is checked under a row lock so concurrent entries
 * cannot overshoot, and stays off the cash drawer, shifts and reports
 * (FR-PRB-06, ADR-0053). The date may be backdated but not be in the future
 * or before the bill's own date (FR-PRB-05).
 */
export async function recordPurchasePayment(
  session: Session,
  purchaseId: string,
  input: PurchasePaymentInput,
  context: RequestContext,
  now = new Date(),
): Promise<PurchasePaymentResult> {
  assertPermission(session, "purchase:manage");
  const today = await storeToday(now);
  return db.transaction(async (tx) => {
    const purchase = await lockPurchase(tx, purchaseId);
    if (!purchase) return { ok: false, reason: "not-found" } as const;
    if (purchase.status === "SETTLED") return { ok: false, reason: "settled" } as const;
    if (input.amount > purchase.balance) {
      return { ok: false, reason: "exceeds-balance", available: purchase.balance } as const;
    }
    if (input.paidOn > today || input.paidOn < purchase.orderDate) {
      return { ok: false, reason: "invalid-date" } as const;
    }
    await insertPurchasePayment(tx, {
      purchaseId,
      amount: input.amount,
      paidOn: input.paidOn,
      method: input.method,
      note: input.note === "" ? null : input.note,
      createdBy: session.user.id,
    });
    const paidTotal = purchase.paidTotal + input.amount;
    const balance = purchase.total - paidTotal;
    const status = statusFor(purchase.total, paidTotal);
    await updatePurchaseRow(tx, purchaseId, { paidTotal, balance, status });
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "purchase.payment-recorded",
        entity: "purchase",
        entityId: purchaseId,
        diff: { amount: input.amount, paidOn: input.paidOn, method: input.method, balance },
      },
      context,
    );
    return { ok: true, status } as const;
  });
}

/** Removes an installment and recalculates the bill (FR-PRB-03). */
export async function removePurchasePayment(
  session: Session,
  paymentId: string,
  context: RequestContext,
): Promise<PurchasePaymentResult> {
  assertPermission(session, "purchase:manage");
  return db.transaction(async (tx) => {
    const payment = await findPurchasePayment(tx, paymentId);
    if (!payment) return { ok: false, reason: "not-found" } as const;
    const purchase = await lockPurchase(tx, payment.purchaseId);
    if (!purchase) return { ok: false, reason: "not-found" } as const;
    await deletePurchasePaymentRow(tx, paymentId);
    const paidTotal = await sumPurchasePayments(tx, payment.purchaseId);
    const balance = purchase.total - paidTotal;
    const status = statusFor(purchase.total, paidTotal);
    await updatePurchaseRow(tx, payment.purchaseId, { paidTotal, balance, status });
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "purchase.payment-deleted",
        entity: "purchase",
        entityId: payment.purchaseId,
        diff: { paymentId, amount: payment.amount, balance },
      },
      context,
    );
    return { ok: true, status } as const;
  });
}

/** Supplier bill list with due markers and the summary (FR-PRB-04). */
export async function listPurchases(
  session: Session,
  options: {
    filter: PurchaseFilter;
    search: string;
    from?: string | undefined;
    to?: string | undefined;
    page: number;
    includeArchived?: boolean;
  },
  now = new Date(),
) {
  assertPermission(session, "page:purchases");
  const { timeZone } = await readSetting("operations");
  const today = storeDate(now, timeZone);
  const [from, to] =
    options.from && options.to && options.from > options.to
      ? [options.to, options.from]
      : [options.from, options.to];
  const filters: PurchaseListFilter = {
    filter: options.filter,
    search: options.search.trim(),
    from,
    to,
    today,
    includeArchived: options.includeArchived ?? false,
  };
  const [rows, summary] = await Promise.all([
    queryPurchases(filters, options.page, PURCHASE_PAGE_SIZE),
    summarizePurchases(filters),
  ]);
  return {
    purchases: rows.slice(0, PURCHASE_PAGE_SIZE).map((row) => ({
      ...row,
      due: dueState(row.dueDate, today, row.status === "SETTLED"),
    })),
    hasNextPage: rows.length > PURCHASE_PAGE_SIZE,
    summary,
  };
}

/**
 * Streams supplier bills matching a filter as CSV lines in the requested locale (FR-PRB-04).
 */
export async function exportPurchases(
  session: Session,
  options: {
    filter: PurchaseFilter;
    search: string;
    from?: string | undefined;
    to?: string | undefined;
    includeArchived?: boolean;
  },
  locale: Locale,
  now = new Date(),
) {
  assertPermission(session, "page:purchases");
  const { timeZone } = await readSetting("operations");
  const today = storeDate(now, timeZone);
  const [from, to] =
    options.from && options.to && options.from > options.to
      ? [options.to, options.from]
      : [options.from, options.to];
  const filters: PurchaseListFilter = {
    filter: options.filter,
    search: options.search.trim(),
    from,
    to,
    today,
    includeArchived: options.includeArchived ?? false,
  };
  const rows = await queryAllPurchases(filters);
  const lines = purchasesCsv(rows, locale);
  return { lines, range: { from, to, today } };
}

/** One supplier bill with its installments and due marker (FR-PRB-01/03). */
export async function getPurchase(session: Session, purchaseId: string, now = new Date()) {
  assertPermission(session, "page:purchases");
  const purchase = await findPurchaseDetail(purchaseId);
  if (!purchase) return undefined;
  const today = await storeToday(now);
  return {
    ...purchase,
    today,
    due: dueState(purchase.dueDate, today, purchase.status === "SETTLED"),
  };
}
