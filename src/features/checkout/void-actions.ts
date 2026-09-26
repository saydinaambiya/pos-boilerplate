"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { localeFromForm } from "@/i18n/form-locale";
import { requirePermission } from "@/lib/auth/guard";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import { fieldErrors, type FormState } from "@/lib/validation/form-state";

import { requestVoid, voidInput } from "./void-service";

/** Requests a void with a reason from the sale page (FR-POS-09). */
export async function requestVoidAction(
  saleId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("sale:void", locale);
  const [t, tv] = await Promise.all([
    getTranslations({ locale, namespace: "Receipt" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
  if (!z.uuid().safeParse(saleId).success) return { status: "error", message: t("errorNotFound") };
  const parsed = voidInput.safeParse({ reason: formText(formData, "reason") });
  if (!parsed.success) return { status: "error", errors: fieldErrors(parsed.error, tv) };

  const result = await requestVoid(session, saleId, parsed.data, await currentRequestContext());
  if (!result.ok) {
    const message =
      result.reason === "already-pending"
        ? t("errorAlreadyPending")
        : result.reason === "not-voidable"
          ? t("errorNotVoidable")
          : t("errorNotFound");
    return { status: "error", message };
  }
  revalidatePath("/", "layout");
  return {
    status: "success",
    message: result.status === "APPROVED" ? t("voidApplied") : t("voidRequested"),
  };
}
