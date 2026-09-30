import "server-only";

import { v7 as uuidv7 } from "uuid";

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
import { storeHoursState } from "@/lib/settings/store-hours";
import { storeClosedFor } from "@/lib/settings/store-hours-guard";

import { agingBucket, daysBetween, dueState, storeDate } from "./aging";
import {
  findKasbonDetail,
  findKasbonForSale,
  findKasbonLabels,
  findOpenShiftForPayment,
  insertKasbon,
  insertKasbonPayment,
  isActiveBankAccount,
  lockKasbon,
  lockOpenShiftForPayment,
  lockInstallment,
  outstandingByAge,
  pendingPaymentTotal,
  queryCustomers,
  queryKasbons,
  setInstallmentStatus,
  updateKasbonAmounts,
  upsertCustomer,
} from "./repository";
import {
  type CustomerInput,
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
        | "not-found"
        | "settled"
        | "exceeds-balance"
        | "no-open-shift"
        | "invalid-bank-account"
        | "store-closed";
      available?: number;
    };

/** The customer for a new store credit, re-used by phone (FR-KSB-01). */
export async function resolveKasbonCustomer(
  tx: Executor,
  customer: CustomerInput,
): Promise<string> {
  return upsertCustomer(tx, customer);
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
 * Whether a payment recorded now settles without waiting for an approver:
 * the recorder has an open cashier shift, not a Sales one, and the store is
 * within its hours. `pos:after-hours` does not count here (FR-KSB-03,
 * ADR-0035).
 */
async function paysDirectly(shift: { kind: string | null } | undefined, now: Date) {
  if (!shift || shift.kind === "SALES") return false;
  const [hours, operations] = await Promise.all([
    readSetting("store.hours"),
    readSetting("operations"),
  ]);
  return storeHoursState(hours, now, operations.timeZone).open;
}

/** Whether `session` would settle a payment right away, for the payment form (ADR-0035). */
export async function kasbonPaysDirectly(session: Session, now = new Date()): Promise<boolean> {
  if (session.role.isSystem) return true;
  return paysDirectly(await findOpenShiftForPayment(db, session.user.id), now);
}

/**
 * Records an installment or payoff paid in cash, by transfer, or both. It
 * reduces the balance at once for the Owner (BR-13) and for a recorder at an
 * open cashier shift in store hours (ADR-0035); otherwise it waits for an
 * approver (FR-KSB-03, BR-12). Outside store hours it is refused, except
 * for the Owner and `pos:after-hours` holders (FR-SET-09, ADR-0036). The
 * parts share an installment id and one approval. The total may not exceed
 * the balance minus other pending payments, checked under a row lock so
 * concurrent requests cannot overshoot (FR-KSB-05). Cash goes into the
 * recorder's drawer, so it needs their open shift.
 */
export async function recordKasbonPayment(
  session: Session,
  kasbonId: string,
  input: KasbonPaymentInput,
  context: RequestContext,
  now = new Date(),
): Promise<KasbonPaymentResult> {
  assertPermission(session, "kasbon:pay");
  if (await storeClosedFor(session, now)) return { ok: false, reason: "store-closed" };
  const transfer = input.transfer;
  const total = input.cash + (transfer?.amount ?? 0);
  try {
    return await db.transaction(async (tx) => {
      const kasbon = await lockKasbon(tx, kasbonId);
      if (!kasbon) return { ok: false, reason: "not-found" } as const;
      if (kasbon.status === "SETTLED") return { ok: false, reason: "settled" } as const;

      const available = kasbon.balance - (await pendingPaymentTotal(tx, kasbon.id));
      if (total > available) {
        return { ok: false, reason: "exceeds-balance", available: Math.max(available, 0) } as const;
      }
      const shift = await lockOpenShiftForPayment(tx, session.user.id);
      if (input.cash > 0 && !shift) return { ok: false, reason: "no-open-shift" } as const;
      if (transfer && !(await isActiveBankAccount(tx, transfer.bankAccountId))) {
        return { ok: false, reason: "invalid-bank-account" } as const;
      }

      const installmentId = uuidv7();
      const base = { kasbonId: kasbon.id, installmentId, shiftId: shift?.id ?? null };
      if (input.cash > 0) {
        await insertKasbonPayment(tx, {
          ...base,
          method: "CASH",
          amount: input.cash,
          bankAccountId: null,
          reference: null,
        });
      }
      if (transfer) {
        await insertKasbonPayment(tx, {
          ...base,
          method: "TRANSFER",
          amount: transfer.amount,
          bankAccountId: transfer.bankAccountId,
          reference: null,
        });
      }
      const labels = await findKasbonLabels(tx, kasbon.id);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "kasbon.payment-recorded",
          entity: "kasbon",
          entityId: kasbon.id,
          diff: { installmentId, cash: input.cash, transfer: transfer?.amount ?? 0 },
        },
        context,
      );
      const submitted = await submitApproval(
        tx,
        session,
        {
          type: "KASBON_PAYMENT",
          targetType: "kasbon-installment",
          targetId: installmentId,
          payload: {
            kasbonId: kasbon.id,
            amount: total,
            cashAmount: input.cash,
            transferAmount: transfer?.amount ?? 0,
            customerName: labels?.customerName ?? "",
            invoiceNo: labels?.invoiceNo ?? "",
            balance: kasbon.balance,
          },
        },
        context,
        applyKasbonPayment,
        { autoApprove: await paysDirectly(shift, now) },
      );
      return { ok: true, status: submitted.status } as const;
    });
  } catch (error) {
    if (error instanceof ApprovalConflict) return { ok: false, reason: "exceeds-balance" };
    throw error;
  }
}

