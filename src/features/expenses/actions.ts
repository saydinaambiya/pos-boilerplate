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

import { expenseInput } from "./schemas";
import { recordExpense } from "./service";

const FIELDS = ["category", "recipientId", "amount", "note"] as const;

/** Records a daily staff expense from the form (FR-EXP-01). */
export async function recordExpenseAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("expense:record", locale);
  const values = submittedValues(formData, FIELDS);
  const [t, tv] = await Promise.all([
    getTranslations({ locale, namespace: "Expenses" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
  const recipient = formText(formData, "recipientId");
  const parsed = expenseInput.safeParse({
    category: formText(formData, "category"),
    recipientId: recipient === "" ? null : recipient,
    amount: parseRupiah(formText(formData, "amount")) ?? Number.NaN,
    note: formText(formData, "note"),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };

  const result = await recordExpense(session, parsed.data, await currentRequestContext());
  if (!result.ok) {
    return result.reason === "no-open-shift"
      ? { status: "error", message: t("errors.noOpenShift"), values }
      : { status: "error", errors: { recipientId: t("errors.invalidRecipient") }, values };
  }
  revalidatePath("/", "layout");
  return redirect({ href: "/expenses", locale });
}
