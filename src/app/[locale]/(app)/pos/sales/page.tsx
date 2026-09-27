import { CircleCheck, CircleX, NotebookPen, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { FilterForm } from "@/components/form/filter-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
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
import { saleStatuses } from "@/db/schema";
import { listSales, saleHistoryMethods, saleHistoryQuery } from "@/features/checkout/history";
import { SaleDialog } from "@/features/checkout/components/sale-dialog";
import { ShowArchivedField } from "@/features/housekeeping/components/show-archived-field";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { firstParam as first, keptQuery } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("SalesHistory");
  return { title: t("title") };
}

const statusChips = {
  COMPLETED: { tone: "success", icon: CircleCheck },
  COMPLETED_WITH_KASBON: { tone: "info", icon: NotebookPen },
  VOIDED: { tone: "danger", icon: CircleX },
} as const;

/**
 * Transaction history (FR-POS-10, FR-HK-04): sales in a date range with
 * invoice search and cashier, method and status filters that apply as they
 * change. Each row opens the sale in a dialog (`?view=`) for reprint, PDF and
 * void (ADR-0018).
 */
export default async function SalesHistoryPage({ searchParams }: PageProps<"/[locale]/pos/sales">) {
  const session = await requirePermission("page:pos");
  const raw = await searchParams;
  const query = saleHistoryQuery.parse({
    from: first(raw.from),
    to: first(raw.to),
    q: first(raw.q),
    cashier: first(raw.cashier),
    method: first(raw.method),
    status: first(raw.status),
    archived: first(raw.archived),
    page: first(raw.page),
  });
  const [t, tReceipt, format, locale, result] = await Promise.all([
    getTranslations("SalesHistory"),
    getTranslations("Receipt"),
    getFormatter(),
    getLocale(),
    listSales(session, query),
  ]);
  const money = (amount: number) => formatCurrency(amount, locale);
  const pageHref = (page: number) => ({
    pathname: "/pos/sales",
    query: {
      from: result.from,
      to: result.to,
      ...(query.q ? { q: query.q } : {}),
      ...(query.cashier && result.seesAll ? { cashier: query.cashier } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.archived ? { archived: "1" } : {}),
      ...(page > 1 ? { page: String(page) } : {}),
    },
  });
  const kept = keptQuery(raw, ["view"]);
  const viewing = first(raw.view);
  const filtered =
    query.q !== "" ||
    query.cashier !== undefined ||
    query.method !== undefined ||
    query.status !== undefined ||
    query.archived !== undefined ||
    result.from !== result.today ||
    result.to !== result.today;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={result.seesAll ? t("subtitleAll") : t("subtitleOwn")}
        actions={
          <Button asChild variant="secondary">
            <Link href="/pos">{t("backToPos")}</Link>
          </Button>
        }
      />

      <Card className="mb-6">
        <FilterForm
          applyLabel={t("apply")}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        >
          <Field label={t("from")}>
            {(control) => (
              <DatePicker {...control} name="from" defaultValue={result.from} max={result.today} />
            )}
          </Field>
          <Field label={t("to")}>
            {(control) => (
              <DatePicker {...control} name="to" defaultValue={result.to} max={result.today} />
            )}
          </Field>
          <Field label={t("invoice")}>
            {(control) => (
              <Input
                {...control}
                type="search"
                name="q"
                defaultValue={query.q}
                placeholder={t("invoicePlaceholder")}
                maxLength={40}
              />
            )}
          </Field>
          {result.seesAll ? (
            <Field label={t("cashier")}>
              {(control) => (
                <Select
                  {...control}
                  name="cashier"
                  defaultValue={query.cashier ?? ""}
                  options={[
                    { value: "", label: t("allCashiers") },
                    ...result.cashiers.map((cashier) => ({
                      value: cashier.id,
                      label: cashier.name,
                    })),
                  ]}
                />
              )}
            </Field>
          ) : null}
          <Field label={t("method")}>
            {(control) => (
              <Select
                {...control}
                name="method"
                defaultValue={query.method ?? ""}
                options={[
                  { value: "", label: t("allMethods") },
                  ...saleHistoryMethods.map((method) => ({
                    value: method,
                    label: tReceipt(`methods.${method}`),
                  })),
                ]}
              />
            )}
          </Field>
          <Field label={t("status")}>
            {(control) => (
              <Select
                {...control}
                name="status"
                defaultValue={query.status ?? ""}
                options={[
                  { value: "", label: t("allStatuses") },
                  ...saleStatuses.map((status) => ({
                    value: status,
                    label: tReceipt(`statuses.${status}`),
                  })),
                ]}
              />
            )}
          </Field>
          <ShowArchivedField checked={query.archived === "1"} />
          {filtered ? (
            <Button asChild variant="ghost" className="self-end justify-self-start">
              <Link href="/pos/sales">{t("reset")}</Link>
            </Button>
          ) : null}
        </FilterForm>
      </Card>

      <p role="status" className="mb-3 text-sm text-ink-muted">
        {t("summary", {
          count: result.summary.count,
          total: money(result.summary.total),
          voided: result.summary.voided,
        })}
      </p>

      <Card>
        {result.sales.length === 0 ? (
          <EmptyState
            icon={<ReceiptText aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Table>
            <TableCaption>{t("caption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("invoice")}</TableHead>
                <TableHead>{t("time")}</TableHead>
                {result.seesAll ? <TableHead>{t("cashier")}</TableHead> : null}
                <TableHead>{t("method")}</TableHead>
                <TableHead className="text-right">{t("total")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.sales.map((sale) => {
                const chip = statusChips[sale.status];
                return (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium tabular-nums">
                      <Link
                        href={{ pathname: "/pos/sales", query: { ...kept, view: sale.id } }}
                        scroll={false}
                        aria-label={t("open", { invoiceNo: sale.invoiceNo })}
                        className="underline-offset-4 hover:underline"
                      >
                        {sale.invoiceNo}
                      </Link>
                      {sale.customerName ? (
                        <span className="block text-xs font-normal text-ink-muted">
                          {sale.customerName}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format.dateTime(sale.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                    </TableCell>
                    {result.seesAll ? (
                      <TableCell className="text-sm">{sale.cashierName}</TableCell>
                    ) : null}
                    <TableCell className="text-sm">
                      {sale.methods
                        .map((method) =>
                          (saleHistoryMethods as readonly string[]).includes(method)
                            ? tReceipt(`methods.${method as (typeof saleHistoryMethods)[number]}`)
                            : method,
                        )
                        .join(" + ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(sale.grandTotal)}
                    </TableCell>
                    <TableCell>
                      <Chip tone={chip.tone} icon={<chip.icon aria-hidden="true" />}>
                        {tReceipt(`statuses.${sale.status}`)}
                      </Chip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {query.page > 1 || result.hasNextPage ? (
          <nav
            aria-label={t("pagination")}
            className="mt-4 flex items-center justify-between gap-2"
          >
            {query.page > 1 ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={pageHref(query.page - 1)}>{t("previous")}</Link>
              </Button>
            ) : (
              <span />
            )}
            <span className="text-sm text-ink-muted">{t("pageLabel", { page: query.page })}</span>
            {result.hasNextPage ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={pageHref(query.page + 1)}>{t("next")}</Link>
              </Button>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </Card>
      {viewing ? (
        <SaleDialog
          key={viewing}
          session={session}
          saleId={viewing}
          closeHref={{ pathname: "/pos/sales", query: kept }}
        />
      ) : null}
    </>
  );
}
