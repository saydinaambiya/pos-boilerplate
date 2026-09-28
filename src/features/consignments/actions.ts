"use server";

import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { PosProduct } from "@/features/catalog/pos-types";
import { searchConsignmentCatalog } from "@/features/catalog/pos-catalog";
import { routing } from "@/i18n/routing";
import { requirePermission } from "@/lib/auth/guard";
import { currentRequestContext } from "@/lib/http/request-context";

import { settleGoodsInput, takeGoodsInput } from "./schemas";
import { settleGoods, takeGoods } from "./service";

function localeOf(value: unknown) {
  return typeof value === "string" && hasLocale(routing.locales, value)
    ? value
    : routing.defaultLocale;
}

export type ConsignmentResponse =
  { ok: true; id: string; message: string } | { ok: false; message: string };

/** Product search for the pickup form (FR-CSG-02). */
export async function searchConsignmentCatalogAction(
  localeValue: unknown,
  term: unknown,
): Promise<PosProduct[]> {
  const session = await requirePermission("page:consignments", localeOf(localeValue));
  return searchConsignmentCatalog(session, typeof term === "string" ? term : "");
}

/** Records a pickup from the form payload; validated again here (FR-CSG-02). */
export async function takeGoodsAction(
  localeValue: unknown,
  payload: unknown,
): Promise<ConsignmentResponse> {
  const locale = localeOf(localeValue);
  const session = await requirePermission("page:consignments", locale);
  const t = await getTranslations({ locale, namespace: "Consignments" });
  const parsed = takeGoodsInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: t("errors.invalid") };

  const result = await takeGoods(session, parsed.data, await currentRequestContext());
  if (!result.ok) {
    switch (result.reason) {
      case "insufficient-stock":
        return {
          ok: false,
          message: t("errors.insufficientStock", { available: result.available }),
        };
      case "forbidden":
        return { ok: false, message: t("errors.forbidden") };
      case "store-closed":
        return { ok: false, message: t("errors.storeClosed") };
      case "invalid-salesperson":
      case "invalid-items":
        return { ok: false, message: t("errors.invalid") };
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, id: result.consignmentId, message: t("taken") };
}

/** Records a settlement of sold and returned goods (FR-CSG-03/04). */
export async function settleGoodsAction(
  localeValue: unknown,
  consignmentId: unknown,
  payload: unknown,
): Promise<ConsignmentResponse> {
  const locale = localeOf(localeValue);
  const session = await requirePermission("page:consignments", locale);
  const [t, tPos] = await Promise.all([
    getTranslations({ locale, namespace: "Consignments" }),
    getTranslations({ locale, namespace: "Pos" }),
  ]);
  const id = z.uuid().safeParse(consignmentId);
  const parsed = settleGoodsInput.safeParse(payload);
  if (!id.success || !parsed.success) return { ok: false, message: t("errors.invalid") };

  const result = await settleGoods(session, id.data, parsed.data, await currentRequestContext());
  if (!result.ok) {
    switch (result.reason) {
      case "exceeds-outstanding":
        return { ok: false, message: t("errors.exceedsOutstanding") };
      case "closed":
        return { ok: false, message: t("errors.closed") };
      case "kasbon-forbidden":
        return { ok: false, message: tPos("errors.kasbonForbidden") };
      case "store-closed":
        return { ok: false, message: t("errors.storeClosed") };
      case "forbidden":
        return { ok: false, message: t("errors.forbidden") };
      case "not-found":
        return { ok: false, message: t("errors.invalid") };
      case "sale-failed":
        switch (result.sale.reason) {
          case "no-open-shift":
            return { ok: false, message: t("errors.noOpenShift") };
          case "payment-mismatch":
          case "invalid-payment":
            return { ok: false, message: tPos("errors.invalidPayment") };
          case "kasbon-due-date":
            return { ok: false, message: tPos("errors.kasbonDueDate") };
          case "store-closed":
            return { ok: false, message: t("errors.storeClosed") };
          case "kasbon-forbidden":
            return { ok: false, message: tPos("errors.kasbonForbidden") };
          case "insufficient-stock":
          case "invalid-items":
          case "discount-forbidden":
          case "idempotency-conflict":
          case "voucher-invalid":
          case "voucher-expired":
          case "voucher-not-started":
          case "voucher-quota":
          case "voucher-min-purchase":
            return { ok: false, message: t("errors.invalid") };
        }
    }
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    id: id.data,
    message: result.invoiceNo
      ? t("settledWithSale", { invoiceNo: result.invoiceNo })
      : t("settledReturnOnly"),
  };
}
