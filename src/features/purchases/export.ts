import "server-only";

import type { Locale } from "@/config/locales";
import { type CsvColumn, csvLines } from "@/features/reports/csv";
import { translatorFor } from "@/lib/i18n/translator";

import type { queryAllPurchases } from "./repository";

export type PurchaseExportRow = Awaited<ReturnType<typeof queryAllPurchases>>[number];

/**
 * Formats supplier bills as CSV lines in the requested locale (FR-PRB-04).
 * Amounts are plain integer rupiah so spreadsheets can sum them.
 * In Indonesian Excel, the list separator is semicolon (;) so rows split
 * into columns properly on open.
 */
export function purchasesCsv(rows: Iterable<PurchaseExportRow>, locale: Locale) {
  const t = translatorFor(locale, "Purchases");
  const delimiter = locale === "id" ? ";" : ",";
  const columns: CsvColumn<PurchaseExportRow>[] = [
    { header: t("invoiceNo"), value: (r) => r.invoiceNo },
    { header: t("companyName"), value: (r) => r.companyName },
    { header: t("orderDate"), value: (r) => r.orderDate },
    { header: t("dueDate"), value: (r) => r.dueDate ?? "" },
    { header: t("total"), value: (r) => r.total },
    { header: t("paid"), value: (r) => r.paidTotal },
    { header: t("balance"), value: (r) => r.balance },
    { header: t("status"), value: (r) => t(`statuses.${r.status}`) },
    { header: t("note"), value: (r) => r.note ?? "" },
  ];
  return csvLines(rows, columns, delimiter);
}
