"use server";

import { getTranslations } from "next-intl/server";

import { localeFromForm } from "@/i18n/form-locale";
import { requirePermission } from "@/lib/auth/guard";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import type { FormState } from "@/lib/validation/form-state";

import { purgeAuditRange, purgeRange } from "./service";

/**
 * Deletes a downloaded past range of the audit log once the Owner ticks that
 * the CSV is saved (FR-AUD-05). No revalidation here: the emptied range would
 * unmount the form before its result shows; closing the dialog refreshes.
 */
export async function purgeAuditAction(
  from: string,
  to: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("audit:view", locale);
  const t = await getTranslations({ locale, namespace: "Audit" });
  const range = await purgeRange(from, to);
  if (!range) return { status: "error", message: t("purgeErrorRange") };
  if (formText(formData, "confirmed") !== "on") {
    return { status: "error", message: t("purgeErrorConfirm") };
  }
  const result = await purgeAuditRange(session, range, await currentRequestContext());
  if (result.ok) return { status: "success", message: t("purged", { count: result.deleted }) };
  const messages = {
    "not-exported": t("purgeErrorNotExported"),
    changed: t("purgeErrorChanged"),
    empty: t("purgeErrorEmpty"),
  } as const;
  return { status: "error", message: messages[result.reason] };
}
