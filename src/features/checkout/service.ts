import "server-only";

import { createHash } from "node:crypto";

import { db } from "@/db/client";
import { uniqueViolationConstraint } from "@/db/errors";
import { colorOf } from "@/features/catalog/schemas";
import { recordStockMovement } from "@/features/stock/service";
import { consumeVoucher, resolveVoucher } from "@/features/vouchers/service";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import { calculateSale, type CartLine, type VoucherRule } from "@/lib/money/calculate";
import { readSetting } from "@/lib/settings/store";

import { paymentProviders, type PreparedPayment } from "./payment-providers";
import {
  findIdempotencyRecord,
  findSaleDetail,
  findSellableVariants,
  insertIdempotencyRecord,
  insertPayments,
  insertSale,
  insertSaleItems,
  lockOpenShiftForSale,
  nextInvoiceSequence,
} from "./repository";
import type { CheckoutInput } from "./schemas";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface CheckoutSuccess {
  ok: true;
  saleId: string;
  invoiceNo: string;
  grandTotal: number;
  replayed: boolean;
}

export type CheckoutFailure =
  | {
      ok: false;
      reason:
        | "no-open-shift"
        | "invalid-items"
        | "discount-forbidden"
        | "invalid-payment"
        | "payment-mismatch"
        | "idempotency-conflict"
        | "voucher-invalid"
        | "voucher-expired"
        | "voucher-not-started"
        | "voucher-quota"
        | "voucher-min-purchase";
    }
  | { ok: false; reason: "insufficient-stock"; variantId: string; available: number };

export type CheckoutResult = CheckoutSuccess | CheckoutFailure;

/** Thrown inside the transaction to roll it back with a business result. */
class CheckoutAbort extends Error {
  constructor(readonly result: CheckoutFailure) {
    super(result.reason);
  }
}

function requestHash(input: CheckoutInput): string {
  const request = {
    lines: input.lines,
    payments: input.payments,
    voucherCode: input.voucherCode ?? null,
  };
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

/** Store-local calendar day as `YYYYMMDD` (FR-POS-07, FR-UI-11). */
function storeDay(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now).replaceAll("-", "");
}

async function replay(userId: string, input: CheckoutInput): Promise<CheckoutResult | null> {
  const record = await findIdempotencyRecord(db, userId, input.idempotencyKey);
  if (!record) return null;
  if (record.requestHash !== requestHash(input))
    return { ok: false, reason: "idempotency-conflict" };
  return { ...(record.response as Omit<CheckoutSuccess, "replayed">), replayed: true };
}

/**
 * Completes a POS sale in one transaction (FR-POS-01..08, FR-PAY-01..04,
 * FR-SHF-01, FR-STK-01..03, NFR-REL-01):
 *
 * 1. Replays a stored result for a repeated `Idempotency-Key`.
 * 2. Requires an open shift, share-locked against a concurrent close.
 * 3. Prices every line from the database and recomputes totals (PRD §5).
 * 4. Validates payments through their providers; they must equal the total.
 * 5. Takes a gap-free invoice number, writes sale, lines, payments, and
 *    `SALE` stock movements (variants locked in id order to avoid deadlocks).
 *
 * Any failure rolls everything back, including the invoice number.
 */
