"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Locale } from "@/config/locales";
import { localeFromForm } from "@/i18n/form-locale";
import { redirect } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import { percentToBasisPoints } from "@/lib/settings/rates";
import {
  type SettingKey,
  settingDefinitions,
  storeHoursSchema,
  weekdays,
} from "@/lib/settings/schemas";
import { fieldErrors, type FormState, submittedValues } from "@/lib/validation/form-state";

import { bankAccountInput, marketplaceInput } from "./schemas";
import {
  changeBankAccountStatus,
  changeMarketplaceStatus,
  createBankAccount,
  setQrisAccount,
  createMarketplace,
  type MasterDataResult,
  updateBankAccount,
  updateMarketplace,
  updateSettings,
} from "./service";

const recordId = z.uuid();

const checkbox = (formData: FormData, name: string) => formData.get(name) === "on";

const integer = (formData: FormData, name: string) => {
  const value = formText(formData, name).trim();
  return /^\d{1,6}$/.test(value) ? Number(value) : Number.NaN;
};

const rate = (formData: FormData, name: string) =>
  percentToBasisPoints(formText(formData, name)) ?? Number.NaN;

async function translations(locale: Locale) {
  return Promise.all([
    getTranslations({ locale, namespace: "Settings" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
}

/**
 * Validates and saves one settings section. `aliases` maps schema paths to
 * form field names where they differ (rates are typed as percentages).
 */
async function saveSection(
  key: SettingKey,
  formData: FormData,
  raw: Record<string, unknown>,
  aliases: Record<string, string> = {},
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("settings:manage", locale);
  const [t, tv] = await translations(locale);
  const values = submittedValues(formData, [...formData.keys()]);
  const parsed = settingDefinitions[key].schema.safeParse(raw);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error, tv);
    for (const [path, field] of Object.entries(aliases)) {
      if (errors[path]) errors[field] = errors[path];
    }
    return { status: "error", errors, values };
  }
  await updateSettings(session, key, parsed.data, await currentRequestContext());
  revalidatePath("/", "layout");
  return { status: "success", message: t("saved") };
}

/** Store profile (FR-SET-01). */
export async function updateStoreProfileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveSection("store.profile", formData, {
    address: formText(formData, "address"),
    phone: formText(formData, "phone").replace(/[\s-]/g, ""),
    email: formText(formData, "email").trim(),
    npwp: formText(formData, "npwp").replace(/[\s.-]/g, ""),
    invoiceFooterId: formText(formData, "invoiceFooterId"),
    invoiceFooterEn: formText(formData, "invoiceFooterEn"),
  });
}

/** Tax and service charge (FR-SET-04). */
export async function updateTaxAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveSection(
    "tax",
    formData,
    {
      ppnEnabled: checkbox(formData, "ppnEnabled"),
      ppnRateBps: rate(formData, "ppnRate"),
      serviceEnabled: checkbox(formData, "serviceEnabled"),
      serviceRateBps: rate(formData, "serviceRate"),
      priceIncludesTax: checkbox(formData, "priceIncludesTax"),
    },
    { ppnRateBps: "ppnRate", serviceRateBps: "serviceRate" },
  );
}

/** Operational settings (FR-SET-07). */
export async function updateOperationsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveSection("operations", formData, {
    timeZone: formText(formData, "timeZone"),
    invoicePrefix: formText(formData, "invoicePrefix").trim().toUpperCase(),
    invoiceSequenceDigits: integer(formData, "invoiceSequenceDigits"),
    paperSize: formText(formData, "paperSize"),
    allowNegativeStock: checkbox(formData, "allowNegativeStock"),
    heldOrderHours: integer(formData, "heldOrderHours"),
    housekeepingRetentionMonths: integer(formData, "housekeepingRetentionMonths"),
    sessionIdleMinutes: integer(formData, "sessionIdleMinutes"),
    maxDevicesPerUser: integer(formData, "maxDevicesPerUser"),
  });
}

/**
 * Opening hours per weekday (FR-SET-09). Fields are named per day
 * (`mon-open`, `mon-close`, `mon-closed`); a closing time that is not after
 * the opening time is reported on that day's closing field.
 */
export async function updateStoreHoursAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("settings:manage", locale);
  const [t] = await translations(locale);
  const values = submittedValues(formData, [...formData.keys()]);
  const parsed = storeHoursSchema.safeParse({
    enabled: checkbox(formData, "enabled"),
    days: weekdays.map((day) => ({
      closed: checkbox(formData, `${day}-closed`),
      open: formText(formData, `${day}-open`).trim(),
      close: formText(formData, `${day}-close`).trim(),
    })),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const [, index, field] = issue.path;
      const day = typeof index === "number" ? weekdays[index] : undefined;
      if (!day) continue;
      errors[`${day}-${field === "open" ? "open" : "close"}`] ??=
        issue.code === "custom" ? t("hoursCloseAfterOpen") : t("hoursInvalidTime");
    }
    return { status: "error", errors, values };
  }
  await updateSettings(session, "store.hours", parsed.data, await currentRequestContext());
  revalidatePath("/", "layout");
  return { status: "success", message: t("saved") };
}

