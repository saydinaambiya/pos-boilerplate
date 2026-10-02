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
import { parseDecimal, parseMetersToCm } from "@/lib/format/length";
import { parseRupiah } from "@/lib/validation/money";

import {
  brandInput,
  newProductInput,
  productDetailsInput,
  productInput,
  rollProductInput,
} from "./schemas";
import { PRODUCT_SIZES } from "./sizes";
import {
  type CatalogResult,
  createBrand,
  createProduct,
  deleteBrand,
  deleteProduct,
  getProduct,
  updateBrand,
  updateProduct,
} from "./service";

const recordId = z.uuid();

const integer = (value: string) =>
  /^\d{1,7}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
const money = (value: string) => parseRupiah(value) ?? Number.NaN;

async function translations(locale: Locale) {
  return Promise.all([
    getTranslations({ locale, namespace: "Catalog" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
}

async function failure(
  result: Extract<CatalogResult, { ok: false }>,
  locale: Locale,
): Promise<FormState> {
  const [t] = await translations(locale);
  switch (result.reason) {
    case "name-taken":
      return { status: "error", errors: { name: t("errorBrandNameTaken") } };
    case "sku-taken":
      return { status: "error", errors: { sku: t("errorSkuTaken") } };
    case "invalid-brand":
      return { status: "error", errors: { brandId: t("errorInvalidBrand") } };
    case "in-use":
      return { status: "error", message: t("errorBrandInUse") };
    case "not-found":
      return { status: "error", message: t("errorNotFound") };
  }
}

/** Creates a brand (FR-CAT-02). */
export async function createBrandAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("brand:manage", locale);
  const values = submittedValues(formData, ["name"]);
  const parsed = brandInput.safeParse({ name: formText(formData, "name") });
  if (!parsed.success) {
    const [, tv] = await translations(locale);
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }
  const result = await createBrand(session, parsed.data, await currentRequestContext());
  if (!result.ok) return { ...(await failure(result, locale)), values };
  revalidatePath("/", "layout");
  const [t] = await translations(locale);
  return { status: "success", message: t("brandSaved") };
}

export async function updateBrandAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("brand:manage", locale);
  const values = submittedValues(formData, ["name"]);
  if (!recordId.safeParse(id).success) return failure({ ok: false, reason: "not-found" }, locale);
  const parsed = brandInput.safeParse({ name: formText(formData, "name") });
  if (!parsed.success) {
    const [, tv] = await translations(locale);
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }
  const result = await updateBrand(session, id, parsed.data, await currentRequestContext());
  if (!result.ok) return { ...(await failure(result, locale)), values };
  revalidatePath("/", "layout");
  const [t] = await translations(locale);
  return { status: "success", message: t("brandSaved") };
}

/** Deletes an unused brand behind a confirmation (FR-CAT-02, FR-UX-04). */
export async function deleteBrandAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("brand:manage", locale);
  if (!recordId.safeParse(id).success) return failure({ ok: false, reason: "not-found" }, locale);
  const result = await deleteBrand(session, id, await currentRequestContext());
  if (!result.ok) return failure(result, locale);
  return redirect({ href: "/products/brands", locale });
}

const SIZE_PRICE_FIELDS = PRODUCT_SIZES.flatMap(
  (size) => [`sizePrice_${size}`, `defectPrice_${size}`] as const,
);

/** One rupiah amount per size from fields named `${prefix}_${size}`. */
function pricesPerSize(formData: FormData, prefix: string) {
  return Object.fromEntries(
    PRODUCT_SIZES.map((size) => [size, money(formText(formData, `${prefix}_${size}`))]),
  );
}

const PRODUCT_FIELDS = [
  "name",
  "colorName",
  "brandId",
  "motif",
  "thickness",
  ...SIZE_PRICE_FIELDS,
  "price",
  "unit",
  "trackStock",
  "sku",
  "minStock",
] as const;

/**
 * Form fields as schema input. A roll form (FR-ROL-02/05) sends a normal
 * and a defect price per size and no unit or stock switch; its minimum
 * stock is typed in meters.
 */
function productDetails(formData: FormData, session: Session, isRoll: boolean) {
  const thickness = formText(formData, "thickness");
  return {
    name: formText(formData, "name"),
    brandId: formText(formData, "brandId"),
    motif: formText(formData, "motif"),
    thickness: thickness === "" ? null : (parseDecimal(thickness) ?? Number.NaN),
    ...(isRoll
      ? {
          sizePrices: pricesPerSize(formData, "sizePrice"),
          defectSizePrices: pricesPerSize(formData, "defectPrice"),
          unit: "pcs",
          trackStock: true,
        }
      : { unit: formText(formData, "unit"), trackStock: formData.get("trackStock") === "on" }),
    price: money(formText(formData, "price")),
  };
}

function defaultVariantFields(formData: FormData, isRoll: boolean) {
  const minStock = formText(formData, "minStock") || "0";
  return {
    sku: formText(formData, "sku"),
    minStock: isRoll ? (parseMetersToCm(minStock) ?? Number.NaN) : integer(minStock),
  };
}

/** Zod errors per field; a size price reports on its own input. */
function productErrors(error: z.ZodError, tv: Parameters<typeof fieldErrors>[1]) {
  const errors = fieldErrors(error, tv);
  for (const issue of error.issues) {
    const [field, size] = issue.path;
    if (field === "sizePrices" && typeof size === "string") {
      errors[`sizePrice_${size}`] ??= errors.sizePrices ?? tv("invalid");
    }
    if (field === "defectSizePrices" && typeof size === "string") {
      errors[`defectPrice_${size}`] ??= errors.defectSizePrices ?? tv("invalid");
    }
  }
  return errors;
}

async function saveProduct(id: string | null, formData: FormData): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission(
    id === null ? "product:create" : "product:update",
    locale,
  );
  const values = submittedValues(formData, PRODUCT_FIELDS);
  if (id !== null && !recordId.safeParse(id).success) {
    return failure({ ok: false, reason: "not-found" }, locale);
  }
  const current = id === null ? null : await getProduct(session, id);
  if (id !== null && !current) return failure({ ok: false, reason: "not-found" }, locale);
  const isRoll = current?.isRoll ?? true;
  const details = productDetails(formData, session, isRoll);
  const context = await currentRequestContext();
  let result: CatalogResult;
  if (id === null || formData.has("sku")) {
    const schema = id === null ? newProductInput : isRoll ? rollProductInput : productInput;
    const parsed = schema.safeParse({
      ...details,
      ...defaultVariantFields(formData, isRoll),
      ...(id === null ? { colorName: formText(formData, "colorName") } : {}),
    });
    if (!parsed.success) {
      const [, tv] = await translations(locale);
      return { status: "error", errors: productErrors(parsed.error, tv), values };
    }
    result =
      id === null
        ? await createProduct(session, parsed.data, context)
        : await updateProduct(session, id, parsed.data, context);
  } else {
    const parsed = productDetailsInput.safeParse(details);
    if (!parsed.success) {
      const [, tv] = await translations(locale);
      return { status: "error", errors: productErrors(parsed.error, tv), values };
    }
    result = await updateProduct(session, id, parsed.data, context);
  }
  if (!result.ok) return { ...(await failure(result, locale)), values };
  if (id === null) return redirect({ href: "/products", locale });
  revalidatePath("/", "layout");
  const [t] = await translations(locale);
  return { status: "success", message: t("productSaved") };
}

/** Creates a product with its default variant (FR-PRD-01). */
export async function createProductAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveProduct(null, formData);
}

export async function updateProductAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveProduct(id, formData);
}

/**
 * Deletes a product behind a confirmation (FR-PRD-03, ADR-0041). Nothing
 * is revalidated: that would re-render the open product page as a 404
 * before the dialog leads back to the list, which renders fresh anyway.
 */
export async function deleteProductAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("product:update", locale);
  if (!recordId.safeParse(id).success) return failure({ ok: false, reason: "not-found" }, locale);
  const result = await deleteProduct(session, id, await currentRequestContext());
  if (!result.ok) return failure(result, locale);
  const tf = await getTranslations({ locale, namespace: "Feedback" });
  return { status: "success", message: tf("productDeleted") };
}
