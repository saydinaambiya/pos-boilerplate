import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { InvoicePaper } from "@/features/invoices/components/invoice-paper";
import { InvoiceToolbar } from "@/features/invoices/components/invoice-toolbar";
import { getInvoiceDocument, INVOICE_LINK_DAYS, invoiceLabels } from "@/features/invoices/service";
import { invoiceSizes, isInvoiceSize } from "@/features/invoices/types";
import { routing } from "@/i18n/routing";
import { requirePermission } from "@/lib/auth/guard";
import { readSetting } from "@/lib/settings/store";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Invoice");
  return { title: t("pageTitle") };
}

const tenderedParam = z.coerce.number().int().min(0).max(999_999_999_999);

/**
 * Print view (FR-INV-01..05). `size` picks the paper, `lang` the invoice
 * language independent of the UI, `print=1` opens the print dialog and
 * `tendered` shows cash received and change, which only the checkout knows.
 */
export default async function PrintInvoicePage({
  params,
  searchParams,
}: PageProps<"/[locale]/print/invoices/[id]">) {
  const { id } = await params;
  const session = await requirePermission("page:pos");
  if (!z.uuid().safeParse(id).success) notFound();

  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const [locale, operations, t] = await Promise.all([
    getLocale(),
    readSetting("operations"),
    getTranslations("Invoice"),
  ]);
  const requestedLang = first(query.lang);
  const lang = requestedLang && hasLocale(routing.locales, requestedLang) ? requestedLang : locale;
  const requestedSize = first(query.size);
  const size = isInvoiceSize(requestedSize) ? requestedSize : operations.paperSize;

  const document = await getInvoiceDocument(session, id, lang);
  if (!document) notFound();
  const labels = invoiceLabels(lang, document);

  const tendered = tenderedParam.safeParse(first(query.tendered));
  const cashPaid = document.payments
    .filter((payment) => payment.method === "CASH")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const change =
    tendered.success && cashPaid > 0 && tendered.data >= cashPaid
      ? { received: tendered.data, change: tendered.data - cashPaid }
      : null;

  const href = (overrides: { size?: string; lang?: string }) => {
    const search = new URLSearchParams({
      size: overrides.size ?? size,
      lang: overrides.lang ?? lang,
    });
    return `/print/invoices/${id}?${search.toString()}`;
  };

  return (
    <>
      <InvoiceToolbar
        locale={locale}
        saleId={id}
        invoiceNo={document.invoiceNo}
        lang={lang}
        size={size}
        pdfHref={`/api/v1/sales/${id}/invoice?${new URLSearchParams({ size, lang }).toString()}`}
        backHref={`/pos/sales/${id}`}
        autoPrint={first(query.print) === "1"}
        sizes={invoiceSizes.map((option) => ({
          label: t(`sizes.${option}`),
          href: href({ size: option }),
          active: option === size,
        }))}
        languages={routing.locales.map((option) => ({
          label: option.toUpperCase(),
          href: href({ lang: option }),
          active: option === lang,
        }))}
        labels={{
          toolbar: t("toolbarLabel"),
          paperSize: t("paperSize"),
          language: t("language"),
          print: t("print"),
          download: t("download"),
          share: t("share"),
          copyLink: t("copyLink"),
          linkCopied: t("linkCopied", { days: INVOICE_LINK_DAYS }),
          linkReady: t("linkReady", { days: INVOICE_LINK_DAYS }),
          linkFailed: t("linkFailed"),
          shareFailed: t("shareFailed"),
          back: t("back"),
        }}
      />
      <h1 className="sr-only">{`${labels.invoice} ${document.invoiceNo}`}</h1>
      <InvoicePaper document={document} labels={labels} size={size} tendered={change} />
    </>
  );
}
