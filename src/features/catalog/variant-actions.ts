"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Locale } from "@/config/locales";
import { localeFromForm } from "@/i18n/form-locale";
import { redirect } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import type { Session } from "@/lib/auth/session";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import { fieldErrors, type FormState, submittedValues } from "@/lib/validation/form-state";
import { parseRupiah } from "@/lib/validation/money";

import { enableVariantsInput, newVariantInput, variantInput } from "./schemas";
import {
  changeVariantStatus,
  createVariant,
  enableVariants,
  moveVariant,
  updateVariant,
  type VariantResult,
} from "./variant-service";

const recordId = z.uuid();

/** Bound arguments come back from the client, so they are re-validated. */
const moveDirection = z.enum(["up", "down"]);

const integer = (value: string) =>
  /^\d{1,7}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;

/** Empty means "inherit from the product" (FR-VAR-02). */
const override = (value: string) =>
  value.trim() === "" ? null : (parseRupiah(value) ?? Number.NaN);

const hex = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? "" : trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
};

const FIELDS = [
  "colorName",
  "hex",
  "sku",
  "minStock",
  "priceOverride",
  "costOverride",
  "initialStock",
] as const;

async function translations(locale: Locale) {
  return Promise.all([
    getTranslations({ locale, namespace: "Variants" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
}

async function failure(
  result: Extract<VariantResult, { ok: false }>,
  locale: Locale,
): Promise<FormState> {
  const [t] = await translations(locale);
  switch (result.reason) {
    case "sku-taken":
      return { status: "error", errors: { sku: t("errorSkuTaken") } };
    case "color-taken":
      return { status: "error", errors: { colorName: t("errorColorTaken") } };
    case "stock-forbidden":
      return { status: "error", errors: { initialStock: t("errorStockForbidden") } };
    case "default-variant":
      return { status: "error", message: t("errorDefaultVariant") };
    case "already-enabled":
    case "variants-disabled":
    case "not-found":
      return { status: "error", message: t("errorNotFound") };
  }
}

function variantFields(formData: FormData, session: Session) {
  const canSeeCost = session.permissions.has("product:view-cost");
  return {
    colorName: formText(formData, "colorName"),
    hex: hex(formText(formData, "hex")),
    sku: formText(formData, "sku"),
    minStock: integer(formText(formData, "minStock") || "0"),
    priceOverride: override(formText(formData, "priceOverride")),
    ...(canSeeCost ? { costOverride: override(formText(formData, "costOverride")) } : {}),
  };
}

async function start(id: string, formData: FormData) {
  const locale = localeFromForm(formData);
  const session = await requirePermission("product:update", locale);
  return {
    locale,
    session,
    validId: recordId.safeParse(id).success,
    values: submittedValues(formData, FIELDS),
  };
}

/** Enables colour variants with a first variant that takes over the stock (FR-VAR-06). */
export async function enableVariantsAction(
  productId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { locale, session, validId, values } = await start(productId, formData);
  if (!validId) return failure({ ok: false, reason: "not-found" }, locale);
  const parsed = enableVariantsInput.safeParse({
    colorName: formText(formData, "colorName"),
    hex: hex(formText(formData, "hex")),
    sku: formText(formData, "sku"),
    minStock: integer(formText(formData, "minStock") || "0"),
  });
  if (!parsed.success) {
    const [, tv] = await translations(locale);
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }
  const result = await enableVariants(
    session,
    productId,
    parsed.data,
    await currentRequestContext(),
  );
  if (!result.ok) return { ...(await failure(result, locale)), values };
  revalidatePath("/", "layout");
  const [t] = await translations(locale);
  return { status: "success", message: t("enabled") };
}

/** Adds a colour variant (FR-VAR-01). */
export async function createVariantAction(
  productId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { locale, session, validId, values } = await start(productId, formData);
  if (!validId) return failure({ ok: false, reason: "not-found" }, locale);
  const parsed = newVariantInput.safeParse({
    ...variantFields(formData, session),
    initialStock: integer(formText(formData, "initialStock") || "0"),
  });
  if (!parsed.success) {
    const [, tv] = await translations(locale);
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }
  const result = await createVariant(
    session,
    productId,
    parsed.data,
    await currentRequestContext(),
  );
  if (!result.ok) return { ...(await failure(result, locale)), values };
  revalidatePath("/", "layout");
  const [t] = await translations(locale);
  return { status: "success", message: t("created") };
}

/** Edits a colour variant (FR-VAR-01/02/03). */
export async function updateVariantAction(
  variantId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { locale, session, validId, values } = await start(variantId, formData);
  if (!validId) return failure({ ok: false, reason: "not-found" }, locale);
  const parsed = variantInput.safeParse(variantFields(formData, session));
  if (!parsed.success) {
    const [, tv] = await translations(locale);
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }
  const result = await updateVariant(
    session,
    variantId,
    parsed.data,
    await currentRequestContext(),
  );
  if (!result.ok) return { ...(await failure(result, locale)), values };
  revalidatePath("/", "layout");
  const [t] = await translations(locale);
  return { status: "success", message: t("saved") };
}

/** Activates or deactivates a variant behind a confirmation (FR-VAR-05). */
export async function setVariantStatusAction(
  variantId: string,
  isActive: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { locale, session, validId } = await start(variantId, formData);
  if (!validId || typeof isActive !== "boolean")
    return failure({ ok: false, reason: "not-found" }, locale);
  const result = await changeVariantStatus(
    session,
    variantId,
    isActive,
    await currentRequestContext(),
  );
  if (!result.ok) return failure(result, locale);
  revalidatePath("/", "layout");
  return { status: "success" };
}

/** Moves a variant up or down; a plain form, so it works without JavaScript (FR-VAR-08). */
export async function moveVariantAction(
  productId: string,
  variantId: string,
  direction: "up" | "down",
  formData: FormData,
): Promise<void> {
  const { locale, session, validId } = await start(variantId, formData);
  if (validId && moveDirection.safeParse(direction).success) {
    await moveVariant(session, variantId, direction, await currentRequestContext());
  }
  redirect({ href: `/products/${recordId.safeParse(productId).success ? productId : ""}`, locale });
}
