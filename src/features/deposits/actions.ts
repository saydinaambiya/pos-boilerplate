"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { localeFromForm } from "@/i18n/form-locale";
import { redirect } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import { fieldErrors, type FormState, submittedValues } from "@/lib/validation/form-state";
import { parseRupiah } from "@/lib/validation/money";

import { depositEditInput, depositInput, depositReason } from "./schemas";
import { cancelDeposit, editDeposit, recordDeposit } from "./service";

const FIELDS = ["day", "bankAccountId", "amount", "note"] as const;

/** The recap period to return to, as `?day=` or `?month=` (FR-RPT-06). */
const recapQuery = (period: string) =>
  /^(day=\d{4}-\d{2}-\d{2}|month=\d{4}-\d{2})$/.test(period) ? `/reports?${period}` : "/reports";

/** Records an ATM deposit from the recap (FR-RPT-07). */
export async function recordDepositAction(
  period: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("cash:deposit", locale);
  const values = submittedValues(formData, FIELDS);
  const [t, tv] = await Promise.all([
    getTranslations({ locale, namespace: "Reports" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
  const parsed = depositInput.safeParse({
    day: formText(formData, "day"),
    bankAccountId: formText(formData, "bankAccountId"),
    amount: parseRupiah(formText(formData, "amount")) ?? Number.NaN,
    note: formText(formData, "note"),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };

  const result = await recordDeposit(session, parsed.data, await currentRequestContext());
  if (!result.ok) {
    return result.reason === "future-day"
      ? { status: "error", errors: { day: t("deposit.errors.futureDay") }, values }
      : { status: "error", errors: { bankAccountId: t("deposit.errors.invalidAccount") }, values };
  }
  revalidatePath("/", "layout");
  return redirect({ href: recapQuery(period), locale });
}

/** Corrects an ATM deposit, with the reason kept in its history (FR-RPT-07). */
export async function editDepositAction(
  id: string,
  period: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("cash:deposit", locale);
  const values = submittedValues(formData, [...FIELDS, "reason"]);
  const [t, tv] = await Promise.all([
    getTranslations({ locale, namespace: "Reports" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
  const parsed = depositEditInput.safeParse({
    day: formText(formData, "day"),
    bankAccountId: formText(formData, "bankAccountId"),
    amount: parseRupiah(formText(formData, "amount")) ?? Number.NaN,
    note: formText(formData, "note"),
    reason: formText(formData, "reason"),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  if (!z.uuid().safeParse(id).success) {
    return { status: "error", message: t("deposit.errors.notFound"), values };
  }

  const result = await editDeposit(session, id, parsed.data, await currentRequestContext());
  if (!result.ok) {
    const errors = {
      "future-day": { day: t("deposit.errors.futureDay") },
      "invalid-account": { bankAccountId: t("deposit.errors.invalidAccount") },
      settled: { amount: t("deposit.errors.amountSettled") },
    } as const;
    if (result.reason in errors) {
      return { status: "error", errors: errors[result.reason as keyof typeof errors], values };
    }
    const message =
      result.reason === "unchanged" ? t("deposit.errors.unchanged") : t("deposit.errors.notFound");
    return { status: "error", message, values };
  }
  revalidatePath("/", "layout");
  return redirect({ href: recapQuery(period), locale });
}

/**
 * Cancels an ATM deposit that never happened, with a reason (FR-RPT-07).
 * `ConfirmAction` refreshes the page itself; revalidating here would
 * replace the row before the result dialog opens.
 */
export async function cancelDepositAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("cash:deposit", locale);
  const [t, tv] = await Promise.all([
    getTranslations({ locale, namespace: "Reports" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
  const values = submittedValues(formData, ["reason"]);
  const parsed = z
    .object({ reason: depositReason })
    .safeParse({ reason: formText(formData, "reason") });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  if (!z.uuid().safeParse(id).success) {
    return { status: "error", message: t("deposit.errors.notFound"), values };
  }
  const result = await cancelDeposit(
    session,
    id,
    parsed.data.reason,
    await currentRequestContext(),
  );
  if (!result.ok) {
    const message =
      result.reason === "settled" ? t("deposit.errors.settled") : t("deposit.errors.notFound");
    return { status: "error", message, values };
  }
  return { status: "success", message: t("deposit.cancelled") };
}
