"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { localeFromForm } from "@/i18n/form-locale";
import { redirect } from "@/i18n/navigation";
import { requireSession } from "@/lib/auth/guard";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import { fieldErrors, type FormState, submittedValues } from "@/lib/validation/form-state";
import { parseRupiah } from "@/lib/validation/money";

import { closeShiftInput, openShiftInput } from "./schemas";
import { closeShift, openShift } from "./service";

const money = (value: string) => parseRupiah(value) ?? Number.NaN;

/** Opens the caller's shift, at the cashier or in the Sales menu (FR-SHF-02, ADR-0029). */
export async function openShiftAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requireSession(locale);
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

/**
 * Closes the caller's shift (FR-SHF-03/04): cashiers go on to its report,
 * salespeople without the cashier stay in the Sales menu (ADR-0029).
 */
export async function closeShiftAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requireSession(locale);
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
  if (!session.permissions.has("page:pos")) {
    revalidatePath("/", "layout");
    return { status: "success", message: t("closedSummary") };
  }
  return redirect({ href: `/pos/shifts?view=${result.id}`, locale });
}
