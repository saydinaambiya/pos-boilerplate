"use server";

import { hasLocale } from "next-intl";
import { z } from "zod";

import { env } from "@/config/env";
import { routing } from "@/i18n/routing";
import { requirePermission } from "@/lib/auth/guard";

import { createInvoiceLink } from "./service";
import { isInvoiceSize } from "./types";

/**
 * Mints a signed download link for a sale the viewer may see (FR-PDF-04).
 * Size and language only shape the PDF; the token alone grants access.
 */
export async function createInvoiceLinkAction(
  localeValue: unknown,
  saleId: unknown,
  lang: unknown,
  size: unknown,
): Promise<{ url: string } | null> {
  const locale =
    typeof localeValue === "string" && hasLocale(routing.locales, localeValue)
      ? localeValue
      : routing.defaultLocale;
  const session = await requirePermission("page:pos", locale);
  const id = z.uuid().safeParse(saleId);
  if (!id.success) return null;
  const link = await createInvoiceLink(session, id.data);
  if (!link) return null;
  const query = new URLSearchParams({
    lang: typeof lang === "string" && hasLocale(routing.locales, lang) ? lang : locale,
    size: isInvoiceSize(size) ? size : "a4",
  });
  return { url: `${env.APP_URL}/api/v1/invoice-links/${link.token}?${query.toString()}` };
}
