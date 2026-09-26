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
import { fieldErrors, type FormState, submittedValues } from "@/lib/validation/form-state";

import { createEmployeeInput, resetPinInput, updateEmployeeInput } from "./schemas";
import {
  changeEmployeeStatus,
  createEmployee,
  type EmployeeResult,
  resetEmployeePin,
  updateEmployee,
} from "./service";

const employeeId = z.uuid();

async function translations(locale: Locale) {
  return Promise.all([
    getTranslations({ locale, namespace: "Employees" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
}

async function failure(
  reason: Extract<EmployeeResult, { ok: false }>["reason"],
  locale: Locale,
): Promise<FormState> {
  const [t] = await translations(locale);
  switch (reason) {
    case "username-taken":
      return { status: "error", errors: { username: t("errorUsernameTaken") } };
    case "invalid-role":
      return { status: "error", errors: { roleId: t("errorInvalidRole") } };
    case "owner-protected":
      return { status: "error", message: t("errorOwnerProtected") };
    case "self":
      return { status: "error", message: t("errorSelf") };
    case "not-found":
      return { status: "error", message: t("errorNotFound") };
  }
}

/** Creates an employee with an initial PIN (FR-EMP-01). */
export async function createEmployeeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("employee:manage", locale);
  const values = submittedValues(formData, ["name", "username", "roleId"]);
  const parsed = createEmployeeInput.safeParse({
    name: formText(formData, "name"),
    username: formText(formData, "username"),
    roleId: formText(formData, "roleId"),
    pin: formText(formData, "pin"),
  });
  if (!parsed.success) {
    const [, tv] = await translations(locale);
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }

  const result = await createEmployee(session, parsed.data, await currentRequestContext());
  if (!result.ok) return { ...(await failure(result.reason, locale)), values };
  return redirect({ href: "/employees", locale });
}

/** Updates an employee's name and role (FR-EMP-01). */
export async function updateEmployeeAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("employee:manage", locale);
  const values = submittedValues(formData, ["name", "roleId"]);
  const [t, tv] = await translations(locale);
  if (!employeeId.safeParse(id).success) return { status: "error", message: t("errorNotFound") };
  const parsed = updateEmployeeInput.safeParse({
    name: formText(formData, "name"),
    roleId: formText(formData, "roleId"),
  });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };

  const result = await updateEmployee(session, id, parsed.data, await currentRequestContext());
  if (!result.ok) return { ...(await failure(result.reason, locale)), values };
  revalidatePath("/", "layout");
  return { status: "success", message: t("saved") };
}

/** Deactivates or reactivates an employee (FR-EMP-02). */
export async function setEmployeeStatusAction(
  id: string,
  isActive: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("employee:manage", locale);
  if (!employeeId.safeParse(id).success || typeof isActive !== "boolean") {
    return failure("not-found", locale);
  }

  const result = await changeEmployeeStatus(session, id, isActive, await currentRequestContext());
  if (!result.ok) return failure(result.reason, locale);
  revalidatePath("/", "layout");
  const tf = await getTranslations({ locale, namespace: "Feedback" });
  return { status: "success", message: tf(isActive ? "activated" : "deactivated") };
}

/** Sets a temporary PIN that must be changed at next login (FR-AUTH-06). */
export async function resetEmployeePinAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("employee:manage", locale);
  const [t, tv] = await translations(locale);
  if (!employeeId.safeParse(id).success) return { status: "error", message: t("errorNotFound") };
  const parsed = resetPinInput.safeParse({ pin: formText(formData, "pin") });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv) };

  const result = await resetEmployeePin(session, id, parsed.data, await currentRequestContext());
  if (!result.ok) return failure(result.reason, locale);
  revalidatePath("/", "layout");
  return { status: "success", message: t("pinReset") };
}
