import "server-only";

import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { startOfNextZonedDay, startOfZonedDay, storeDate } from "@/lib/format/zoned-time";
import { readSetting } from "@/lib/settings/store";

import {
  creditCollected,
  creditGiven,
  expensesByCategory,
  expensesByDay,
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

/**
 * The sales report for a store-day range (FR-RPT-01..04). Voided sales
 * never count; marketplace orders count unless cancelled or returned.
 * Staff expenses paid from the drawer are listed per day and kind, and the
 * balance is sales minus expenses (FR-EXP-02). The
 * store tracks sales results only, so no cost or profit is reported
 * (FR-RPT-02, ADR-0027).
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
    spentByDay,
    spentByCategory,
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
    expensesByDay(window),
    expensesByCategory(window),
  ]);

  const methodTotal = (method: string) => byMethod.find((row) => row.method === method);
  const expenses = spentByCategory.reduce((sum, row) => sum + row.total, 0);
  const days = [...new Set([...daily.map((row) => row.day), ...spentByDay.map((row) => row.day)])];
  const netSales = summary.grandTotal - summary.ppn - summary.service;
  return {
    range,
    summary: {
      ...summary,
      netSales,
      average: summary.count === 0 ? 0 : Math.round(summary.grandTotal / summary.count),
      expenses,
      balance: summary.grandTotal - expenses,
    },
    online,
    daily: days.sort().map((day) => {
      const sold = daily.find((row) => row.day === day);
      const spent = spentByDay.find((row) => row.day === day)?.total ?? 0;
      const grandTotal = sold?.grandTotal ?? 0;
      return {
        day,
        count: sold?.count ?? 0,
        grandTotal,
        net: sold?.net ?? 0,
        expenses: spent,
        balance: grandTotal - spent,
      };
    }),
    expenses: spentByCategory,
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
      {
        method: "QRIS",
        count: methodTotal("QRIS")?.count ?? 0,
        total: methodTotal("QRIS")?.total ?? 0,
      },
      { method: "KASBON", count: credit.count, total: credit.total },
      { method: "MARKETPLACE", count: online.count, total: online.itemsTotal },
    ] as const,
    creditCollected: collected,
    products,
    variants,
    brands,
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
