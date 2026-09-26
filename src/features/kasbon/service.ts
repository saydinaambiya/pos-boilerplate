import "server-only";

import { db, type Executor } from "@/db/client";
import {
  type ApplyApproval,
  ApprovalConflict,
  type SettleApproval,
  submitApproval,
} from "@/features/approvals/engine";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import { readSetting } from "@/lib/settings/store";

import { agingBucket, daysBetween, dueState, storeDate } from "./aging";
import {
  findKasbonDetail,
  findKasbonForSale,
  findKasbonLabels,
  insertKasbon,
  insertKasbonPayment,
  isActiveBankAccount,
  lockKasbon,
  lockOpenShiftForPayment,
  lockPayment,
  outstandingByAge,
  pendingPaymentTotal,
  queryCustomers,
  queryKasbons,
  setPaymentStatus,
  updateKasbonAmounts,
  upsertCustomer,
} from "./repository";
import {
  type KasbonCheckoutInput,
  type KasbonFilter,
  type KasbonPaymentInput,
  kasbonPaymentPayload,
} from "./schemas";

export const KASBON_PAGE_SIZE = 30;

export type KasbonPaymentResult =
  | { ok: true; status: "PENDING" | "APPROVED" }
  | {
      ok: false;
      reason:
        "not-found" | "settled" | "exceeds-balance" | "no-open-shift" | "invalid-bank-account";
      available?: number;
    };

/** The customer for a new store credit, re-used by phone (FR-KSB-01). */
export async function resolveKasbonCustomer(
  tx: Executor,
  input: KasbonCheckoutInput,
): Promise<string> {
  return upsertCustomer(tx, input.customer);
}

/**
 * Opens a store credit for a sale's unpaid remainder inside the checkout
 * transaction (FR-PAY-05, FR-KSB-02).
 */
export async function openKasbon(
  tx: Executor,
  actorId: string,
  sale: { id: string; invoiceNo: string; customerId: string },
  input: KasbonCheckoutInput,
  total: number,
  context: RequestContext,
): Promise<string> {
  const kasbonId = await insertKasbon(tx, {
    saleId: sale.id,
    customerId: sale.customerId,
    total,
    dueDate: input.dueDate,
  });
  await recordAudit(
    tx,
    {
      actorId,
      action: "kasbon.opened",
      entity: "kasbon",
      entityId: kasbonId,
      diff: { invoiceNo: sale.invoiceNo, total, dueDate: input.dueDate },
    },
    context,
  );
  return kasbonId;
}

/** Store-local today, for due-date checks (FR-UI-11). */
export async function storeToday(now = new Date()): Promise<string> {
  const { timeZone } = await readSetting("operations");
  return storeDate(now, timeZone);
}

/**
 * Records an installment or payoff; it only reduces the balance once
 * approved (FR-KSB-03, BR-12), immediately for the Owner (BR-13). The
 * amount may not exceed the balance minus other pending payments, checked
 * under a row lock so concurrent requests cannot overshoot (FR-KSB-05).
 * Cash goes into the recorder's drawer, so it needs their open shift.
 */
export async function recordKasbonPayment(
  session: Session,
  kasbonId: string,
  input: KasbonPaymentInput,
  context: RequestContext,
): Promise<KasbonPaymentResult> {
  assertPermission(session, "kasbon:pay");
  try {
    return await db.transaction(async (tx) => {
      const kasbon = await lockKasbon(tx, kasbonId);
      if (!kasbon) return { ok: false, reason: "not-found" } as const;
      if (kasbon.status === "SETTLED") return { ok: false, reason: "settled" } as const;

      const available = kasbon.balance - (await pendingPaymentTotal(tx, kasbon.id));
      if (input.amount > available) {
        return { ok: false, reason: "exceeds-balance", available: Math.max(available, 0) } as const;
      }
      const shift = await lockOpenShiftForPayment(tx, session.user.id);
      if (input.method === "CASH" && !shift) return { ok: false, reason: "no-open-shift" } as const;
      if (input.method === "TRANSFER" && !(await isActiveBankAccount(tx, input.bankAccountId))) {
        return { ok: false, reason: "invalid-bank-account" } as const;
      }

      const paymentId = await insertKasbonPayment(tx, {
        kasbonId: kasbon.id,
        shiftId: shift?.id ?? null,
        method: input.method,
        amount: input.amount,
        bankAccountId: input.method === "TRANSFER" ? input.bankAccountId : null,
        reference: input.method === "TRANSFER" && input.reference !== "" ? input.reference : null,
      });
      const labels = await findKasbonLabels(tx, kasbon.id);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "kasbon.payment-recorded",
          entity: "kasbon",
          entityId: kasbon.id,
          diff: { paymentId, method: input.method, amount: input.amount },
        },
        context,
      );
      const submitted = await submitApproval(
        tx,
        session,
        {
          type: "KASBON_PAYMENT",
          targetType: "payment",
          targetId: paymentId,
          payload: {
            kasbonId: kasbon.id,
            amount: input.amount,
            method: input.method,
            customerName: labels?.customerName ?? "",
            invoiceNo: labels?.invoiceNo ?? "",
            balance: kasbon.balance,
          },
        },
        context,
        applyKasbonPayment,
      );
      return { ok: true, status: submitted.status } as const;
    });
  } catch (error) {
    if (error instanceof ApprovalConflict) return { ok: false, reason: "exceeds-balance" };
    throw error;
  }
}

