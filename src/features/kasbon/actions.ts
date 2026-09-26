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

import { kasbonPaymentInput } from "./schemas";
import { recordKasbonPayment } from "./service";

const kasbonId = z.uuid();
const FIELDS = ["method", "amount", "bankAccountId", "reference"] as const;

/** Records an installment or payoff for approval (FR-KSB-03..05). */
export async function recordKasbonPaymentAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("kasbon:pay", locale);
  const [t, tv] = await Promise.all([
    getTranslations({ locale, namespace: "Kasbon" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
  const values = submittedValues(formData, FIELDS);
  if (!kasbonId.safeParse(id).success) return { status: "error", message: t("errorNotFound") };

  const method = formText(formData, "method");
  const amount = parseRupiah(formText(formData, "amount")) ?? Number.NaN;
  const parsed = kasbonPaymentInput.safeParse(
    method === "TRANSFER"
      ? {
          method,
          amount,
          bankAccountId: formText(formData, "bankAccountId"),
          reference: formText(formData, "reference"),
        }
      : { method, amount },
  );
  if (!parsed.success) {
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }

  const result = await recordKasbonPayment(session, id, parsed.data, await currentRequestContext());
  if (result.ok) {
    revalidatePath("/", "layout");
    return {
      status: "success",
      message: result.status === "APPROVED" ? t("paymentApproved") : t("paymentPending"),
    };
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
    case "no-open-shift":
      return { status: "error", message: t("errorNoOpenShift"), values };
    case "invalid-bank-account":
      return { status: "error", errors: { bankAccountId: t("errorBankAccount") }, values };
    case "settled":
      return { status: "error", message: t("errorSettled") };
    case "not-found":
      return { status: "error", message: t("errorNotFound") };
  }
}
