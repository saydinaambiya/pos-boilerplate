import "server-only";

import type { Locale } from "@/config/locales";
import { translatorFor } from "@/lib/i18n/translator";
import { basisPointsToPercent } from "@/lib/settings/rates";

import { type CsvColumn, csvLines } from "./csv";
import type { ReportSection } from "./schemas";
import type { SalesReport } from "./service";

type Column = CsvColumn<Record<string, unknown>>;

const field =
  (key: string) =>
  (row: Record<string, unknown>): string | number | null => {
    const value = row[key];
    return typeof value === "number" || typeof value === "string" ? value : null;
  };

/**
 * CSV lines for one report section in the chosen language (FR-RPT-05).
 * Amounts are plain integer rupiah so spreadsheets can sum them.
 */
export function reportCsv(report: SalesReport, section: ReportSection, locale: Locale) {
  const t = translatorFor(locale, "Reports");
  const col = (header: string, key: string): Column => ({ header, value: field(key) });
  const lineColumns = [
    col(t("qty"), "qty"),
    col(t("discounts"), "discounts"),
    col(t("revenue"), "revenue"),
  ];

  const sections: Record<ReportSection, { rows: Record<string, unknown>[]; columns: Column[] }> = {
    daily: {
      rows: report.daily,
      columns: [
        col(t("day"), "day"),
        col(t("transactions"), "count"),
        col(t("netSales"), "net"),
        col(t("grandTotal"), "grandTotal"),
        col(t("expenses"), "expenses"),
        col(t("balance"), "balance"),
      ],
    },
    expenses: {
      rows: report.expenses.map((row) => ({
        ...row,
        label: translatorFor(locale, "Expenses")(`categories.${row.category}`),
      })),
      columns: [
        col(t("expenseCategory"), "label"),
        col(t("entries"), "count"),
        col(t("total"), "total"),
      ],
    },
    methods: {
      rows: report.methods.map((row) => ({ ...row, label: t(`methods.${row.method}`) })),
      columns: [
        col(t("method"), "label"),
        col(t("transactions"), "count"),
        col(t("total"), "total"),
      ],
    },
    products: { rows: report.products, columns: [col(t("product"), "name"), ...lineColumns] },
    variants: {
      rows: report.variants,
      columns: [
        col(t("sku"), "sku"),
        col(t("product"), "name"),
        col(t("color"), "color"),
        ...lineColumns,
      ],
    },
    brands: {
      rows: report.brands.map((row) => ({ ...row, name: row.name ?? t("noBrand") })),
      columns: [col(t("brand"), "name"), ...lineColumns],
    },
    employees: {
      rows: report.employees,
      columns: [
        col(t("employee"), "name"),
        col(t("transactions"), "count"),
        col(t("grandTotal"), "grandTotal"),
      ],
    },
    vouchers: {
      rows: report.vouchers,
      columns: [col(t("voucher"), "code"), col(t("uses"), "uses"), col(t("discount"), "discount")],
    },
    tax: {
      rows: report.tax.map((row) => ({
        ...row,
        ppnRate: `${basisPointsToPercent(row.ppnRateBps)}%`,
        serviceRate: `${basisPointsToPercent(row.serviceRateBps)}%`,
        mode: row.priceIncludesTax ? t("inclusive") : t("exclusive"),
      })),
      columns: [
        col(t("ppnRate"), "ppnRate"),
        col(t("serviceRate"), "serviceRate"),
        col(t("taxMode"), "mode"),
        col(t("transactions"), "count"),
        col(t("taxBase"), "base"),
        col(t("service"), "service"),
        col(t("ppn"), "ppn"),
      ],
    },
  };
  const { rows, columns } = sections[section];
  return csvLines(rows, columns);
}
