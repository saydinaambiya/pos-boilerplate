import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";

import type { Locale } from "@/config/locales";
import { operationalDefaults } from "@/config/operational-defaults";

import { routing } from "./routing";

const catalogs = {
  id: () => import("@/messages/id.json"),
  en: () => import("@/messages/en.json"),
} satisfies Record<Locale, () => Promise<unknown>>;

export default getRequestConfig(async ({ locale: explicit }) => {
  const requested = explicit ?? (await rootLocale());
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    timeZone: operationalDefaults.timeZone,
    messages: (await catalogs[locale]()).default,
  };
});