/**
 * Applies an approved payment: the balance drops and reaching zero settles
 * the credit (FR-KSB-04). Raises `ApprovalConflict` when the payment is no
 * longer pending or would overshoot the balance.
 */
export const applyKasbonPayment: ApplyApproval = async (tx, approval, actor, context) => {
  const payload = kasbonPaymentPayload.parse(approval.payload);
  const kasbon = await lockKasbon(tx, payload.kasbonId);
  const payment = await lockPayment(tx, approval.targetId);
  if (!kasbon || payment?.kasbonId !== kasbon.id || payment.status !== "PENDING") {
    throw new ApprovalConflict("not-pending");
  }
  if (payment.amount > kasbon.balance) throw new ApprovalConflict("exceeds-balance");

  const paidTotal = kasbon.paidTotal + payment.amount;
  const balance = kasbon.total - paidTotal;
  const status = balance === 0 ? "SETTLED" : "PARTIALLY_PAID";
  await setPaymentStatus(tx, payment.id, "SETTLED");
  await updateKasbonAmounts(tx, kasbon.id, { paidTotal, balance, status });
  await recordAudit(
    tx,
    {
      actorId: actor.id,
      action: "kasbon.payment-approved",
      entity: "kasbon",
      entityId: kasbon.id,
      diff: { paymentId: payment.id, amount: payment.amount, balance, status },
    },
    context,
  );
};

/** A rejected or withdrawn payment never counts; cash taken is handed back (FR-KSB-04). */
export const settleKasbonPayment: SettleApproval = async (tx, approval) => {
  const payment = await lockPayment(tx, approval.targetId);
  if (payment?.status === "PENDING") await setPaymentStatus(tx, payment.id, "FAILED");
};

/** Customers for re-selection at checkout (FR-KSB-01). */
export async function searchCustomers(session: Session, term: string) {
  assertPermission(session, "kasbon:create");
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];
  return queryCustomers(trimmed.slice(0, 40), 8);
}

/** Store credit list with aging and due markers (FR-KSB-06). */
export async function listKasbons(
  session: Session,
  options: { filter: KasbonFilter; search: string; page: number; includeArchived?: boolean },
  now = new Date(),
) {
  assertPermission(session, "page:kasbon");
  const { timeZone } = await readSetting("operations");
  const today = storeDate(now, timeZone);
  const [rows, aging] = await Promise.all([
    queryKasbons(
      {
        filter: options.filter,
        search: options.search.trim(),
        today,
        includeArchived: options.includeArchived ?? false,
      },
      options.page,
      KASBON_PAGE_SIZE,
    ),
    outstandingByAge(timeZone, today),
  ]);
  return {
    kasbons: rows.slice(0, KASBON_PAGE_SIZE).map((row) => {
      const ageDays = daysBetween(storeDate(row.createdAt, timeZone), today);
      return {
        ...row,
        ageDays,
        aging: agingBucket(ageDays),
        due: dueState(row.dueDate, today, row.status === "SETTLED"),
      };
    }),
    hasNextPage: rows.length > KASBON_PAGE_SIZE,
    aging,
  };
}

/** Outstanding store credit for the dashboard (FR-DSH-01). */
export async function getKasbonSummary(session: Session, now = new Date()) {
  if (!session.permissions.has("page:kasbon")) return null;
  const { timeZone } = await readSetting("operations");
  const aging = await outstandingByAge(timeZone, storeDate(now, timeZone));
  return { ...aging, total: aging.current + aging.days31to60 + aging.over60 };
}

/** One store credit with payments and what can still be requested (FR-KSB-02..05). */
export async function getKasbon(session: Session, kasbonId: string, now = new Date()) {
  assertPermission(session, "page:kasbon");
  const kasbon = await findKasbonDetail(kasbonId);
  if (!kasbon) return undefined;
  const { timeZone } = await readSetting("operations");
  const today = storeDate(now, timeZone);
  const ageDays = daysBetween(storeDate(kasbon.createdAt, timeZone), today);
  return {
    ...kasbon,
    ageDays,
    aging: agingBucket(ageDays),
    due: dueState(kasbon.dueDate, today, kasbon.status === "SETTLED"),
    available: Math.max(kasbon.balance - kasbon.pendingTotal, 0),
  };
}

/** Store credit on a sale, for its invoice (FR-INV-04). */
export async function getKasbonForSale(saleId: string) {
  return findKasbonForSale(saleId);
}
