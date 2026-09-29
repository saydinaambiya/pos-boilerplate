import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { paymentMethods } from "@/db/schema";
import { formatCurrency } from "@/lib/format/currency";
import { cn } from "@/lib/utils/cn";

interface ShiftFiguresProps {
  shift: {
    cashierName: string;
    openedAt: Date;
    closedAt: Date | null;
    openingCash: number;
    expectedCash: number;
    countedCash: number | null;
    variance: number | null;
    totals: {
      byMethod: Partial<Record<(typeof paymentMethods)[number], number>>;
      expenses: number;
      kasbonIssued: number;
      kasbonCollected: Partial<Record<(typeof paymentMethods)[number], number>>;
      salesCount: number;
      voidCount: number;
      revenue: number;
    };
  };
}

/** Variance as text with its sign spelled out, not only coloured (FR-UI-05). */
export async function VarianceText({ variance }: { variance: number }) {
  const [t, locale] = await Promise.all([getTranslations("Shifts"), getLocale()]);
  const amount = formatCurrency(Math.abs(variance), locale);
  if (variance === 0) return <span>{t("varianceZero")}</span>;
  return (
    <span className={cn("font-medium", variance < 0 && "text-danger-ink")}>
      {variance > 0 ? t("varianceOver", { amount }) : t("varianceShort", { amount })}
    </span>
  );
}

/**
 * Key figures of a shift, its totals per payment method, store credit given
 * and store credit payments taken (FR-SHF-03/04, FR-KSB-03).
 */
export async function ShiftFigures({ shift }: ShiftFiguresProps) {
  const [t, format, locale] = await Promise.all([
    getTranslations("Shifts"),
    getFormatter(),
    getLocale(),
  ]);
  const money = (amount: number) => formatCurrency(amount, locale);
  const stat = (label: string, value: ReactNode, hint?: string) => (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-lg font-semibold text-ink tabular-nums">{value}</dd>
      {hint ? <dd className="text-xs text-ink-muted">{hint}</dd> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat(t("cashier"), shift.cashierName)}
        {stat(
          t("openedAt", {
            time: format.dateTime(shift.openedAt, { dateStyle: "medium", timeStyle: "short" }),
          }),
          money(shift.openingCash),
          t("openingCashShort"),
        )}
        {stat(
          t("salesCount"),
          shift.totals.salesCount,
          `${t("voids")}: ${String(shift.totals.voidCount)}`,
        )}
        {stat(t("revenue"), money(shift.totals.revenue))}
        {stat(t("expenses"), money(shift.totals.expenses), t("expensesHint"))}
        {stat(t("expectedCash"), money(shift.expectedCash), t("expectedHint"))}
        {shift.countedCash !== null ? stat(t("countedCashShort"), money(shift.countedCash)) : null}
        {shift.variance !== null
          ? stat(t("variance"), <VarianceText variance={shift.variance} />)
          : null}
        {shift.closedAt
          ? stat(
              t("closedAt"),
              format.dateTime(shift.closedAt, { dateStyle: "medium", timeStyle: "short" }),
            )
          : null}
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">{t("byMethod")}</h3>
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {paymentMethods.map((method) => (
            <div
              key={method}
              className="flex justify-between gap-3 rounded-control bg-surface-muted px-3 py-2 text-sm"
            >
              <dt className="text-ink-muted">{t(`methods.${method}`)}</dt>
              <dd className="font-medium tabular-nums">
                {money(
                  method === "KASBON"
                    ? shift.totals.kasbonIssued
                    : (shift.totals.byMethod[method] ?? 0),
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">{t("kasbonCollected")}</h3>
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(["CASH", "TRANSFER"] as const).map((method) => (
            <div
              key={method}
              className="flex justify-between gap-3 rounded-control bg-surface-muted px-3 py-2 text-sm"
            >
              <dt className="text-ink-muted">{t(`methods.${method}`)}</dt>
              <dd className="font-medium tabular-nums">
                {money(shift.totals.kasbonCollected[method] ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
