"use server";

import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import type { PosProduct } from "@/features/catalog/pos-types";
import { searchPosCatalog } from "@/features/catalog/pos-catalog";
import { routing } from "@/i18n/routing";
import { previewVoucher } from "@/features/vouchers/service";
import { requirePermission } from "@/lib/auth/guard";
import { currentRequestContext } from "@/lib/http/request-context";
import type { VoucherRule } from "@/lib/money/calculate";

import { checkoutInput } from "./schemas";
import { checkout } from "./service";

export type CheckoutResponse =
  | { ok: true; saleId: string; invoiceNo: string; grandTotal: number }
  | { ok: false; message: string };

function localeOf(value: unknown) {
  return typeof value === "string" && hasLocale(routing.locales, value)
    ? value
    : routing.defaultLocale;
}

/**
 * Submits a sale from the terminal. Called directly (not via a form) with
 * the cart payload; the idempotency key inside it makes retries and double
 * clicks safe (FR-POS-08).
 */
export async function checkoutAction(
  localeValue: unknown,
  payload: unknown,
): Promise<CheckoutResponse> {
  const locale = localeOf(localeValue);
  const session = await requirePermission("page:pos", locale);
  const t = await getTranslations({ locale, namespace: "Pos" });
  const parsed = checkoutInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: t("errors.invalid") };

  const result = await checkout(session, parsed.data, await currentRequestContext());
  if (!result.ok) {
    switch (result.reason) {
      case "insufficient-stock":
        return {
          ok: false,
          message: t("errors.insufficientStock", { available: result.available }),
        };
      case "no-open-shift":
        return { ok: false, message: t("errors.noOpenShift") };
      case "discount-forbidden":
        return { ok: false, message: t("errors.discountForbidden") };
      case "payment-mismatch":
        return { ok: false, message: t("errors.paymentMismatch") };
      case "invalid-payment":
        return { ok: false, message: t("errors.invalidPayment") };
      case "voucher-invalid":
        return { ok: false, message: t("errors.voucherInvalid") };
      case "voucher-expired":
        return { ok: false, message: t("errors.voucherExpired") };
      case "voucher-not-started":
        return { ok: false, message: t("errors.voucherNotStarted") };
      case "voucher-quota":
        return { ok: false, message: t("errors.voucherQuota") };
      case "voucher-min-purchase":
        return { ok: false, message: t("errors.voucherMinPurchase") };
      case "idempotency-conflict":
      case "invalid-items":
        return { ok: false, message: t("errors.invalid") };
    }
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    saleId: result.saleId,
    invoiceNo: result.invoiceNo,
    grandTotal: result.grandTotal,
  };
}

/** Server-side product search for catalogues too large to preload (NFR-PERF-07). */
export async function searchPosCatalogAction(
  localeValue: unknown,
  term: unknown,
): Promise<PosProduct[]> {
  const session = await requirePermission("page:pos", localeOf(localeValue));
  return searchPosCatalog(session, typeof term === "string" ? term : "");
}

export type VoucherPreview =
  { ok: true; code: string; name: string; rule: VoucherRule } | { ok: false; message: string };

/** Checks a voucher code for the terminal preview; checkout validates again (FR-POS-03). */
export async function checkVoucherAction(
  localeValue: unknown,
  code: unknown,
): Promise<VoucherPreview> {
  const locale = localeOf(localeValue);
  const session = await requirePermission("page:pos", locale);
  const t = await getTranslations({ locale, namespace: "Pos" });
  const result = await previewVoucher(session, typeof code === "string" ? code : "");
  if (result.ok) return { ok: true, code: result.code, name: result.name, rule: result.rule };
  const messages = {
    invalid: t("errors.voucherInvalid"),
    expired: t("errors.voucherExpired"),
    "not-started": t("errors.voucherNotStarted"),
    quota: t("errors.voucherQuota"),
  } as const;
  return { ok: false, message: messages[result.reason] };
}
