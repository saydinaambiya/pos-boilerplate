"use server";

import { revalidatePath } from "next/cache";

import { localeFromForm } from "@/i18n/form-locale";
import { requirePermission } from "@/lib/auth/guard";
import type { FormState } from "@/lib/validation/form-state";

import { refreshCapacity } from "./service";

/** Reads the database size again from the dashboard card (FR-CAP-05). */
export async function refreshCapacityAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requirePermission("page:housekeeping", localeFromForm(formData));
  await refreshCapacity(session);
  revalidatePath("/", "layout");
  return { status: "success" };
}