async function masterDataFailure(
  result: Extract<MasterDataResult, { ok: false }>,
  locale: Locale,
): Promise<FormState> {
  const [t] = await translations(locale);
  return result.reason === "name-taken"
    ? { status: "error", errors: { name: t("errorNameTaken") } }
    : { status: "error", message: t("errorNotFound") };
}

async function saveBankAccount(id: string | null, formData: FormData): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("settings:manage", locale);
  const [t, tv] = await translations(locale);
  const values = submittedValues(formData, ["bankName", "accountNo", "accountName"]);
  if (id !== null && !recordId.safeParse(id).success) {
    return { status: "error", message: t("errorNotFound") };
  }
  const parsed = bankAccountInput.safeParse({
    bankName: formText(formData, "bankName"),
    accountNo: formText(formData, "accountNo"),
    accountName: formText(formData, "accountName"),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };

  const context = await currentRequestContext();
  const result =
    id === null
      ? await createBankAccount(session, parsed.data, context)
      : await updateBankAccount(session, id, parsed.data, context);
  if (!result.ok) return { ...(await masterDataFailure(result, locale)), values };
  if (id === null) return redirect({ href: "/settings/bank-accounts", locale });
  revalidatePath("/", "layout");
  return { status: "success", message: t("saved") };
}

/** Adds a bank account (FR-SET-05). */
export async function createBankAccountAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveBankAccount(null, formData);
}

export async function updateBankAccountAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveBankAccount(id, formData);
}

export async function setBankAccountStatusAction(
  id: string,
  isActive: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("settings:manage", locale);
  if (!recordId.safeParse(id).success || typeof isActive !== "boolean") {
    return masterDataFailure({ ok: false, reason: "not-found" }, locale);
  }
  const result = await changeBankAccountStatus(
    session,
    id,
    isActive,
    await currentRequestContext(),
  );
  if (!result.ok) return masterDataFailure(result, locale);
  revalidatePath("/", "layout");
  const tf = await getTranslations({ locale, namespace: "Feedback" });
  return { status: "success", message: tf(isActive ? "activated" : "deactivated") };
}

/** Makes an account the QRIS account, or clears it, behind a confirmation (FR-PAY-07). */
export async function setQrisAccountAction(
  id: string,
  isQris: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("settings:manage", locale);
  if (!recordId.safeParse(id).success || typeof isQris !== "boolean") {
    return masterDataFailure({ ok: false, reason: "not-found" }, locale);
  }
  const result = await setQrisAccount(session, isQris ? id : null, await currentRequestContext());
  if (!result.ok) return masterDataFailure(result, locale);
  revalidatePath("/", "layout");
  const t = await getTranslations({ locale, namespace: "Settings" });
  return { status: "success", message: t(isQris ? "qrisSet" : "qrisCleared") };
}

async function saveMarketplace(id: string | null, formData: FormData): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("settings:manage", locale);
  const [t, tv] = await translations(locale);
  const values = submittedValues(formData, ["name"]);
  if (id !== null && !recordId.safeParse(id).success) {
    return { status: "error", message: t("errorNotFound") };
  }
  const parsed = marketplaceInput.safeParse({ name: formText(formData, "name") });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };

  const context = await currentRequestContext();
  const result =
    id === null
      ? await createMarketplace(session, parsed.data, context)
      : await updateMarketplace(session, id, parsed.data, context);
  if (!result.ok) return { ...(await masterDataFailure(result, locale)), values };
  if (id === null) return redirect({ href: "/settings/marketplaces", locale });
  revalidatePath("/", "layout");
  return { status: "success", message: t("saved") };
}

/** Adds a marketplace (FR-SET-06). */
export async function createMarketplaceAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveMarketplace(null, formData);
}

export async function updateMarketplaceAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveMarketplace(id, formData);
}

export async function setMarketplaceStatusAction(
  id: string,
  isActive: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("settings:manage", locale);
  if (!recordId.safeParse(id).success || typeof isActive !== "boolean") {
    return masterDataFailure({ ok: false, reason: "not-found" }, locale);
  }
  const result = await changeMarketplaceStatus(
    session,
    id,
    isActive,
    await currentRequestContext(),
  );
  if (!result.ok) return masterDataFailure(result, locale);
  revalidatePath("/", "layout");
  const tf = await getTranslations({ locale, namespace: "Feedback" });
  return { status: "success", message: tf(isActive ? "activated" : "deactivated") };
}
