import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { FilterForm } from "@/components/form/filter-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { ShowArchivedField } from "@/features/housekeeping/components/show-archived-field";
import { DeletePurchaseDialog } from "@/features/purchases/components/delete-purchase-dialog";
import { DeletePurchasePaymentDialog } from "@/features/purchases/components/delete-purchase-payment-dialog";
import { EditPurchaseDialog } from "@/features/purchases/components/edit-purchase-dialog";
import { NewPurchaseDialog } from "@/features/purchases/components/new-purchase-dialog";
import { PurchaseBillDialog } from "@/features/purchases/components/purchase-bill-dialog";
import {
  PurchaseDueMarker,
  PurchaseStatusChip,
} from "@/features/purchases/components/purchase-chips";
import { purchaseFilters, purchaseListQuery } from "@/features/purchases/schemas";
import { listPurchases } from "@/features/purchases/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { firstParam } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Purchases");
  return { title: t("title") };
}

/**
 * Supplier bill list with the outstanding total and due markers (FR-PRB-04).
 * Every action stays here (ADR-0018, ADR-0053): `?new=1` records a bill,
 * `?bill=<id>` opens its installments, `?edit=<id>` edits it and a
 * confirmation dialog deletes a bill (`?delete=<id>`) or one installment
 * (`?deletePayment=<id>`), so the page never leaves the list and no detail
 * page is needed.
 */
