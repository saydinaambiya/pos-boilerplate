import "server-only";

import { createHash } from "node:crypto";

import { db, type Executor } from "@/db/client";
import { uniqueViolationConstraint } from "@/db/errors";
import { colorOf } from "@/features/catalog/schemas";
import { productDetailsLine } from "@/features/catalog/sizes";
import { storeDate } from "@/lib/format/zoned-time";
import { openKasbon, resolveKasbonCustomer } from "@/features/kasbon/service";
import { recordStockMovement } from "@/features/stock/service";
import { consumeVoucher, resolveVoucher } from "@/features/vouchers/service";
import { recordAudit } from "@/lib/audit/audit";
import { assertAnyPermission, assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import { calculateSale, type CartLine, type VoucherRule } from "@/lib/money/calculate";
import { cutPrice } from "@/lib/money/cut";
import { readSetting } from "@/lib/settings/store";
import { storeClosedFor } from "@/lib/settings/store-hours-guard";

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
  /** Amount put on store credit, 0 when fully paid. */
  kasbonTotal: number;
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
        | "voucher-min-purchase"
        | "kasbon-forbidden"
        | "kasbon-due-date"
        | "store-closed";
    }
  | { ok: false; reason: "insufficient-stock"; variantId: string; available: number };

export type CheckoutResult = CheckoutSuccess | CheckoutFailure;

/** Thrown inside the transaction to roll it back with a business result. */
class CheckoutAbort extends Error {
  constructor(readonly result: CheckoutFailure) {
    super(result.reason);
  }
}

/**
 * A sale settling goods a salesperson already took out (FR-CSG-04): stock
 * left at pickup, so no `SALE` movements are written, and `onSale` records
 * the settlement inside the same transaction. Throwing from it rolls the
 * sale back.
 */
export interface ConsignmentSale {
  consignmentId: string;
  onSale: (tx: Executor, sale: { id: string; invoiceNo: string }) => Promise<void>;
}

function requestHash(input: CheckoutInput, consignmentId: string | null = null): string {
  const request = {
    ...(consignmentId ? { consignmentId } : {}),
    lines: input.lines,
    payments: input.payments,
    voucherCode: input.voucherCode ?? null,
    customer: input.customer,
    kasbon: input.kasbon ?? null,
  };
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

/** Store-local calendar day as `YYYYMMDD` (FR-POS-07, FR-UI-11). */
function storeDay(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now).replaceAll("-", "");
}

async function replay(
  userId: string,
  input: CheckoutInput,
  now: Date,
  consignmentId: string | null,
): Promise<CheckoutResult | null> {
  const record = await findIdempotencyRecord(db, userId, input.idempotencyKey, now);
  if (!record) return null;
  if (record.requestHash !== requestHash(input, consignmentId))
    return { ok: false, reason: "idempotency-conflict" };
  const response = record.response as Omit<CheckoutSuccess, "replayed" | "kasbonTotal"> & {
    kasbonTotal?: number;
  };
  return { ...response, kasbonTotal: response.kasbonTotal ?? 0, replayed: true };
}

/**
 * Completes a POS sale in one transaction (FR-POS-01..08, FR-PAY-01..04,
 * FR-SHF-01, FR-STK-01..03, NFR-REL-01):
 *
 * 1. Replays a stored result for a repeated `Idempotency-Key`; outside store
 *    hours employees are refused (FR-SET-09).
 * 2. Requires an open shift, share-locked against a concurrent close.
 * 3. Prices every line from the database and recomputes totals (PRD §5).
 * 4. Validates payments through their providers; they must equal the total,
 *    or leave a remainder that becomes store credit (FR-PAY-05).
 * 5. Takes a gap-free invoice number, writes sale, lines, payments, and
 *    `SALE` stock movements (variants locked in id order to avoid deadlocks).
 *    A custom cut is priced from the roll's price per meter and takes its
 *    length off the roll (FR-ROL-04).
 *
 * Any failure rolls everything back, including the invoice number. With
 * `consignment` the sale settles goods already taken out (FR-CSG-04); a
 * salesperson may do that without cashier access (ADR-0029).
 */
