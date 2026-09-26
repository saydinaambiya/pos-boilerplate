import { createTranslator, type NamespaceKeys } from "next-intl";

import type { Locale } from "@/config/locales";
import en from "@/messages/en.json";
import id from "@/messages/id.json";

type Messages = typeof id;

const catalogs: Record<Locale, Messages> = { id, en };

/**
 * Translator for an explicit locale, independent of the request (route
 * handlers, PDF rendering, tests). Pages keep using `getTranslations`.
 */
export function translatorFor<Namespace extends NamespaceKeys<Messages, keyof Messages>>(
  locale: Locale,
  namespace: Namespace,
) {
  return createTranslator({ locale, messages: catalogs[locale], namespace });
}
