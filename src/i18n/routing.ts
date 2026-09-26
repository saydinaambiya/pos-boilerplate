import { defineRouting } from "next-intl/routing";

import { appConfig } from "@/config/app.config";
import { locales } from "@/config/locales";

/**
 * Locale lives in the first path segment (`/id/...`, `/en/...`). Browser
 * language detection is off so `appConfig.appearance.defaultLocale` decides
 * the first visit; the locale cookie remembers later choices (PRD §10.3).
 */
export const routing = defineRouting({
  locales,
  defaultLocale: appConfig.appearance.defaultLocale,
  localePrefix: "always",
  localeDetection: false,
});
