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

import { categoryInput, productInput } from "./schemas";
import {
  type CatalogResult,
  changeProductStatus,
  createCategory,
  createProduct,
  deleteCategory,
  updateCategory,
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
      return { status: "error", errors: { name: t("errorNameTaken") } };
    case "sku-taken":
      return { status: "error", errors: { sku: t("errorSkuTaken") } };
    case "invalid-category":
      return { status: "error", errors: { categoryId: t("errorInvalidCategory") } };
    case "in-use":
      return { status: "error", message: t("errorCategoryInUse") };
    case "not-found":
      return { status: "error", message: t("errorNotFound") };
  }
}

function parseCategory(formData: FormData) {
  return categoryInput.safeParse({
    name: formText(formData, "name"),
    sortOrder: integer(formText(formData, "sortOrder") || "0"),
  });
}

/** Creates a category (FR-CAT-01). */
export async function createCategoryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("category:manage", locale);
  const values = submittedValues(formData, ["name", "sortOrder"]);
  const parsed = parseCategory(formData);
  if (!parsed.success) {
    const [, tv] = await translations(locale);
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }
  const result = await createCategory(session, parsed.data, await currentRequestContext());
  if (!result.ok) return { ...(await failure(result, locale)), values };
  revalidatePath("/", "layout");
  const [t] = await translations(locale);
  return { status: "success", message: t("categorySaved") };
}

export async function updateCategoryAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("category:manage", locale);
  const values = submittedValues(formData, ["name", "sortOrder"]);
  if (!recordId.safeParse(id).success) return failure({ ok: false, reason: "not-found" }, locale);
  const parsed = parseCategory(formData);
  if (!parsed.success) {
    const [, tv] = await translations(locale);
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }
  const result = await updateCategory(session, id, parsed.data, await currentRequestContext());
  if (!result.ok) return { ...(await failure(result, locale)), values };
  revalidatePath("/", "layout");
  const [t] = await translations(locale);
  return { status: "success", message: t("categorySaved") };
}

/** Deletes an empty category behind a confirmation (FR-CAT-01, FR-UX-04). */
export async function deleteCategoryAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("category:manage", locale);
  if (!recordId.safeParse(id).success) return failure({ ok: false, reason: "not-found" }, locale);
  const result = await deleteCategory(session, id, await currentRequestContext());
  if (!result.ok) return failure(result, locale);
  return redirect({ href: "/products/categories", locale });
}

const PRODUCT_FIELDS = [
  "name",
  "categoryId",
  "price",
  "cost",
  "unit",
  "trackStock",
  "sku",
  "minStock",
] as const;

function parseProduct(formData: FormData, session: Session) {
  const canSeeCost = session.permissions.has("product:view-cost");
  return productInput.safeParse({
    name: formText(formData, "name"),
    categoryId: formText(formData, "categoryId"),
    price: money(formText(formData, "price")),
    ...(canSeeCost ? { cost: money(formText(formData, "cost") || "0") } : {}),
    unit: formText(formData, "unit"),
    trackStock: formData.get("trackStock") === "on",
    sku: formText(formData, "sku"),
    minStock: integer(formText(formData, "minStock") || "0"),
  });
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
  const parsed = parseProduct(formData, session);
  if (!parsed.success) {
    const [, tv] = await translations(locale);
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }

  const context = await currentRequestContext();
  const result =
    id === null
      ? await createProduct(session, parsed.data, context)
      : await updateProduct(session, id, parsed.data, context);
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
  return { status: "success" };
}
