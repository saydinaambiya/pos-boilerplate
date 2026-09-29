"use server";

import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { requirePermission } from "@/lib/auth/guard";
import { formatMeters } from "@/lib/format/length";
import { currentRequestContext } from "@/lib/http/request-context";

import { cutRollInput } from "./schemas";
import { cutRoll } from "./service";

export type CutResponse = { ok: true; message: string } | { ok: false; message: string };

/** Cuts pieces from a roll from the form payload; validated again here (FR-ROL-03). */
export async function cutRollAction(
  localeValue: unknown,
  rollId: unknown,
  payload: unknown,
): Promise<CutResponse> {
  const locale =
    typeof localeValue === "string" && hasLocale(routing.locales, localeValue)
      ? localeValue
      : routing.defaultLocale;
  const session = await requirePermission("page:cutting", locale);
  const t = await getTranslations({ locale, namespace: "Cutting" });
  const id = z.uuid().safeParse(rollId);
  const parsed = cutRollInput.safeParse(payload);
  if (!id.success || !parsed.success) return { ok: false, message: t("errors.invalid") };

  const result = await cutRoll(session, id.data, parsed.data, await currentRequestContext());
  if (!result.ok) {
    return result.reason === "insufficient-roll"
      ? {
          ok: false,
          message: t("errors.insufficient", {
            needed: formatMeters(result.needed, locale),
            available: formatMeters(result.available, locale),
          }),
        }
      : { ok: false, message: t("errors.notFound") };
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: t(parsed.data.defect ? "savedDefect" : "saved", {
      used: formatMeters(result.usedCm, locale),
      left: formatMeters(result.rollAfter, locale),
    }),
  };
}
