"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";

import { localeFromForm } from "@/i18n/form-locale";
import { requirePermission } from "@/lib/auth/guard";
import { currentRequestContext } from "@/lib/http/request-context";
import type { FormState } from "@/lib/validation/form-state";

import { archiveMonth } from "./service";

/** Marks an exported month as archived (FR-HK-03). */
export async function archiveMonthAction(
  month: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("page:housekeeping", locale);
  const t = await getTranslations({ locale, namespace: "Housekeeping" });
  const result = await archiveMonth(session, month, await currentRequestContext());
  if (result.ok) {
    revalidatePath("/", "layout");
    return { status: "success", message: t("archived") };
  }
  const messages = {
    "not-archivable": t("errorNotArchivable"),
    "not-exported": t("errorNotExported"),
    changed: t("errorChanged"),
    "already-archived": t("errorAlreadyArchived"),
  } as const;
  return { status: "error", message: messages[result.reason] };
}
