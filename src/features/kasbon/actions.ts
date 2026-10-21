"use server";

import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionLink } from "@/components/feedback/result-dialog";
import { storeClosedRejection } from "@/features/shifts/store-closed";
import { localeFromForm } from "@/i18n/form-locale";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import { fieldErrors, type FormState, submittedValues } from "@/lib/validation/form-state";
import { parseRupiah } from "@/lib/validation/money";

import { kasbonPaymentInput, manualKasbonInput } from "./schemas";
import { recordKasbonPayment, recordManualKasbon } from "./service";

const kasbonId = z.uuid();

export type KasbonPaymentResponse =
  | { ok: true; message: string }
  | {
      ok: false;
      message: string;
      field?: "amount" | "bankAccount";
      action?: ActionLink;
    };

/** Records an installment or payoff (cash, transfer or both) (FR-KSB-03..05, ADR-0035, ADR-0036). */
export async function recordKasbonPaymentAction(
  localeValue: unknown,
  id: unknown,
  payload: unknown,
): Promise<KasbonPaymentResponse> {
  const locale =
    typeof localeValue === "string" && hasLocale(routing.locales, localeValue)
      ? localeValue
      : routing.defaultLocale;
  const session = await requirePermission("kasbon:pay", locale);
  const t = await getTranslations({ locale, namespace: "Kasbon" });
  const parsedId = kasbonId.safeParse(id);
  if (!parsedId.success) return { ok: false, message: t("errorNotFound") };
  const parsed = kasbonPaymentInput.safeParse(payload);
  if (!parsed.success) return { ok: false, message: t("errorAmount"), field: "amount" };

  const result = await recordKasbonPayment(
    session,
    parsedId.data,
    parsed.data,
    await currentRequestContext(),
  );
  if (result.ok) {
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: result.status === "APPROVED" ? t("paymentApproved") : t("paymentPending"),
    };
  }
  switch (result.reason) {
    case "exceeds-balance":
      return {
        ok: false,
        message: t("errorExceedsBalance", {
          amount: formatCurrency(result.available ?? 0, locale),
        }),
        field: "amount",
      };
    case "no-open-shift":
      return { ok: false, message: t("errorNoOpenShift") };
    case "store-closed":
      return { ok: false, ...(await storeClosedRejection(session, locale)) };
    case "invalid-bank-account":
      return { ok: false, message: t("errorBankAccount"), field: "bankAccount" };
    case "settled":
      return { ok: false, message: t("errorSettled") };
    case "not-found":
      return { ok: false, message: t("errorNotFound") };
  }
}

const MANUAL_FIELDS = [
  "name",
  "phone",
  "openedOn",
  "amount",
  "reference",
  "description",
  "dueDate",
] as const;

/** Enters an older store credit by hand and opens it (FR-KSB-08, ADR-0052). */
export async function recordManualKasbonAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("kasbon:record-old", locale);
  const values = submittedValues(formData, MANUAL_FIELDS);
  const dueDate = formText(formData, "dueDate").trim();
  const parsed = manualKasbonInput.safeParse({
    name: formText(formData, "name"),
    phone: formText(formData, "phone"),
    openedOn: formText(formData, "openedOn"),
    amount: parseRupiah(formText(formData, "amount")) ?? Number.NaN,
    reference: formText(formData, "reference"),
    description: formText(formData, "description"),
    dueDate: dueDate === "" ? null : dueDate,
  });
  if (!parsed.success) {
    const tv = await getTranslations({ locale, namespace: "Validation" });
    const errors = fieldErrors(parsed.error, tv);
    if (formText(formData, "openedOn").trim() === "") errors.openedOn = tv("required");
    return { status: "error", errors, values };
  }
  const result = await recordManualKasbon(session, parsed.data, await currentRequestContext());
  if (!result.ok) {
    const t = await getTranslations({ locale, namespace: "Kasbon" });
    return result.reason === "future-date"
      ? { status: "error", errors: { openedOn: t("errorOpenedOnFuture") }, values }
      : { status: "error", errors: { dueDate: t("errorDueBeforeOpened") }, values };
  }
  revalidatePath("/", "layout");
  return redirect({ href: `/kasbon/${result.id}`, locale });
}
