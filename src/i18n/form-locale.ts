import { hasLocale } from "next-intl";

import type { Locale } from "@/config/locales";

import { routing } from "./routing";

/** Name of the hidden field that carries the page locale into Server Actions. */
export const LOCALE_FIELD = "locale";

/**
 * Server Actions cannot read `next/root-params`, so forms post the locale
 * explicitly. Unknown values fall back to the default locale.
 */
export function localeFromForm(formData: FormData): Locale {
  const value = formData.get(LOCALE_FIELD);
  return typeof value === "string" && hasLocale(routing.locales, value)
    ? value
    : routing.defaultLocale;
}