export async function checkout(
  session: Session,
  input: CheckoutInput,
  context: RequestContext,
  now = new Date(),
  consignment?: ConsignmentSale,
): Promise<CheckoutResult> {
  if (consignment) assertAnyPermission(session, ["page:pos", "consignment:sell"]);
  else assertPermission(session, "page:pos");
  const consignmentId = consignment?.consignmentId ?? null;
  const replayed = await replay(session.user.id, input, now, consignmentId);
  if (replayed) return replayed;
  if (await storeClosedFor(session, now)) return { ok: false, reason: "store-closed" };

  if (input.lines.some((line) => line.discount) && !session.permissions.has("pos:item-discount")) {
    return { ok: false, reason: "discount-forbidden" };
  }
  if (input.kasbon && !session.permissions.has("kasbon:create")) {
    return { ok: false, reason: "kasbon-forbidden" };
  }
  const [tax, operations] = await Promise.all([readSetting("tax"), readSetting("operations")]);
  const dueDate = input.kasbon?.dueDate;
  if (dueDate && dueDate < storeDate(now, operations.timeZone)) {
    return { ok: false, reason: "kasbon-due-date" };
  }

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
      if (
        input.lines.some(
          (line) =>
            (variants.get(line.variantId)?.isRoll ?? false) !== (line.lengthCm !== undefined),
        )
      ) {
        throw new CheckoutAbort({ ok: false, reason: "invalid-items" });
      }
      const priced = input.lines.map((line) => {
        const variant = variants.get(line.variantId);
        return {
          unitPrice: cutPrice(variant?.price ?? 0, line.lengthCm),
          unitCost: cutPrice(variant?.cost ?? 0, line.lengthCm),
        };
      });

      const cart: CartLine[] = input.lines.map((line, index) => ({
        unitPrice: priced[index]?.unitPrice ?? 0,
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
      const kasbonTotal = totals.grandTotal - paidTotal;
      if (input.kasbon ? kasbonTotal <= 0 : kasbonTotal !== 0)
        throw new CheckoutAbort({ ok: false, reason: "payment-mismatch" });
      const { customer } = input;
      const customerId =
        input.kasbon && customer.phone
          ? await resolveKasbonCustomer(tx, {
              name: customer.name,
              phone: customer.phone,
              note: input.kasbon.note,
            })
          : null;

      const sequence = await nextInvoiceSequence(tx, storeDay(operations.timeZone, now));
      const invoiceNo = `${operations.invoicePrefix}${storeDay(operations.timeZone, now)}-${String(sequence).padStart(operations.invoiceSequenceDigits, "0")}`;

      const saleId = await insertSale(tx, {
        invoiceNo,
        shiftId: shift.id,
        cashierId: session.user.id,
        customerId,
        consignmentId,
        customerName: customer.name,
        customerPhone: customer.phone,
        status: input.kasbon ? "COMPLETED_WITH_KASBON" : "COMPLETED",
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
            detailsSnapshot: variant ? productDetailsLine(variant) || null : null,
            unitPrice: priced[index]?.unitPrice ?? 0,
            unitCost: priced[index]?.unitCost ?? 0,
            qty: line.qty,
            lengthCm: line.lengthCm ?? null,
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
      if (input.kasbon && customerId) {
        await openKasbon(
          tx,
          session.user.id,
          { id: saleId, invoiceNo, customerId },
          input.kasbon,
          kasbonTotal,
          context,
        );
      }

      if (consignment) await consignment.onSale(tx, { id: saleId, invoiceNo });

      const quantities = new Map<string, number>();
      for (const line of consignment ? [] : input.lines) {
        const units = line.qty * (line.lengthCm ?? 1);
        quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + units);
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

      const response = {
        ok: true as const,
        saleId,
        invoiceNo,
        grandTotal: totals.grandTotal,
        kasbonTotal,
      };
      await insertIdempotencyRecord(tx, {
        userId: session.user.id,
        key: input.idempotencyKey,
        requestHash: requestHash(input, consignmentId),
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
          diff: {
            invoiceNo,
            grandTotal: totals.grandTotal,
            kasbonTotal,
            items: input.lines.length,
            ...(consignmentId ? { consignmentId } : {}),
          },
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
      const concurrent = await replay(session.user.id, input, now, consignmentId);
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
