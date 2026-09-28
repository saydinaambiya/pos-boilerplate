"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { localeFromForm } from "@/i18n/form-locale";
import { redirect } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import { fieldErrors, type FormState, submittedValues } from "@/lib/validation/form-state";
import { parseRupiah } from "@/lib/validation/money";

import { closeShiftInput, openShiftInput } from "./schemas";
import { closeShift, openShift } from "./service";

const money = (value: string) => parseRupiah(value) ?? Number.NaN;

/** Opens the cashier's shift (FR-SHF-02). */
export async function openShiftAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("page:pos", locale);
  const [t, tv] = await Promise.all([
    getTranslations({ locale, namespace: "Shifts" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
  const values = submittedValues(formData, ["openingCash"]);
  const parsed = openShiftInput.safeParse({
    openingCash: money(formText(formData, "openingCash")),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };

  const result = await openShift(session, parsed.data, await currentRequestContext());
  if (!result.ok) {
    const message =
      result.reason === "store-closed" ? t("errorStoreClosed") : t("errorAlreadyOpen");
    return { status: "error", message, values };
  }
  revalidatePath("/", "layout");
  return { status: "success", message: t("opened") };
}

/** Closes the cashier's shift and shows its report (FR-SHF-03/04). */
export async function closeShiftAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("page:pos", locale);
  const [t, tv] = await Promise.all([
    getTranslations({ locale, namespace: "Shifts" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
  const values = submittedValues(formData, ["countedCash", "note"]);
  const parsed = closeShiftInput.safeParse({
    countedCash: money(formText(formData, "countedCash")),
    note: formText(formData, "note"),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };

  const result = await closeShift(session, parsed.data, await currentRequestContext());
  if (!result.ok) return { status: "error", message: t("errorNoOpenShift") };
  return redirect({ href: `/pos/shifts?view=${result.id}`, locale });
}
