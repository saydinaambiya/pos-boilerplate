import "server-only";

import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { startOfNextZonedDay, startOfZonedDay, storeDate } from "@/lib/format/zoned-time";
import { readSetting } from "@/lib/settings/store";

import {
  creditCollected,
  creditGiven,
  manualDiscounts,
  onlineSummary,
  paymentsByMethod,
  type ReportWindow,
  salesByBrand,
  salesByDay,
  salesByEmployee,
  salesByProduct,
  salesByVariant,
  salesSummary,
  taxByRate,
  todayFigures,
  voucherUsage,
} from "./repository";
import { reportRange } from "./schemas";

async function windowFor(from: string, to: string): Promise<ReportWindow> {
  const { timeZone } = await readSetting("operations");
  const start = startOfZonedDay(from, timeZone);
  const end = startOfNextZonedDay(to, timeZone);
  if (!start || !end) throw new Error("Invalid report range");
  return { start, end, timeZone };
}

/** Removes cost and margin unless the viewer may see profit (FR-RPT-02). */
function withProfit<Row extends { cogs: number; revenue: number }>(rows: Row[], profit: boolean) {
  return rows.map(({ cogs, ...row }) =>
    profit ? { ...row, cogs, margin: row.revenue - cogs } : { ...row, cogs: null, margin: null },
  );
}

/**
 * The sales report for a store-day range (FR-RPT-01..04). Voided sales
 * never count; marketplace orders count unless cancelled or returned. Cost,
 * margin and gross profit are only returned with `report:view-profit`.
 */
export async function getSalesReport(
  session: Session,
  raw: { from?: string | undefined; to?: string | undefined },
  now = new Date(),
) {
  assertPermission(session, "report:view");
  const { timeZone } = await readSetting("operations");
  const range = reportRange(raw, storeDate(now, timeZone));
  const window = await windowFor(range.from, range.to);
  const profit = session.permissions.has("report:view-profit");

  const [
    summary,
    online,
    daily,
    byMethod,
    credit,
    collected,
    products,
    variants,
    brands,
    employees,
    voucherRows,
    manual,
    tax,
  ] = await Promise.all([
    salesSummary(window),
    onlineSummary(window),
    salesByDay(window),
    paymentsByMethod(window),
    creditGiven(window),
    creditCollected(window),
    salesByProduct(window),
    salesByVariant(window),
    salesByBrand(window),
    salesByEmployee(window),
    voucherUsage(window),
    manualDiscounts(window),
    taxByRate(window),
  ]);

  const methodTotal = (method: string) => byMethod.find((row) => row.method === method);
  const netSales = summary.grandTotal - summary.ppn - summary.service;
  return {
    range,
    profit,
    summary: {
      ...summary,
      netSales,
      average: summary.count === 0 ? 0 : Math.round(summary.grandTotal / summary.count),
      cogs: profit ? summary.cogs : null,
      grossProfit: profit ? netSales - summary.cogs : null,
    },
    online: {
      ...online,
      cogs: profit ? online.cogs : null,
      grossProfit: profit ? online.itemsTotal - online.cogs : null,
    },
    daily,
    methods: [
      {
        method: "CASH",
        count: methodTotal("CASH")?.count ?? 0,
        total: methodTotal("CASH")?.total ?? 0,
      },
      {
        method: "TRANSFER",
        count: methodTotal("TRANSFER")?.count ?? 0,
        total: methodTotal("TRANSFER")?.total ?? 0,
      },
      { method: "KASBON", count: credit.count, total: credit.total },
      { method: "MARKETPLACE", count: online.count, total: online.itemsTotal },
    ] as const,
    creditCollected: collected,
    products: withProfit(products, profit),
    variants: withProfit(variants, profit),
    brands: withProfit(brands, profit),
    employees,
    vouchers: voucherRows,
    manualDiscounts: manual,
    tax,
  };
}

export type SalesReport = Awaited<ReturnType<typeof getSalesReport>>;

/** Today's sales count, total and average for the dashboard (FR-DSH-01); null without access. */
export async function getTodaySales(session: Session, now = new Date()) {
  if (!session.permissions.has("report:view")) return null;
  const { timeZone } = await readSetting("operations");
  const today = storeDate(now, timeZone);
  const figures = await todayFigures(await windowFor(today, today));
  return {
    ...figures,
    average: figures.count === 0 ? 0 : Math.round(figures.grandTotal / figures.count),
  };
}
