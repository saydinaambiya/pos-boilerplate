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

import { brandInput, newProductInput, productDetailsInput, productInput } from "./schemas";
import {
  type CatalogResult,
  changeProductStatus,
  createBrand,
  createProduct,
  deleteBrand,
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

const PRODUCT_FIELDS = [
  "name",
  "brandId",
  "motif",
  "size",
  "price",
  "cost",
  "unit",
  "trackStock",
  "sku",
  "minStock",
] as const;

function productDetails(formData: FormData, session: Session) {
  const canSeeCost = session.permissions.has("product:view-cost");
  return {
    name: formText(formData, "name"),
    brandId: formText(formData, "brandId"),
    motif: formText(formData, "motif"),
    size: formText(formData, "size"),
    price: money(formText(formData, "price")),
    ...(canSeeCost ? { cost: money(formText(formData, "cost") || "0") } : {}),
    unit: formText(formData, "unit"),
    trackStock: formData.get("trackStock") === "on",
  };
}

function defaultVariantFields(formData: FormData) {
  return {
    sku: formText(formData, "sku"),
    minStock: integer(formText(formData, "minStock") || "0"),
  };
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
  const details = productDetails(formData, session);
  const context = await currentRequestContext();
  let result: CatalogResult;
  if (id === null || formData.has("sku")) {
    const schema = id === null ? newProductInput : productInput;
    const parsed = schema.safeParse({ ...details, ...defaultVariantFields(formData) });
    if (!parsed.success) {
      const [, tv] = await translations(locale);
      return { status: "error", errors: fieldErrors(parsed.error, tv), values };
    }
    result =
      id === null
        ? await createProduct(session, parsed.data, context)
        : await updateProduct(session, id, parsed.data, context);
  } else {
    const parsed = productDetailsInput.safeParse(details);
    if (!parsed.success) {
      const [, tv] = await translations(locale);
      return { status: "error", errors: fieldErrors(parsed.error, tv), values };
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

/** Activates or deactivates a product (FR-PRD-03). */
export async function setProductStatusAction(
  id: string,
  isActive: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("product:update", locale);
  if (!recordId.safeParse(id).success || typeof isActive !== "boolean") {
    return failure({ ok: false, reason: "not-found" }, locale);
  }
  const result = await changeProductStatus(session, id, isActive, await currentRequestContext());
  if (!result.ok) return failure(result, locale);
  revalidatePath("/", "layout");
  const tf = await getTranslations({ locale, namespace: "Feedback" });
  return { status: "success", message: tf(isActive ? "activated" : "deactivated") };
}
