import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { FilterForm } from "@/components/form/filter-form";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toneClasses } from "@/components/ui/tone";
import { ReportCard } from "@/features/reports/components/report-card";
import type { ReportSection } from "@/features/reports/schemas";
import { getSalesReport, type SalesReport } from "@/features/reports/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { storeDate } from "@/lib/format/zoned-time";
import { basisPointsToPercent } from "@/lib/settings/rates";
import { readSetting } from "@/lib/settings/store";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Reports");
  return { title: t("title") };
}

type LineRow = SalesReport["products"][number];

/** Rows shown per table; the CSV always has every row. */
const TABLE_ROWS = 50;

const shift = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Sales report for a store-day range (FR-RPT-01..05): summary, per day,
 * per payment method, per product, variant, category and employee,
 * vouchers and manual discounts, and PPN/service. Cost and margin appear
 * only with `report:view-profit`.
 */
export default async function ReportsPage({ searchParams }: PageProps<"/[locale]/reports">) {
  await requirePermission("page:reports");
  const session = await requirePermission("report:view");
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const [t, format, locale, report, operations] = await Promise.all([
    getTranslations("Reports"),
    getFormatter(),
    getLocale(),
    getSalesReport(session, { from: first(raw.from), to: first(raw.to) }),
    readSetting("operations"),
  ]);
  const money = (amount: number) => formatCurrency(amount, locale);
  const { from, to } = report.range;
  const today = storeDate(new Date(), operations.timeZone);
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = shift(monthStart, -1);
  const presets = [
    { label: t("presetToday"), from: today, to: today },
    { label: t("preset7"), from: shift(today, -6), to: today },
    { label: t("presetMonth"), from: monthStart, to: today },
    { label: t("presetLastMonth"), from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd },
  ];
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
              {report.profit ? (
                <>
                  <TableHead className="text-right">{t("cogs")}</TableHead>
                  <TableHead className="text-right">{t("margin")}</TableHead>
                </>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, TABLE_ROWS).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="[overflow-wrap:anywhere]">{label(row)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.qty}</TableCell>
                <TableCell className="text-right tabular-nums">{money(row.revenue)}</TableCell>
                {report.profit ? (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {money(row.cogs ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.margin ?? 0)}
                    </TableCell>
                  </>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {truncated(rows.length)}
      </>
    );

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <Card className="mb-6 flex flex-col gap-4">
        <FilterForm applyLabel={t("apply")} className="flex flex-wrap items-end gap-3">
          <Field label={t("from")} className="min-w-48">
            {(control) => <DatePicker {...control} name="from" defaultValue={from} max={today} />}
          </Field>
          <Field label={t("to")} className="min-w-48">
            {(control) => <DatePicker {...control} name="to" defaultValue={to} max={today} />}
          </Field>
        </FilterForm>
        <nav aria-label={t("presets")} className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const active = preset.from === from && preset.to === to;
            return (
              <Link
                key={preset.label}
                href={{ pathname: "/reports", query: { from: preset.from, to: preset.to } }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
                  active ? "border-primary bg-primary text-primary-ink" : "border-border text-ink",
                )}
              >
                {preset.label}
              </Link>
            );
          })}
        </nav>
        {report.range.clipped ? (
          <p role="status" className={cn("rounded-control px-3 py-2 text-sm", toneClasses.warning)}>
            {t("clipped")}
          </p>
        ) : null}
      </Card>

      <section aria-labelledby="report-summary" className="mb-6">
        <h2 id="report-summary" className="mb-3 text-lg font-semibold text-ink">
          {t("summaryTitle", {
            from: format.dateTime(new Date(`${from}T00:00:00Z`), {
              dateStyle: "medium",
              timeZone: "UTC",
            }),
            to: format.dateTime(new Date(`${to}T00:00:00Z`), {
              dateStyle: "medium",
              timeZone: "UTC",
            }),
          })}
        </h2>
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
          {report.summary.grossProfit !== null
            ? stat(
                t("grossProfit"),
                money(report.summary.grossProfit),
                t("grossProfitHint", { cogs: money(report.summary.cogs ?? 0) }),
              )
            : null}
          {report.online.grossProfit !== null
            ? stat(t("marketplaceProfit"), money(report.online.grossProfit))
            : null}
        </dl>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {card(
          "daily",
          report.daily.length === 0 ? (
            empty
          ) : (
            <Table>
              <TableCaption>{t("dailyCaption")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("day")}</TableHead>
                  <TableHead className="text-right">{t("transactions")}</TableHead>
                  <TableHead className="text-right">{t("grandTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.daily.map((row) => (
                  <TableRow key={row.day}>
                    <TableCell>
                      {format.dateTime(new Date(`${row.day}T00:00:00Z`), {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </TableCell>
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
          "categories",
          lineTable(t("categoriesCaption"), report.categories, (row) => row.name),
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
    </>
  );
}