export default async function PurchasesPage({ searchParams }: PageProps<"/[locale]/purchases">) {
  const session = await requirePermission("page:purchases");
  const raw = await searchParams;
  const canManage = session.permissions.has("purchase:manage");
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const creating = canManage && firstParam(raw.new) === "1";
  const query = purchaseListQuery.parse({
    filter: first(raw.filter),
    q: first(raw.q),
    page: first(raw.page),
    archived: first(raw.archived),
  });
  const [t, locale, format, result] = await Promise.all([
    getTranslations("Purchases"),
    getLocale(),
    getFormatter(),
    listPurchases(session, {
      filter: query.filter,
      search: query.q,
      page: query.page,
      includeArchived: query.archived === "1",
    }),
  ]);
  const money = (amount: number) => formatCurrency(amount, locale);
  const date = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const filtered = query.q !== "" || query.filter !== "all" || query.archived === "1";
  const pageQuery = (page: number) => ({
    ...(query.q ? { q: query.q } : {}),
    ...(query.filter === "all" ? {} : { filter: query.filter }),
    ...(query.archived ? { archived: "1" } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  });
  const closeHref = { pathname: "/purchases" as const, query: pageQuery(query.page) };
  const asId = (value: string | undefined) =>
    z.uuid().safeParse(value).success ? value : undefined;
  const billId = asId(first(raw.bill));
  const deleteId = asId(first(raw.delete));
  const deletePaymentId = asId(first(raw.deletePayment));
  const editing = result.purchases.find((purchase) => purchase.id === first(raw.edit));
  const deleting = result.purchases.find((purchase) => purchase.id === deleteId);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          canManage ? (
            <Button asChild>
              <Link
                href={{ pathname: "/purchases", query: { ...pageQuery(query.page), new: "1" } }}
                scroll={false}
              >
                <Receipt aria-hidden="true" />
                {t("add")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <section aria-labelledby="purchases-summary" className="mb-6">
        <h2 id="purchases-summary" className="sr-only">
          {t("summaryTitle")}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-card bg-surface p-5 shadow-card sm:p-6">
            <dt className="text-sm text-ink-muted">{t("outstanding")}</dt>
            <dd className="text-xl font-semibold text-ink tabular-nums">
              {money(result.summary.outstanding)}
            </dd>
            <dd className="text-xs text-ink-muted">
              {t("outstandingCount", { count: result.summary.count })}
            </dd>
          </div>
          <div className="flex flex-col gap-1 rounded-card bg-surface p-5 shadow-card sm:p-6">
            <dt className="text-sm text-ink-muted">{t("dueSoon")}</dt>
            <dd className="text-xl font-semibold text-ink tabular-nums">
              {t("overdueCount", { count: result.summary.overdue })}
            </dd>
          </div>
          <div className="flex flex-col gap-1 rounded-card bg-surface p-5 shadow-card sm:p-6">
            <dt className="text-sm text-ink-muted">{t("billCount")}</dt>
            <dd className="text-xl font-semibold text-ink tabular-nums">{result.summary.count}</dd>
          </div>
        </dl>
      </section>

      <Card className="mb-6">
        <FilterForm
          applyLabel={t("apply")}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        >
          <Field label={t("search")}>
            {(control) => (
              <Input
                {...control}
                type="search"
                name="q"
                defaultValue={query.q}
                placeholder={t("searchPlaceholder")}
                maxLength={60}
              />
            )}
          </Field>
          <Field label={t("filter")}>
            {(control) => (
              <Select
                {...control}
                name="filter"
                defaultValue={query.filter}
                options={purchaseFilters.map((filter) => ({
                  value: filter,
                  label: t(`filters.${filter}`),
                }))}
              />
            )}
          </Field>
          <ShowArchivedField checked={query.archived === "1"} />
          {filtered ? (
            <Button asChild variant="ghost" className="self-end justify-self-start">
              <Link href="/purchases">{t("reset")}</Link>
            </Button>
          ) : null}
        </FilterForm>
      </Card>

      <Card>
        {result.purchases.length === 0 ? (
          <EmptyState
            icon={<Receipt aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Table>
            <TableCaption>{t("listCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("companyName")}</TableHead>
                <TableHead>{t("invoiceNo")}</TableHead>
                <TableHead className="text-right">{t("total")}</TableHead>
                <TableHead className="text-right">{t("balance")}</TableHead>
                <TableHead>{t("orderDate")}</TableHead>
                <TableHead>{t("dueDate")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.purchases.map((purchase) => (
                <TableRow key={purchase.id}>
                  <TableCell className="font-medium">{purchase.companyName}</TableCell>
                  <TableCell className="tabular-nums">{purchase.invoiceNo}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(purchase.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(purchase.balance)}
                  </TableCell>
                  <TableCell className="text-sm">{date(purchase.orderDate)}</TableCell>
                  <TableCell>
                    <PurchaseDueMarker due={purchase.due} dueDate={purchase.dueDate} />
                  </TableCell>
                  <TableCell>
                    <PurchaseStatusChip status={purchase.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="flex flex-wrap justify-end gap-3 text-sm">
                      <Link
                        href={{
                          pathname: "/purchases",
                          query: { ...pageQuery(query.page), bill: purchase.id },
                        }}
                        scroll={false}
                        aria-label={t("open", { companyName: purchase.companyName })}
                        className="underline-offset-4 hover:underline"
                      >
                        {t("payments")}
                      </Link>
                      {canManage ? (
                        <Link
                          href={{
                            pathname: "/purchases",
                            query: { ...pageQuery(query.page), edit: purchase.id },
                          }}
                          scroll={false}
                          className="underline-offset-4 hover:underline"
                        >
                          {t("edit")}
                        </Link>
                      ) : null}
                      {canManage ? (
                        <Link
                          href={{
                            pathname: "/purchases",
                            query: { ...pageQuery(query.page), delete: purchase.id },
                          }}
                          scroll={false}
                          className="underline-offset-4 hover:underline"
                        >
                          {t("delete")}
                        </Link>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
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
                <Link href={{ pathname: "/purchases", query: pageQuery(query.page - 1) }}>
                  {t("previous")}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            <span className="text-sm text-ink-muted">{t("pageLabel", { page: query.page })}</span>
            {result.hasNextPage ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={{ pathname: "/purchases", query: pageQuery(query.page + 1) }}>
                  {t("next")}
                </Link>
              </Button>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </Card>
      {creating ? <NewPurchaseDialog closeHref={closeHref} /> : null}
      {billId ? (
        <PurchaseBillDialog
          session={session}
          purchaseId={billId}
          canManage={canManage}
          listQuery={closeHref.query}
          closeHref={closeHref}
        />
      ) : null}
      {canManage && editing ? (
        <EditPurchaseDialog purchase={editing} closeHref={closeHref} />
      ) : null}
      {canManage && deleteId ? (
        <DeletePurchaseDialog
          purchaseId={deleteId}
          companyName={deleting?.companyName}
          closeHref={closeHref}
        />
      ) : null}
      {canManage && deletePaymentId ? (
        <DeletePurchasePaymentDialog
          paymentId={deletePaymentId}
          closeHref={
            billId
              ? { pathname: "/purchases", query: { ...closeHref.query, bill: billId } }
              : closeHref
          }
        />
      ) : null}
    </>
  );
}
