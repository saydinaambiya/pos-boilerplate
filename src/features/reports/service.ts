import "server-only";

import { db } from "@/db/client";
import { listRevisions } from "@/features/deposits/repository";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { startOfNextZonedDay, startOfZonedDay, storeDate } from "@/lib/format/zoned-time";
import { readSetting } from "@/lib/settings/store";

import {
  bankAccountLabels,
  creditCollected,
  creditGiven,
  depositsBefore,
  depositsByDay,
  drawerFlowsByDay,
  expensesByCategory,
  expensesByDay,
  listDeposits,
  manualDiscounts,
  moneyInByDay,
  onlineByDay,
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
import { recapPeriod, reportRange } from "./schemas";

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

/**
 * The money recap of one store day or month (FR-RPT-06/07, ADR-0032).
 * Money in splits into bank accounts (transfer, QRIS), the cash drawer and
 * salespeople's cash, which is recorded in the Sales menu and never enters
 * the drawer; marketplace orders are a line of their own. The drawer
 * balance follows the physical cash: the balance before the period, plus
 * the float cashiers added, cash in and the variance counted at close,
 * minus staff expenses and ATM deposits. It is what the next drawer shift
 * carries over. Shifts from before drawer tracking count as money in but
 * not in the balance.
 */
export async function getCashRecap(
  session: Session,
  raw: { day?: string | undefined; month?: string | undefined },
  now = new Date(),
) {
  assertPermission(session, "report:view");
  const { timeZone } = await readSetting("operations");
  const period = recapPeriod(raw, storeDate(now, timeZone));
  const window = await windowFor(period.from, period.to);
  const before = { start: new Date(0), end: window.start, timeZone };

  const [
    received,
    flows,
    online,
    depositedByDay,
    receivedBefore,
    flowsBefore,
    depositedBefore,
    accounts,
    deposits,
  ] = await Promise.all([
    moneyInByDay(window),
    drawerFlowsByDay(window),
    onlineByDay(window),
    depositsByDay(period.from, period.to),
    moneyInByDay(before),
    drawerFlowsByDay(before),
    depositsBefore(period.from),
    bankAccountLabels(),
    listDeposits(period.from, period.to),
  ]);

  type Received = (typeof received)[number];
  const sum = (rows: readonly { total: number }[]) =>
    rows.reduce((total, row) => total + row.total, 0);
  const onDay = <Row extends { day: string }>(rows: readonly Row[], day: string) =>
    rows.filter((row) => row.day === day);
  const toAccount = (rows: readonly Received[]) => rows.filter((row) => row.method !== "CASH");
  const cash = (rows: readonly Received[]) => rows.filter((row) => row.method === "CASH");
  const drawerCash = (rows: readonly Received[]) =>
    cash(rows).filter((row) => row.kind === "DRAWER");
  const storeCash = (rows: readonly Received[]) => cash(rows).filter((row) => row.kind !== "SALES");
  const drawerChange = (rows: readonly Received[], moves: typeof flows, deposited: number) =>
    sum(drawerCash(rows)) + sum(moves.added) + sum(moves.counted) - sum(moves.spent) - deposited;

  const byAccount = accounts
    .map((account) => ({
      ...account,
      total: sum(toAccount(received).filter((row) => row.bankAccountId === account.id)),
    }))
    .filter((account) => account.total > 0);

  const opening = drawerChange(receivedBefore, flowsBefore, depositedBefore);
  let balance = opening;
  const days: {
    day: string;
    account: number;
    cash: number;
    expenses: number;
    deposited: number;
    balance: number;
    active: boolean;
  }[] = [];
  for (let day = period.from; day <= period.to; day = nextDay(day)) {
    const dayReceived = onDay(received, day);
    const moves = {
      added: onDay(flows.added, day),
      spent: onDay(flows.spent, day),
      counted: onDay(flows.counted, day),
    };
    const deposited = sum(onDay(depositedByDay, day));
    balance += drawerChange(dayReceived, moves, deposited);
    days.push({
      day,
      account: sum(toAccount(dayReceived)),
      cash: sum(storeCash(dayReceived)),
      expenses: sum(moves.spent),
      deposited,
      balance,
      active:
        dayReceived.length + moves.added.length + moves.spent.length + moves.counted.length > 0 ||
        deposited > 0 ||
        onDay(online, day).length > 0,
    });
  }

  const history = await listRevisions(
    db,
    deposits.map((row) => row.id),
  );
  const account = sum(toAccount(received));
  const storeCashIn = sum(storeCash(received));
  const salesCash = sum(cash(received)) - storeCashIn;
  return {
    period,
    moneyIn: {
      total: account + storeCashIn + salesCash,
      account,
      transfer: sum(toAccount(received).filter((row) => row.method === "TRANSFER")),
      qris: sum(toAccount(received).filter((row) => row.method === "QRIS")),
      byAccount,
      cash: storeCashIn,
      salesCash,
      marketplace: sum(online),
    },
    drawer: {
      opening,
      added: sum(flows.added),
      cashIn: sum(drawerCash(received)),
      expenses: sum(flows.spent),
      deposited: sum(depositedByDay),
      variance: sum(flows.counted),
      balance,
    },
    days,
    deposits: deposits.map((row) => ({
      ...row,
      revisions: history.filter((revision) => revision.depositId === row.id),
    })),
    accountLabels: Object.fromEntries(
      accounts.map((row) => [row.id, `${row.bankName} ${row.accountNo}`]),
    ) as Record<string, string>,
    accounts: accounts.filter((row) => row.isActive),
  };
}

export type CashRecap = Awaited<ReturnType<typeof getCashRecap>>;

const nextDay = (isoDate: string) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
