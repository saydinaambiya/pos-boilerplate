"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import type { Locale } from "@/config/locales";
import { localeFromForm } from "@/i18n/form-locale";
import { requirePermission, requireSession } from "@/lib/auth/guard";
import { currentRequestContext } from "@/lib/http/request-context";
import type { FormState } from "@/lib/validation/form-state";

import { type EndDeviceResult, endMyDevice, endUserDevice } from "./service";

const id = z.uuid();

/**
 * Maps a result to form state. No revalidation here: the confirm dialog
 * refreshes the page after showing the result, and revalidating in the
 * action would remove the row (and its dialog) before the result shows.
 */
async function outcome(result: EndDeviceResult, locale: Locale): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: "Devices" });
  if (!result.ok) {
    const messages = {
      "not-found": t("errorNotFound"),
      current: t("errorCurrent"),
      "owner-protected": t("errorOwnerProtected"),
    } as const;
    return { status: "error", message: messages[result.reason] };
  }
  return { status: "success", message: t("ended") };
}

/** Signs one of the viewer's other devices out (FR-AUTH-10). */
export async function endMyDeviceAction(
  sessionId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requireSession(locale);
  if (!id.safeParse(sessionId).success) return outcome({ ok: false, reason: "not-found" }, locale);
  return outcome(await endMyDevice(session, sessionId, await currentRequestContext()), locale);
}

/** Forces a device of an employee to sign out (FR-AUTH-09/10). */
export async function endUserDeviceAction(
  userId: string,
  sessionId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("employee:manage", locale);
  if (!id.safeParse(userId).success || !id.safeParse(sessionId).success) {
    return outcome({ ok: false, reason: "not-found" }, locale);
  }
  return outcome(
    await endUserDevice(session, userId, sessionId, await currentRequestContext()),
    locale,
  );
}
