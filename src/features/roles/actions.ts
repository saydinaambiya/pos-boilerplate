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

import { roleInput } from "./schemas";
import { changeRoleStatus, createRole, type RoleResult, updateRole } from "./service";

const FIELDS = ["name", "permissions"] as const;
const roleId = z.uuid();

async function translations(locale: Locale) {
  return Promise.all([
    getTranslations({ locale, namespace: "Roles" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
}

function parse(formData: FormData) {
  return roleInput.safeParse({
    name: formText(formData, "name"),
    permissions: formData.getAll("permissions").filter((value) => typeof value === "string"),
  });
}

async function failure(
  reason: Extract<RoleResult, { ok: false }>["reason"],
  locale: Locale,
): Promise<FormState> {
  const [t] = await translations(locale);
  switch (reason) {
    case "name-taken":
      return { status: "error", errors: { name: t("errorNameTaken") } };
    case "system-role":
      return { status: "error", message: t("errorSystemRole") };
    case "role-in-use":
      return { status: "error", message: t("errorInUse") };
    case "not-found":
      return { status: "error", message: t("errorNotFound") };
  }
}

/** Creates a role (FR-RBAC-01). */
export async function createRoleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("role:manage", locale);
  const values = submittedValues(formData, FIELDS);
  const parsed = parse(formData);
  if (!parsed.success) {
    const [, tv] = await translations(locale);
    return { status: "error", errors: fieldErrors(parsed.error, tv), values };
  }

  const result = await createRole(session, parsed.data, await currentRequestContext());
  if (!result.ok) return { ...(await failure(result.reason, locale)), values };
  return redirect({ href: "/employees/roles", locale });
}

/** Renames a role and replaces its permission set (FR-RBAC-01/03). */
export async function updateRoleAction(
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("role:manage", locale);
  const values = submittedValues(formData, FIELDS);
  const parsed = parse(formData);
  const [t, tv] = await translations(locale);
  if (!roleId.safeParse(id).success) return { status: "error", message: t("errorNotFound") };
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv), values };

  const result = await updateRole(session, id, parsed.data, await currentRequestContext());
  if (!result.ok) return { ...(await failure(result.reason, locale)), values };
  revalidatePath("/", "layout");
  return { status: "success", message: t("saved") };
}

/** Activates or deactivates a role behind a confirmation dialog (FR-UX-04). */
export async function setRoleStatusAction(
  id: string,
  isActive: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("role:manage", locale);
  if (!roleId.safeParse(id).success || typeof isActive !== "boolean") {
    return failure("not-found", locale);
  }

  const result = await changeRoleStatus(session, id, isActive, await currentRequestContext());
  if (!result.ok) return failure(result.reason, locale);
  revalidatePath("/", "layout");
  const tf = await getTranslations({ locale, namespace: "Feedback" });
  return { status: "success", message: tf(isActive ? "activated" : "deactivated") };
}
