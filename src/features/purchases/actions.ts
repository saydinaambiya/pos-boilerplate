"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { localeFromForm } from "@/i18n/form-locale";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import { fieldErrors, type FormState, submittedValues } from "@/lib/validation/form-state";
import { parseRupiah } from "@/lib/validation/money";

import { purchaseCreateInput, purchasePaymentInput, purchaseUpdateInput } from "./schemas";
import {
  createPurchase,
  deletePurchase,
  recordPurchasePayment,
  removePurchasePayment,
  updatePurchase,
} from "./service";

const FIELDS = [
  "companyName",
  "invoiceNo",
  "total",
  "orderDate",
  "term",
  "paidNow",
  "method",
  "dueDate",
  "note",
] as const;

const PAYMENT_FIELDS = ["amount", "paidOn", "method", "note"] as const;

const dateOrNull = (value: string) => (value.trim() === "" ? null : value);

/** Creates or edits a supplier bill, staying on the list (FR-PRB-01). */
export async function savePurchaseAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("purchase:manage", locale);
  const t = await getTranslations({ locale, namespace: "Purchases" });
  const tv = await getTranslations({ locale, namespace: "Validation" });
  const values = submittedValues(formData, FIELDS);
  const base = {
    companyName: formText(formData, "companyName"),
    invoiceNo: formText(formData, "invoiceNo"),
    total: parseRupiah(formText(formData, "total")) ?? Number.NaN,
    orderDate: formText(formData, "orderDate"),
    dueDate: dateOrNull(formText(formData, "dueDate")),
    note: formText(formData, "note"),
  };
  const context = await currentRequestContext();
  const id = formText(formData, "id").trim();

  if (id === "") {
    const paidText = formText(formData, "paidNow").trim();
    const parsed = purchaseCreateInput.safeParse({
      ...base,
      term: formText(formData, "term"),
      paidNow: paidText === "" ? 0 : (parseRupiah(paidText) ?? Number.NaN),
      method: formText(formData, "method"),
    });
    if (!parsed.success) {
      return { status: "error", errors: fieldErrors(parsed.error, tv), values };
    }
    const result = await createPurchase(session, parsed.data, context);
    if (!result.ok) {
      return { status: "error", errors: { invoiceNo: t("errorDuplicateInvoice") }, values };
    }
    revalidatePath("/", "layout");
    return { status: "success", message: t("saved"), values };
  }

  const parsed = purchaseUpdateInput.safeParse(base);
  if (!parsed.success) {
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }
  const result = await updatePurchase(session, id, parsed.data, context);
  if (!result.ok) {
    if (result.reason === "duplicate-invoice") {
      return { status: "error", errors: { invoiceNo: t("errorDuplicateInvoice") }, values };
    }
    if (result.reason === "total-below-paid") {
      return { status: "error", errors: { total: t("errorTotalBelowPaid") }, values };
    }
    if (result.reason === "due-required") {
      return { status: "error", errors: { dueDate: t("errorDueRequired") }, values };
    }
    return { status: "error", message: t("errorNotFound"), values };
  }
  revalidatePath("/", "layout");
  return { status: "success", message: t("saved"), values };
}

/** Removes a bill and its installments (FR-PRB-01). */
export async function deletePurchaseAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("purchase:manage", locale);
  const t = await getTranslations({ locale, namespace: "Purchases" });
  const parsedId = z.uuid().safeParse(formText(formData, "id"));
  if (!parsedId.success) return { status: "error", message: t("errorNotFound") };
  const result = await deletePurchase(session, parsedId.data, await currentRequestContext());
  if (!result.ok) return { status: "error", message: t("errorNotFound") };
  revalidatePath("/", "layout");
  return { status: "success", message: t("deleted") };
}

/** Records an installment or payoff of a bill (FR-PRB-03). */
export async function recordPurchasePaymentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("purchase:manage", locale);
  const t = await getTranslations({ locale, namespace: "Purchases" });
  const values = submittedValues(formData, PAYMENT_FIELDS);
  const purchaseId = z.uuid().safeParse(formText(formData, "purchaseId"));
  if (!purchaseId.success) return { status: "error", message: t("errorNotFound"), values };

  const parsed = purchasePaymentInput.safeParse({
    amount: parseRupiah(formText(formData, "amount")) ?? Number.NaN,
    paidOn: formText(formData, "paidOn"),
    method: formText(formData, "method"),
    note: formText(formData, "note"),
  });
  if (!parsed.success) {
    const tv = await getTranslations({ locale, namespace: "Validation" });
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }
  const result = await recordPurchasePayment(
    session,
    purchaseId.data,
    parsed.data,
    await currentRequestContext(),
  );
  if (result.ok) {
    revalidatePath("/", "layout");
    return { status: "success", message: t("paymentRecorded"), values };
  }
  switch (result.reason) {
    case "exceeds-balance":
      return {
        status: "error",
        errors: {
          amount: t("errorExceedsBalance", {
            amount: formatCurrency(result.available ?? 0, locale),
          }),
        },
        values,
      };
    case "settled":
      return { status: "error", message: t("errorSettled"), values };
    case "invalid-date":
      return { status: "error", errors: { paidOn: t("errorInvalidDate") }, values };
    case "not-found":
      return { status: "error", message: t("errorNotFound"), values };
  }
}

/** Removes an installment and recalculates the bill (FR-PRB-03). */
export async function deletePurchasePaymentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("purchase:manage", locale);
  const t = await getTranslations({ locale, namespace: "Purchases" });
  const parsedId = z.uuid().safeParse(formText(formData, "paymentId"));
  if (!parsedId.success) return { status: "error", message: t("errorNotFound") };
  const result = await removePurchasePayment(session, parsedId.data, await currentRequestContext());
  if (!result.ok) return { status: "error", message: t("errorNotFound") };
  revalidatePath("/", "layout");
  return { status: "success", message: t("paymentDeleted") };
}
