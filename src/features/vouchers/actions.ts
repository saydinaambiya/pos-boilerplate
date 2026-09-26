"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Locale } from "@/config/locales";
import { localeFromForm } from "@/i18n/form-locale";
import { redirect } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import { fieldErrors, type FormState, submittedValues } from "@/lib/validation/form-state";
import { parseRupiah } from "@/lib/validation/money";

import { createVoucherInput, voucherTermsInput } from "./schemas";
import {
  createVoucher,
  deactivateVoucher,
  reactivateVoucher,
  reviseVoucher,
  type VoucherResult,
} from "./service";

const voucherId = z.uuid();
const FIELDS = [
  "code",
  "name",
  "type",
  "value",
  "minPurchase",
  "maxDiscount",
  "startDate",
  "endDate",
  "quota",
] as const;

const optionalMoney = (value: string) =>
  value.trim() === "" ? null : (parseRupiah(value) ?? Number.NaN);
const optionalText = (value: string) => (value.trim() === "" ? null : value.trim());
const optionalInt = (value: string) =>
  value.trim() === "" ? null : /^\d{1,7}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;

function terms(formData: FormData) {
  return {
    name: formText(formData, "name"),
    type: formText(formData, "type"),
    value: parseRupiah(formText(formData, "value")) ?? Number.NaN,
    minPurchase: optionalMoney(formText(formData, "minPurchase")),
    maxDiscount: optionalMoney(formText(formData, "maxDiscount")),
    startDate: optionalText(formText(formData, "startDate")),
    endDate: optionalText(formText(formData, "endDate")),
    quota: optionalInt(formText(formData, "quota")),
  };
}

async function translations(locale: Locale) {
  return Promise.all([
    getTranslations({ locale, namespace: "Vouchers" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
}

async function outcome(result: VoucherResult, locale: Locale): Promise<FormState> {
  const [t] = await translations(locale);
  if (result.ok) {
    revalidatePath("/", "layout");
    return {
      status: "success",
      message: result.status === "APPROVED" ? t("submittedApproved") : t("submittedPending"),
    };
  }
  switch (result.reason) {
    case "code-taken":
      return { status: "error", errors: { code: t("errorCodeTaken") } };
    case "already-pending":
      return { status: "error", message: t("errorAlreadyPending") };
    case "not-editable":
      return { status: "error", message: t("errorNotEditable") };
    case "not-found":
      return { status: "error", message: t("errorNotFound") };
  }
}

/** Proposes a new voucher (FR-VCH-01/02). */
export async function createVoucherAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("voucher:request", locale);
  const values = submittedValues(formData, FIELDS);
  const parsed = createVoucherInput.safeParse({
    code: formText(formData, "code"),
    ...terms(formData),
  });
  if (!parsed.success) {
    const [, tv] = await translations(locale);
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }
  const result = await createVoucher(session, parsed.data, await currentRequestContext());
  if (!result.ok) return { ...(await outcome(result, locale)), values };
  revalidatePath("/", "layout");
  return redirect({ href: `/vouchers/${result.id}`, locale });
}

/** Proposes new terms for an existing voucher (FR-VCH-03). */
export async function reviseVoucherAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("voucher:request", locale);
  const values = submittedValues(formData, FIELDS);
  if (!voucherId.safeParse(id).success) return outcome({ ok: false, reason: "not-found" }, locale);
  const parsed = voucherTermsInput.safeParse(terms(formData));
  if (!parsed.success) {
    const [, tv] = await translations(locale);
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }
  const result = await reviseVoucher(session, id, parsed.data, await currentRequestContext());
  return result.ok ? outcome(result, locale) : { ...(await outcome(result, locale)), values };
}

/** Deactivates immediately (FR-VCH-04). */
export async function deactivateVoucherAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("voucher:request", locale);
  if (!voucherId.safeParse(id).success) return outcome({ ok: false, reason: "not-found" }, locale);
  return outcome(await deactivateVoucher(session, id, await currentRequestContext()), locale);
}

/** Requests reactivation, which needs approval (FR-VCH-04). */
export async function reactivateVoucherAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("voucher:request", locale);
  if (!voucherId.safeParse(id).success) return outcome({ ok: false, reason: "not-found" }, locale);
  return outcome(await reactivateVoucher(session, id, await currentRequestContext()), locale);
}