export async function checkout(
  session: Session,
  input: CheckoutInput,
  context: RequestContext,
  now = new Date(),
): Promise<CheckoutResult> {
  assertPermission(session, "page:pos");
  const replayed = await replay(session.user.id, input);
  if (replayed) return replayed;

  if (input.lines.some((line) => line.discount) && !session.permissions.has("pos:item-discount")) {
    return { ok: false, reason: "discount-forbidden" };
  }
  const [tax, operations] = await Promise.all([readSetting("tax"), readSetting("operations")]);

  try {
    return await db.transaction(async (tx) => {
      const shift = await lockOpenShiftForSale(tx, session.user.id);
      if (!shift) throw new CheckoutAbort({ ok: false, reason: "no-open-shift" });

      const variantIds = [...new Set(input.lines.map((line) => line.variantId))];
      const variants = new Map(
        (await findSellableVariants(tx, variantIds)).map((row) => [row.id, row]),
      );
      if (variantIds.some((id) => !variants.get(id)?.sellable)) {
        throw new CheckoutAbort({ ok: false, reason: "invalid-items" });
      }

      const cart: CartLine[] = input.lines.map((line) => ({
        unitPrice: variants.get(line.variantId)?.price ?? 0,
        qty: line.qty,
        discount: line.discount ?? null,
      }));
      let voucher: { voucherId: string; rule: VoucherRule } | null = null;
      if (input.voucherCode) {
        const checked = await resolveVoucher(tx, input.voucherCode, now);
        if (!checked.ok)
          throw new CheckoutAbort({ ok: false, reason: `voucher-${checked.reason}` });
        const { minPurchase } = checked.rule;
        if (minPurchase != null && calculateSale(cart, tax).subtotal < minPurchase) {
          throw new CheckoutAbort({ ok: false, reason: "voucher-min-purchase" });
        }
        voucher = checked;
      }
      const totals = calculateSale(cart, tax, voucher?.rule);

      const prepared: PreparedPayment[] = [];
      for (const payment of input.payments) {
        const result = await paymentProviders[payment.method].prepare(tx, payment);
        if (!result) throw new CheckoutAbort({ ok: false, reason: "invalid-payment" });
        prepared.push(result);
      }
      const paidTotal = prepared.reduce((sum, payment) => sum + payment.amount, 0);
      if (paidTotal !== totals.grandTotal)
        throw new CheckoutAbort({ ok: false, reason: "payment-mismatch" });

      const sequence = await nextInvoiceSequence(tx, storeDay(operations.timeZone, now));
      const invoiceNo = `${operations.invoicePrefix}${storeDay(operations.timeZone, now)}-${String(sequence).padStart(operations.invoiceSequenceDigits, "0")}`;

      const saleId = await insertSale(tx, {
        invoiceNo,
        shiftId: shift.id,
        cashierId: session.user.id,
        status: "COMPLETED",
        subtotal: totals.subtotal,
        itemDiscountTotal: totals.itemDiscountTotal,
        voucherId: voucher?.voucherId ?? null,
        voucherDiscount: totals.voucherDiscount,
        serviceRateBps: tax.serviceEnabled ? tax.serviceRateBps : 0,
        serviceAmount: totals.serviceAmount,
        ppnRateBps: tax.ppnEnabled ? tax.ppnRateBps : 0,
        ppnAmount: totals.ppnAmount,
        priceIncludesTax: tax.ppnEnabled && tax.priceIncludesTax,
        grandTotal: totals.grandTotal,
        paidTotal,
        idempotencyKey: input.idempotencyKey,
      });

      await insertSaleItems(
        tx,
        input.lines.map((line, index) => {
          const variant = variants.get(line.variantId);
          const computed = totals.lines[index];
          return {
            saleId,
            variantId: line.variantId,
            nameSnapshot: variant?.productName ?? "",
            variantSnapshot: colorOf(variant?.attributes)?.name ?? null,
            unitPrice: variant?.price ?? 0,
            qty: line.qty,
            discountType: line.discount?.type ?? null,
            discountValue: line.discount
              ? line.discount.type === "percent"
                ? line.discount.bps
                : line.discount.value
              : null,
            discountAmount: computed?.discount ?? 0,
            lineTotal: computed?.total ?? 0,
            sortOrder: index,
          };
        }),
      );
      await insertPayments(tx, saleId, prepared);
      if (voucher) await consumeVoucher(tx, voucher.voucherId);

      const quantities = new Map<string, number>();
      for (const line of input.lines) {
        quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.qty);
      }
      for (const variantId of [...quantities.keys()].sort()) {
        if (!variants.get(variantId)?.trackStock) continue;
        const moved = await recordStockMovement(
          tx,
          {
            variantId,
            type: "SALE",
            qtyDelta: -(quantities.get(variantId) ?? 0),
            actorId: session.user.id,
            reference: { type: "sale", id: saleId },
          },
          { allowNegative: operations.allowNegativeStock },
        );
        if (!moved.ok) {
          throw new CheckoutAbort(
            moved.reason === "insufficient-stock"
              ? { ok: false, reason: "insufficient-stock", variantId, available: moved.available }
              : { ok: false, reason: "invalid-items" },
          );
        }
      }

      const response = { ok: true as const, saleId, invoiceNo, grandTotal: totals.grandTotal };
      await insertIdempotencyRecord(tx, {
        userId: session.user.id,
        key: input.idempotencyKey,
        requestHash: requestHash(input),
        response,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      });
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "sale.completed",
          entity: "sale",
          entityId: saleId,
          diff: { invoiceNo, grandTotal: totals.grandTotal, items: input.lines.length },
        },
        context,
      );
      return { ...response, replayed: false };
    });
  } catch (error) {
    if (error instanceof CheckoutAbort) return error.result;
    const constraint = uniqueViolationConstraint(error);
    if (
      constraint === "sales_cashier_idempotency_key" ||
      constraint === "idempotency_keys_user_key"
    ) {
      const concurrent = await replay(session.user.id, input);
      if (concurrent) return concurrent;
    }
    throw error;
  }
}

/** Receipt data: the cashier's own sales, or any sale for `report:view` (NFR-SEC-07). */
export async function getSale(session: Session, saleId: string) {
  assertPermission(session, "page:pos");
  const sale = await findSaleDetail(saleId);
  if (!sale) return undefined;
  if (sale.cashierId !== session.user.id && !session.permissions.has("report:view"))
    return undefined;
  return sale;
}

/**
 * Sale detail without a session, for callers that proved access another
 * way, i.e. a verified signed download link (FR-PDF-04). Never expose this
 * to user-chosen ids without such proof.
 */
export async function getSaleForVerifiedLink(saleId: string) {
  return findSaleDetail(saleId);
}
