import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReportSection } from "@/features/reports/schemas";
import type { SalesReport } from "@/features/reports/service";
import { formatCurrency } from "@/lib/format/currency";
import { basisPointsToPercent } from "@/lib/settings/rates";

import { ReportCard } from "./report-card";

type LineRow = Omit<SalesReport["products"][number], "id" | "name"> & { id: string | null };

/** Rows shown per table; the CSV always has every row. */
const TABLE_ROWS = 50;

/**
 * The detailed sales results of a recap period (FR-RPT-01..05): totals,
 * expenses per kind, payment methods, products, variants, brands,
 * employees, vouchers and tax, each with its CSV. The recap folds them
 * under "more details" so the money figures read first (ADR-0032).
 */
export async function SalesDetails({ report }: { report: SalesReport }) {
  const [t, tExpenses, locale] = await Promise.all([
    getTranslations("Reports"),
    getTranslations("Expenses"),
    getLocale(),
  ]);
  const money = (amount: number) => formatCurrency(amount, locale);
  const { from, to } = report.range;
  const csv = (section: ReportSection) =>
    `/api/v1/reports/${section}?from=${from}&to=${to}&lang=${locale}`;
  const card = (section: ReportSection, children: ReactNode) => (
    <ReportCard
      id={`report-${section}`}
      title={t(`sections.${section}`)}
      csvHref={csv(section)}
      csvLabel={t("downloadCsv", { section: t(`sections.${section}`) })}
    >
      {children}
    </ReportCard>
  );
  const stat = (label: string, value: string, hint?: string) => (
    <div className="flex flex-col gap-1 rounded-card bg-surface p-5 shadow-card">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-xl font-semibold text-ink tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-ink-muted">{hint}</dd> : null}
    </div>
  );
  const empty = <p className="text-sm text-ink-muted">{t("noData")}</p>;
  const truncated = (count: number) =>
    count > TABLE_ROWS ? (
      <p className="mt-2 text-xs text-ink-muted">{t("truncated", { shown: TABLE_ROWS, count })}</p>
    ) : null;

  const lineTable = <Row extends LineRow>(
    caption: string,
    rows: Row[],
    label: (row: Row) => ReactNode,
  ) =>
    rows.length === 0 ? (
      empty
    ) : (
      <>
        <Table>
          <TableCaption>{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead className="text-right">{t("qty")}</TableHead>
              <TableHead className="text-right">{t("revenue")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, TABLE_ROWS).map((row) => (
              <TableRow key={row.id ?? "none"}>
                <TableCell className="[overflow-wrap:anywhere]">{label(row)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.qty}</TableCell>
                <TableCell className="text-right tabular-nums">{money(row.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {truncated(rows.length)}
      </>
    );

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stat(t("netSales"), money(report.summary.netSales), t("netSalesHint"))}
        {stat(t("grandTotal"), money(report.summary.grandTotal), t("grandTotalHint"))}
        {stat(
          t("transactions"),
          String(report.summary.count),
          t("averageHint", { amount: money(report.summary.average) }),
        )}
        {stat(
          t("marketplace"),
          money(report.online.itemsTotal),
          t("marketplaceHint", { count: report.online.count }),
        )}
      </dl>

      <div className="grid gap-6 xl:grid-cols-2">
        {card(
          "methods",
          <>
            <Table>
              <TableCaption>{t("methodsCaption")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("method")}</TableHead>
                  <TableHead className="text-right">{t("transactions")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.methods.map((row) => (
                  <TableRow key={row.method}>
                    <TableCell>{t(`methods.${row.method}`)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-sm text-ink-muted">
              {t("creditCollected", {
                amount: money(report.creditCollected.total),
                count: report.creditCollected.count,
              })}
            </p>
          </>,
        )}

        {card(
          "expenses",
          report.expenses.length === 0 ? (
            empty
          ) : (
            <Table>
              <TableCaption>{t("expensesCaption")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("expenseCategory")}</TableHead>
                  <TableHead className="text-right">{t("entries")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.expenses.map((row) => (
                  <TableRow key={row.category}>
                    <TableCell>{tExpenses(`categories.${row.category}`)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ),
        )}

        {card(
          "products",
          lineTable(t("productsCaption"), report.products, (row) => row.name),
        )}
        {card(
          "variants",
          lineTable(t("variantsCaption"), report.variants, (row) => (
            <>
              {row.color ? `${row.name} — ${row.color}` : row.name}
              <span className="block text-xs text-ink-muted">{row.sku}</span>
            </>
          )),
        )}
        {card(
          "brands",
          lineTable(t("brandsCaption"), report.brands, (row) => row.name ?? t("noBrand")),
        )}

        {card(
          "employees",
          report.employees.length === 0 ? (
            empty
          ) : (
            <Table>
              <TableCaption>{t("employeesCaption")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("employee")}</TableHead>
                  <TableHead className="text-right">{t("transactions")}</TableHead>
                  <TableHead className="text-right">{t("grandTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.employees.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.grandTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ),
        )}

        {card(
          "vouchers",
          <>
            {report.vouchers.length === 0 ? (
              empty
            ) : (
              <Table>
                <TableCaption>{t("vouchersCaption")}</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("voucher")}</TableHead>
                    <TableHead className="text-right">{t("uses")}</TableHead>
                    <TableHead className="text-right">{t("discount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.vouchers.map((row) => (
                    <TableRow key={row.code}>
                      <TableCell>{row.code}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.uses}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(row.discount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="mt-3 text-sm text-ink-muted">
              {t("manualDiscounts", {
                amount: money(report.manualDiscounts.total),
                count: report.manualDiscounts.lines,
              })}
            </p>
          </>,
        )}

        {card(
          "tax",
          report.tax.length === 0 ? (
            empty
          ) : (
            <Table>
              <TableCaption>{t("taxCaption")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("rates")}</TableHead>
                  <TableHead className="text-right">{t("taxBase")}</TableHead>
                  <TableHead className="text-right">{t("service")}</TableHead>
                  <TableHead className="text-right">{t("ppn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.tax.map((row) => (
                  <TableRow
                    key={`${String(row.ppnRateBps)}-${String(row.serviceRateBps)}-${String(row.priceIncludesTax)}`}
                  >
                    <TableCell className="text-sm">
                      {t("rateLabel", {
                        ppn: `${basisPointsToPercent(row.ppnRateBps)}%`,
                        service: `${basisPointsToPercent(row.serviceRateBps)}%`,
                      })}
                      <span className="block text-xs text-ink-muted">
                        {`${row.priceIncludesTax ? t("inclusive") : t("exclusive")} · ${t("transactionsCount", { count: row.count })}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.base)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.service)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.ppn)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ),
        )}
      </div>
    </div>
  );
}