/**
 * Applies an approved installment: all its parts settle, the balance drops
 * and reaching zero settles the credit (FR-KSB-04). Raises
 * `ApprovalConflict` when a part is no longer pending or the total would
 * overshoot the balance.
 */
export const applyKasbonPayment: ApplyApproval = async (tx, approval, actor, context) => {
  const payload = kasbonPaymentPayload.parse(approval.payload);
  const kasbon = await lockKasbon(tx, payload.kasbonId);
  const parts = await lockInstallment(tx, approval.targetId);
  if (
    !kasbon ||
    parts.length === 0 ||
    parts.some((part) => part.kasbonId !== kasbon.id || part.status !== "PENDING")
  ) {
    throw new ApprovalConflict("not-pending");
  }
  const amount = parts.reduce((sum, part) => sum + part.amount, 0);
  if (amount > kasbon.balance) throw new ApprovalConflict("exceeds-balance");

  const paidTotal = kasbon.paidTotal + amount;
  const balance = kasbon.total - paidTotal;
  const status = balance === 0 ? "SETTLED" : "PARTIALLY_PAID";
  await setInstallmentStatus(tx, approval.targetId, "SETTLED");
  await updateKasbonAmounts(tx, kasbon.id, { paidTotal, balance, status });
  await recordAudit(
    tx,
    {
      actorId: actor.id,
      action: "kasbon.payment-approved",
      entity: "kasbon",
      entityId: kasbon.id,
      diff: { installmentId: approval.targetId, amount, balance, status },
    },
    context,
  );
};

/** A rejected or withdrawn installment never counts; cash taken is handed back (FR-KSB-04). */
export const settleKasbonPayment: SettleApproval = async (tx, approval) => {
  await lockInstallment(tx, approval.targetId);
  await setInstallmentStatus(tx, approval.targetId, "FAILED");
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

type HistoryRow = NonNullable<Awaited<ReturnType<typeof findKasbonDetail>>>["payments"][number];

/** Cash and transfer parts of the same installment shown as one entry, newest first. */
function groupInstallments(rows: HistoryRow[]) {
  const groups = new Map<
    string,
    Pick<
      HistoryRow,
      | "createdAt"
      | "requestedBy"
      | "requesterName"
      | "approvalId"
      | "approvalStatus"
      | "approvalVersion"
      | "approvalNote"
    > & {
      id: string;
      total: number;
      parts: Pick<HistoryRow, "method" | "amount" | "bankName" | "reference">[];
    }
  >();
  for (const row of rows) {
    const key = row.installmentId ?? row.id;
    const group = groups.get(key) ?? {
      id: key,
      createdAt: row.createdAt,
      requestedBy: row.requestedBy,
      requesterName: row.requesterName,
      approvalId: row.approvalId,
      approvalStatus: row.approvalStatus,
      approvalVersion: row.approvalVersion,
      approvalNote: row.approvalNote,
      total: 0,
      parts: [],
    };
    group.total += row.amount;
    group.parts.push({
      method: row.method,
      amount: row.amount,
      bankName: row.bankName,
      reference: row.reference,
    });
    groups.set(key, group);
  }
  return [...groups.values()];
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
    installments: groupInstallments(kasbon.payments),
  };
}

/** Store credit on a sale, for its invoice (FR-INV-04). */
export async function getKasbonForSale(saleId: string) {
  return findKasbonForSale(saleId);
}
