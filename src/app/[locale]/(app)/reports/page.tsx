import { ChevronLeft, ChevronRight, Landmark, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { ActionForm } from "@/components/form/action-form";
import { ConfirmAction } from "@/components/form/confirm-action";
import { FilterForm } from "@/components/form/filter-form";
import { FormDateField, FormField, FormSelect } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { RouteDialog } from "@/components/ui/route-dialog";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cancelDepositAction,
  editDepositAction,
  recordDepositAction,
} from "@/features/deposits/actions";
import { SalesDetails } from "@/features/reports/components/sales-details";
import { getCashRecap, getSalesReport } from "@/features/reports/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { storeDate } from "@/lib/format/zoned-time";
import { readSetting } from "@/lib/settings/store";
import { cn } from "@/lib/utils/cn";
import { firstParam } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Reports");
  return { title: t("title") };
}

/** Months offered in the month picker, newest first. */
const MONTH_CHOICES = 24;

/**
 * The money recap of one store day or month (FR-RPT-06/07, ADR-0032):
 * money received into bank accounts and into the drawer, marketplace on
 * its own line, then the drawer balance after staff expenses and ATM
 * deposits, which carries over to the next day. A month adds one row per
 * day. The sales details fold underneath (FR-RPT-01..05). `?deposit=1`
 * records a deposit (ADR-0018).
 */
