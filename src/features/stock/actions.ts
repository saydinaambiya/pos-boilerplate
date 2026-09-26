"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Locale } from "@/config/locales";
import { localeFromForm } from "@/i18n/form-locale";
import { requirePermission } from "@/lib/auth/guard";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import { fieldErrors, type FormState, submittedValues } from "@/lib/validation/form-state";

import { countStockInput, receiveStockInput, writeOffStockInput } from "./schemas";
import { countStock, receiveStock, type StockResult, writeOffStock } from "./service";

const variantId = z.uuid();

const integer = (value: string) =>
  /^\d{1,7}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;

async function translations(locale: Locale) {
  return Promise.all([
    getTranslations({ locale, namespace: "Stock" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
}

/** Maps a ledger result to form state; the qty field carries stock errors. */
async function toFormState(
  result: StockResult,
  locale: Locale,
  qtyField: string,
): Promise<FormState> {
  const [t] = await translations(locale);
  if (result.ok) {
    revalidatePath("/", "layout");
    const delta = result.qtyDelta > 0 ? `+${result.qtyDelta}` : String(result.qtyDelta);
    return { status: "success", message: t("saved", { delta, after: result.stockAfter }) };
  }
  switch (result.reason) {
    case "insufficient-stock":
      return {
        status: "error",
        errors: { [qtyField]: t("errorInsufficient", { available: result.available }) },
      };
    case "not-tracked":
      return { status: "error", message: t("errorNotTracked") };
    case "not-found":
      return { status: "error", message: t("errorNotFound") };
  }
}

async function prepare(id: string, formData: FormData, fields: readonly string[]) {
  const locale = localeFromForm(formData);
  const session = await requirePermission("stock:adjust", locale);
  const [, tv] = await translations(locale);
  return {
    locale,
    session,
    tv,
    validId: variantId.safeParse(id).success,
    values: submittedValues(formData, fields),
  };
}

/** Goods received (FR-STK-01). */
export async function receiveStockAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { locale, session, tv, validId, values } = await prepare(id, formData, ["qty", "note"]);
  if (!validId) return toFormState({ ok: false, reason: "not-found" }, locale, "qty");
  const parsed = receiveStockInput.safeParse({
    qty: integer(formText(formData, "qty")),
    note: formText(formData, "note"),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  const result = await receiveStock(session, id, parsed.data, await currentRequestContext());
  return result.ok
    ? toFormState(result, locale, "qty")
    : { ...(await toFormState(result, locale, "qty")), values };
}

/** Stock count with a mandatory reason (FR-STK-05). */
export async function countStockAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { locale, session, tv, validId, values } = await prepare(id, formData, [
    "counted",
    "reason",
  ]);
  if (!validId) return toFormState({ ok: false, reason: "not-found" }, locale, "counted");
  const parsed = countStockInput.safeParse({
    counted: integer(formText(formData, "counted")),
    reason: formText(formData, "reason"),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  const result = await countStock(session, id, parsed.data, await currentRequestContext());
  return result.ok
    ? toFormState(result, locale, "counted")
    : { ...(await toFormState(result, locale, "counted")), values };
}

/** Write-off with a mandatory reason (FR-STK-01). */
export async function writeOffStockAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { locale, session, tv, validId, values } = await prepare(id, formData, ["qty", "reason"]);
  if (!validId) return toFormState({ ok: false, reason: "not-found" }, locale, "qty");
  const parsed = writeOffStockInput.safeParse({
    qty: integer(formText(formData, "qty")),
    reason: formText(formData, "reason"),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  const result = await writeOffStock(session, id, parsed.data, await currentRequestContext());
  return result.ok
    ? toFormState(result, locale, "qty")
    : { ...(await toFormState(result, locale, "qty")), values };
}
