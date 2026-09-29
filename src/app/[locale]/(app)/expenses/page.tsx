import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormField, FormSelect } from "@/components/form/form-field";
import { FilterForm } from "@/components/form/filter-form";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { RouteDialog } from "@/components/ui/route-dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { expenseCategories } from "@/db/schema/expenses";
import { recordExpenseAction } from "@/features/expenses/actions";
import { expenseDayQuery } from "@/features/expenses/schemas";
import { getExpenseRecipients, getExpensesOfDay } from "@/features/expenses/service";
import { getOpenShift } from "@/features/shifts/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { firstParam } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Expenses");
  return { title: t("title") };
}

/**
 * Daily staff expenses paid from the cash drawer (FR-EXP-01/02, ADR-0027):
 * one store day's list with its total, and `?new=1` to record one in the
 * recorder's open shift (ADR-0018).
 */
export default async function ExpensesPage({ searchParams }: PageProps<"/[locale]/expenses">) {
  const session = await requirePermission("page:expenses");
  const raw = await searchParams;
  const { day } = expenseDayQuery.parse({ day: firstParam(raw.day) });
  const canRecord = session.permissions.has("expense:record");
  const [t, tCommon, format, locale, list] = await Promise.all([
    getTranslations("Expenses"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    getExpensesOfDay(session, day),
  ]);
  const recording = canRecord && firstParam(raw.new) === "1";
  const [shift, recipients] = recording
    ? await Promise.all([getOpenShift(session), getExpenseRecipients(session)])
    : [null, []];
  const money = (amount: number) => formatCurrency(amount, locale);
  const kept = day ? { day } : {};

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          canRecord ? (
            <Button asChild>
              <Link href={{ pathname: "/expenses", query: { ...kept, new: "1" } }} scroll={false}>
                {t("record")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <Card className="mb-6">
        <FilterForm applyLabel={t("filter")} className="grid gap-4 sm:grid-cols-[16rem_auto]">
          <Field label={t("day")}>
            {(control) => <DatePicker {...control} name="day" defaultValue={list.day} />}
          </Field>
        </FilterForm>
      </Card>
      <Card>
        {list.rows.length === 0 ? (
          <EmptyState
            icon={<Wallet aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Table>
            <TableCaption>{t("caption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("time")}</TableHead>
                <TableHead>{t("category")}</TableHead>
                <TableHead>{t("recipient")}</TableHead>
                <TableHead>{t("note")}</TableHead>
                <TableHead>{t("recordedBy")}</TableHead>
                <TableHead className="text-right">{t("amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    {format.dateTime(row.createdAt, { timeStyle: "short" })}
                  </TableCell>
                  <TableCell>{t(`categories.${row.category}`)}</TableCell>
                  <TableCell>{row.recipientName ?? "—"}</TableCell>
                  <TableCell className="max-w-64 [overflow-wrap:anywhere]">
                    {row.note ?? "—"}
                  </TableCell>
                  <TableCell>{row.actorName}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(row.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={5} className="font-semibold">
                  {t("total")}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {money(list.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Card>

      {recording ? (
        <RouteDialog
          closeHref={{ pathname: "/expenses", query: kept }}
          closeLabel={tCommon("close")}
          title={t("recordTitle")}
          description={t("recordDescription")}
        >
          {shift ? (
            <ActionForm action={recordExpenseAction} locale={locale}>
              <FormSelect
                name="category"
                label={t("category")}
                defaultValue="MEAL"
                options={expenseCategories.map((category) => ({
                  value: category,
                  label: t(`categories.${category}`),
                }))}
              />
              <FormSelect
                name="recipientId"
                label={t("recipient")}
                hint={t("recipientHint")}
                defaultValue=""
                options={[
                  { value: "", label: t("noRecipient") },
                  ...recipients.map((person) => ({ value: person.id, label: person.name })),
                ]}
              />
              <FormField name="amount" money label={t("amount")} maxLength={20} />
              <FormField name="note" label={t("note")} hint={t("noteHint")} maxLength={200} />
              <SubmitButton className="self-start">{t("save")}</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-muted">{t("errors.noOpenShift")}</p>
          )}
        </RouteDialog>
      ) : null}
    </>
  );
}