export default async function ReportsPage({ searchParams }: PageProps<"/[locale]/reports">) {
  await requirePermission("page:reports");
  const session = await requirePermission("report:view");
  const raw = await searchParams;
  const query = { day: firstParam(raw.day), month: firstParam(raw.month) };
  const [t, tCommon, format, locale, recap, operations] = await Promise.all([
    getTranslations("Reports"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    getCashRecap(session, query),
    readSetting("operations"),
  ]);
  const { period, moneyIn, drawer } = recap;
  const report = await getSalesReport(session, { from: period.from, to: period.to });
  const canDeposit = session.permissions.has("cash:deposit");
  const depositing = canDeposit && firstParam(raw.deposit) === "1";
  const editing = canDeposit
    ? recap.deposits.find((row) => row.id === firstParam(raw.editDeposit) && !row.cancelledAt)
    : undefined;
  const money = (amount: number) => formatCurrency(amount, locale);
  const today = storeDate(new Date(), operations.timeZone);
  const kept = period.kind === "day" ? { day: period.day } : { month: period.month };
  const keptQuery = period.kind === "day" ? `day=${period.day}` : `month=${period.month}`;

  const dayLabel = (day: string, style: "long" | "short") =>
    format.dateTime(new Date(`${day}T00:00:00Z`), {
      weekday: style,
      day: "numeric",
      month: style,
      ...(style === "long" ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  const monthLabel = (month: string) =>
    format.dateTime(new Date(`${month}-01T00:00:00Z`), {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const step = (value: string) => (period.kind === "day" ? { day: value } : { month: value });
  const months = Array.from({ length: MONTH_CHOICES }, (_, index) => {
    const date = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - index);
    const value = date.toISOString().slice(0, 7);
    return { value, label: monthLabel(value) };
  });

  const tab = (kind: "day" | "month", label: string, target: Record<string, string>) => (
    <Link
      href={{ pathname: "/reports", query: target }}
      aria-current={period.kind === kind ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-medium sm:flex-none",
        period.kind === kind ? "bg-primary text-primary-ink" : "text-ink",
      )}
    >
      {label}
    </Link>
  );
  const line = (label: string, amount: string, options?: { strong?: boolean; hint?: string }) => (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2",
        options?.strong && "border-t border-border pt-3",
      )}
    >
      <dt className={cn("text-sm", options?.strong ? "font-semibold text-ink" : "text-ink-muted")}>
        {label}
        {options?.hint ? (
          <span className="block text-xs font-normal text-ink-muted">{options.hint}</span>
        ) : null}
      </dt>
      <dd
        className={cn(
          "tabular-nums",
          options?.strong ? "text-2xl font-semibold text-ink" : "text-base text-ink",
        )}
      >
        {amount}
      </dd>
    </div>
  );
  const figure = (icon: ReactNode, label: string, amount: number, hint: string) => (
    <div className="flex flex-col gap-1 rounded-control bg-surface-muted p-4">
      <dt className="flex items-center gap-2 text-sm text-ink-muted [&_svg]:size-4">
        {icon}
        {label}
      </dt>
      <dd className="text-xl font-semibold text-ink tabular-nums">{money(amount)}</dd>
      <dd className="text-xs text-ink-muted">{hint}</dd>
    </div>
  );
  const activeDays = recap.days.filter((row) => row.active);
  const accountLabel = (id: string) => recap.accountLabels[id] ?? "—";
  const changesOf = (revision: (typeof recap.deposits)[number]["revisions"][number]) => {
    const { before, after } = revision;
    if (revision.kind === "CANCELLED" || !after) return [t("deposit.history.cancelled")];
    return [
      before.amount !== after.amount
        ? t("deposit.history.amount", { from: money(before.amount), to: money(after.amount) })
        : null,
      before.bankAccountId !== after.bankAccountId
        ? t("deposit.history.account", {
            from: accountLabel(before.bankAccountId),
            to: accountLabel(after.bankAccountId),
          })
        : null,
      before.day !== after.day
        ? t("deposit.history.day", {
            from: dayLabel(before.day, "short"),
            to: dayLabel(after.day, "short"),
          })
        : null,
      before.note !== after.note ? t("deposit.history.note") : null,
    ].filter((change) => change !== null);
  };
  const signed = (amount: number) => `${amount < 0 ? "−" : "+"} ${money(Math.abs(amount))}`;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          canDeposit ? (
            <Button asChild>
              <Link
                href={{ pathname: "/reports", query: { ...kept, deposit: "1" } }}
                scroll={false}
              >
                {t("deposit.record")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-6 flex flex-col gap-4">
        <nav
          aria-label={t("periodKind")}
          className="flex gap-1 self-stretch rounded-full border border-border p-1 sm:self-start"
        >
          {tab("day", t("daily"), { day: period.kind === "day" ? period.day : period.to })}
          {tab("month", t("monthly"), { month: period.from.slice(0, 7) })}
        </nav>
        <div className="flex flex-wrap items-end gap-3">
          <Button asChild variant="secondary" size="icon">
            <Link
              href={{ pathname: "/reports", query: step(period.previous) }}
              aria-label={period.kind === "day" ? t("previousDay") : t("previousMonth")}
            >
              <ChevronLeft aria-hidden="true" />
            </Link>
          </Button>
          <FilterForm applyLabel={t("apply")} className="min-w-48 flex-1 sm:max-w-72 sm:flex-none">
            {period.kind === "day" ? (
              <Field label={t("day")}>
                {(control) => (
                  <DatePicker {...control} name="day" defaultValue={period.day} max={today} />
                )}
              </Field>
            ) : (
              <Field label={t("month")}>
                {(control) => (
                  <Select
                    {...control}
                    name="month"
                    defaultValue={period.month}
                    options={
                      months.some((row) => row.value === period.month)
                        ? months
                        : [...months, { value: period.month, label: monthLabel(period.month) }]
                    }
                  />
                )}
              </Field>
            )}
          </FilterForm>
          {period.next ? (
            <Button asChild variant="secondary" size="icon">
              <Link
                href={{ pathname: "/reports", query: step(period.next) }}
                aria-label={period.kind === "day" ? t("nextDay") : t("nextMonth")}
              >
                <ChevronRight aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      </Card>

      <h2 className="mb-3 text-lg font-semibold text-ink">
        {period.kind === "day" ? dayLabel(period.day, "long") : monthLabel(period.month)}
      </h2>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card aria-labelledby="recap-money-in" className="min-w-0">
          <CardHeader className="mb-2">
            <CardTitle id="recap-money-in">{t("moneyIn")}</CardTitle>
          </CardHeader>
          <p className="mb-4 text-3xl font-semibold text-ink tabular-nums">
            {money(moneyIn.total)}
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            {figure(
              <Landmark aria-hidden="true" />,
              t("toAccount"),
              moneyIn.account,
              t("toAccountHint", { transfer: money(moneyIn.transfer), qris: money(moneyIn.qris) }),
            )}
            {figure(<Wallet aria-hidden="true" />, t("toDrawer"), moneyIn.cash, t("toDrawerHint"))}
          </dl>
          {moneyIn.byAccount.length > 0 ? (
            <ul aria-label={t("perAccount")} className="mt-4 flex flex-col gap-1 text-sm">
              {moneyIn.byAccount.map((account) => (
                <li key={account.id} className="flex justify-between gap-4">
                  <span className="[overflow-wrap:anywhere] text-ink-muted">
                    {`${account.bankName} ${account.accountNo}`}
                  </span>
                  <span className="text-ink tabular-nums">{money(account.total)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-sm text-ink-muted">
            {moneyIn.salesCash > 0 ? (
              <p>{t("salesCashLine", { amount: money(moneyIn.salesCash) })}</p>
            ) : null}
            <p>{t("marketplaceLine", { amount: money(moneyIn.marketplace) })}</p>
          </div>
        </Card>

        <Card aria-labelledby="recap-drawer" className="min-w-0">
          <CardHeader className="mb-2">
            <CardTitle id="recap-drawer">{t("drawer")}</CardTitle>
          </CardHeader>
          <dl>
            {line(
              period.kind === "day" ? t("openingDay") : t("openingMonth"),
              money(drawer.opening),
            )}
            {line(t("floatAdded"), `+ ${money(drawer.added)}`, { hint: t("floatAddedHint") })}
            {line(t("cashIn"), `+ ${money(drawer.cashIn)}`)}
            {line(t("expenses"), `− ${money(drawer.expenses)}`)}
            {line(t("deposited"), `− ${money(drawer.deposited)}`)}
            {drawer.variance !== 0
              ? line(t("countVariance"), signed(drawer.variance), { hint: t("countVarianceHint") })
              : null}
            {line(t("drawerBalance"), money(drawer.balance), {
              strong: true,
              hint: t("drawerBalanceHint"),
            })}
          </dl>
          <h3 className="mt-5 mb-2 text-sm font-semibold text-ink">{t("deposit.listTitle")}</h3>
          {recap.deposits.length === 0 ? (
            <CardDescription>{t("deposit.none")}</CardDescription>
          ) : (
            <ul
              aria-label={t("deposit.listTitle")}
              className="flex flex-col divide-y divide-border"
            >
              {recap.deposits.map((row) => (
                <li key={row.id} className="flex flex-col gap-2 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 text-sm">
                      <span
                        className={cn(
                          "font-medium text-ink tabular-nums",
                          row.cancelledAt && "text-ink-muted line-through",
                        )}
                      >
                        {money(row.amount)}
                      </span>
                      <span className="block text-xs [overflow-wrap:anywhere] text-ink-muted">
                        {[
                          period.kind === "month" ? dayLabel(row.day, "short") : null,
                          `${row.bankName} ${row.accountNo}`,
                          t("deposit.by", { name: row.actorName }),
                          row.note,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {row.cancelledAt ? (
                      <Chip>{t("deposit.cancelledTag")}</Chip>
                    ) : canDeposit ? (
                      <span className="flex gap-2">
                        <Button asChild variant="secondary" size="sm">
                          <Link
                            href={{ pathname: "/reports", query: { ...kept, editDeposit: row.id } }}
                            scroll={false}
                            aria-label={t("deposit.editLabel", { amount: money(row.amount) })}
                          >
                            {t("deposit.edit")}
                          </Link>
                        </Button>
                        <ConfirmAction
                          action={cancelDepositAction.bind(null, row.id)}
                          locale={locale}
                          variant="secondary"
                          labels={{
                            trigger: t("deposit.cancel"),
                            title: t("deposit.cancelTitle", { amount: money(row.amount) }),
                            description: t("deposit.cancelDescription"),
                            confirm: t("deposit.cancelConfirm"),
                            cancel: tCommon("cancel"),
                            close: tCommon("close"),
                          }}
                        >
                          <FormField
                            name="reason"
                            label={t("deposit.reason")}
                            hint={t("deposit.cancelReasonHint")}
                            maxLength={200}
                          />
                        </ConfirmAction>
                      </span>
                    ) : null}
                  </div>
                  {row.revisions.length > 0 ? (
                    <details className="rounded-control bg-surface-muted px-3 py-2 text-xs">
                      <summary className="cursor-pointer font-medium text-ink">
                        {t("deposit.history.title", { count: row.revisions.length })}
                      </summary>
                      <ol className="mt-2 flex flex-col gap-2">
                        {row.revisions.map((revision) => (
                          <li key={revision.id} className="[overflow-wrap:anywhere] text-ink-muted">
                            <span className="block text-ink">
                              {changesOf(revision).join(" · ")}
                            </span>
                            {t("deposit.history.reason", { reason: revision.reason })}
                            <span className="block">
                              {t("deposit.history.by", {
                                name: revision.actorName,
                                time: format.dateTime(revision.createdAt, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }),
                              })}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {period.kind === "month" ? (
        <Card aria-labelledby="recap-days" className="mb-6">
          <CardHeader>
            <CardTitle id="recap-days">{t("perDay")}</CardTitle>
          </CardHeader>
          {activeDays.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("noData")}</p>
          ) : (
            <Table>
              <TableCaption>{t("perDayCaption")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("day")}</TableHead>
                  <TableHead className="text-right">{t("toAccount")}</TableHead>
                  <TableHead className="text-right">{t("toDrawer")}</TableHead>
                  <TableHead className="text-right">{t("expenses")}</TableHead>
                  <TableHead className="text-right">{t("depositedShort")}</TableHead>
                  <TableHead className="text-right">{t("drawerBalance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeDays.map((row) => (
                  <TableRow key={row.day}>
                    <TableCell className="whitespace-nowrap">
                      <Link
                        href={{ pathname: "/reports", query: { day: row.day } }}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {dayLabel(row.day, "short")}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.account)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.cash)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.expenses)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(row.deposited)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money(row.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : null}

      <details className="group rounded-card bg-surface shadow-card">
        <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 px-5 text-base font-semibold text-ink sm:px-6">
          {t("moreDetails")}
          <ChevronRight
            aria-hidden="true"
            className="size-5 transition-transform group-open:rotate-90"
          />
        </summary>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <CardDescription className="mb-4">{t("moreDetailsHint")}</CardDescription>
          <SalesDetails report={report} />
        </div>
      </details>

      {editing ? (
        <RouteDialog
          closeHref={{ pathname: "/reports", query: kept }}
          closeLabel={tCommon("close")}
          title={t("deposit.editTitle", { amount: money(editing.amount) })}
          description={t("deposit.editDescription")}
        >
          <ActionForm action={editDepositAction.bind(null, editing.id, keptQuery)} locale={locale}>
            <FormDateField
              name="day"
              label={t("deposit.day")}
              defaultValue={editing.day}
              max={today}
            />
            <FormSelect
              name="bankAccountId"
              label={t("deposit.account")}
              defaultValue={editing.bankAccountId}
              options={[
                ...recap.accounts.map((account) => ({
                  value: account.id,
                  label: `${account.bankName} ${account.accountNo}`,
                })),
                ...(recap.accounts.some((account) => account.id === editing.bankAccountId)
                  ? []
                  : [{ value: editing.bankAccountId, label: accountLabel(editing.bankAccountId) }]),
              ]}
            />
            <FormField
              name="amount"
              money
              label={t("deposit.amount")}
              hint={t("deposit.editAmountHint")}
              defaultValue={String(editing.amount)}
              maxLength={20}
            />
            <FormField
              name="note"
              label={t("deposit.note")}
              defaultValue={editing.note ?? ""}
              maxLength={200}
            />
            <FormField
              name="reason"
              label={t("deposit.reason")}
              hint={t("deposit.editReasonHint")}
              maxLength={200}
            />
            <SubmitButton className="self-start">{t("deposit.saveEdit")}</SubmitButton>
          </ActionForm>
        </RouteDialog>
      ) : null}

      {depositing ? (
        <RouteDialog
          closeHref={{ pathname: "/reports", query: kept }}
          closeLabel={tCommon("close")}
          title={t("deposit.title")}
          description={t("deposit.description")}
        >
          {recap.accounts.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("deposit.noAccounts")}</p>
          ) : (
            <ActionForm action={recordDepositAction.bind(null, keptQuery)} locale={locale}>
              <FormDateField
                name="day"
                label={t("deposit.day")}
                defaultValue={period.kind === "day" ? period.day : period.to}
                max={today}
              />
              <FormSelect
                name="bankAccountId"
                label={t("deposit.account")}
                defaultValue={recap.accounts[0]?.id}
                options={recap.accounts.map((account) => ({
                  value: account.id,
                  label: `${account.bankName} ${account.accountNo}`,
                }))}
              />
              <FormField
                name="amount"
                money
                label={t("deposit.amount")}
                hint={t("deposit.amountHint", { balance: money(drawer.balance) })}
                maxLength={20}
              />
              <FormField name="note" label={t("deposit.note")} maxLength={200} />
              <SubmitButton className="self-start">{t("deposit.save")}</SubmitButton>
            </ActionForm>
          )}
        </RouteDialog>
      ) : null}
    </>
  );
}
