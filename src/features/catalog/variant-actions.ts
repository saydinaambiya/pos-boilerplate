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
import { parseMetersToCm } from "@/lib/format/length";
import { parseRupiah } from "@/lib/validation/money";

import { colorHex } from "./options";
import { enableVariantsInput, newVariantInput, rollSkuSchema, variantInput } from "./schemas";
import { getProduct } from "./service";
import {
  changeVariantStatus,
  createVariant,
  enableVariants,
  getVariant,
  moveVariant,
  updateVariant,
  type VariantResult,
} from "./variant-service";

const recordId = z.uuid();

/** Bound arguments come back from the client, so they are re-validated. */
const moveDirection = z.enum(["up", "down"]);

const integer = (value: string) =>
  /^\d{1,7}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;

/** Stock quantities: pieces, or on a roll meters stored as cm (ADR-0023). */
const quantity = (value: string, roll: boolean) =>
  roll ? (parseMetersToCm(value || "0") ?? Number.NaN) : integer(value || "0");

/** A roll colour's SKU leaves room for its pieces' size suffix. */
const rollSku = { sku: rollSkuSchema };

/** Empty means "inherit from the product" (FR-VAR-02). */
const override = (value: string) =>
  value.trim() === "" ? null : (parseRupiah(value) ?? Number.NaN);

/**
 * Colour from the form: a listed colour gets its swatch filled in, a stored
 * colour kept on an edit keeps its swatch, and one typed under "Other" has
 * none (FR-VAR-01/03, ADR-0026, ADR-0034).
 */
function chosenColor(formData: FormData, current?: { name: string; hex?: string | undefined }) {
  const name = formText(formData, "colorName");
  const kept = current?.name === name;
  return {
    colorName: name,
    hex: colorHex(name) ?? (kept ? (current.hex ?? "") : ""),
  };
}

const FIELDS = ["colorName", "sku", "minStock", "priceOverride", "initialStock"] as const;

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

function variantFields(
  formData: FormData,
  session: Session,
  roll: boolean,
  current?: { name: string; hex?: string | undefined },
) {
  return {
    ...chosenColor(formData, current),
    sku: formText(formData, "sku"),
    minStock: quantity(formText(formData, "minStock"), roll),
    priceOverride: roll ? null : override(formText(formData, "priceOverride")),
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
  const product = validId ? await getProduct(session, productId) : undefined;
  if (!product) return failure({ ok: false, reason: "not-found" }, locale);
  const schema = product.isRoll ? enableVariantsInput.extend(rollSku) : enableVariantsInput;
  const parsed = schema.safeParse({
    ...chosenColor(formData),
    sku: formText(formData, "sku"),
    minStock: quantity(formText(formData, "minStock"), product.isRoll),
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
  const product = validId ? await getProduct(session, productId) : undefined;
  if (!product) return failure({ ok: false, reason: "not-found" }, locale);
  const schema = product.isRoll ? newVariantInput.extend(rollSku) : newVariantInput;
  const parsed = schema.safeParse({
    ...variantFields(formData, session, product.isRoll),
    initialStock: quantity(formText(formData, "initialStock"), product.isRoll),
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
  const variant = validId ? await getVariant(session, variantId) : undefined;
  if (!variant) return failure({ ok: false, reason: "not-found" }, locale);
  const schema = variant.isRoll ? variantInput.extend(rollSku) : variantInput;
  const parsed = schema.safeParse(
    variantFields(formData, session, variant.isRoll, variant.color ?? undefined),
  );
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
  const tf = await getTranslations({ locale, namespace: "Feedback" });
  return { status: "success", message: tf(isActive ? "activated" : "deactivated") };
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
