"use server";

import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { currentRequestContext } from "@/lib/http/request-context";

import { kasbonPaymentInput } from "./schemas";
import { recordKasbonPayment } from "./service";

const kasbonId = z.uuid();

export type KasbonPaymentResponse =
  { ok: true; message: string } | { ok: false; message: string; field?: "amount" | "bankAccount" };

/** Records an installment or payoff (cash, transfer or both) for approval (FR-KSB-03..05). */
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
    case "invalid-bank-account":
      return { ok: false, message: t("errorBankAccount"), field: "bankAccount" };
    case "settled":
      return { ok: false, message: t("errorSettled") };
    case "not-found":
      return { ok: false, message: t("errorNotFound") };
  }
}
