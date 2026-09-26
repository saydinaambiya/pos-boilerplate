import { NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

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
import { agingBuckets } from "@/features/kasbon/aging";
import { DueMarker, KasbonStatusChip } from "@/features/kasbon/components/kasbon-chips";
import { kasbonFilters, kasbonListQuery } from "@/features/kasbon/schemas";
import { listKasbons } from "@/features/kasbon/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { formatIndonesianPhone } from "@/lib/format/phone";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Kasbon");
  return { title: t("title") };
}

/** Store credit list with aging buckets and due markers (FR-KSB-06, PRD §3.8). */
export default async function KasbonPage({ searchParams }: PageProps<"/[locale]/kasbon">) {
  const session = await requirePermission("page:kasbon");
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const query = kasbonListQuery.parse({
    filter: first(raw.filter),
    q: first(raw.q),
    page: first(raw.page),
  });
  const [t, locale, result] = await Promise.all([
    getTranslations("Kasbon"),
    getLocale(),
    listKasbons(session, { filter: query.filter, search: query.q, page: query.page }),
  ]);
  const money = (amount: number) => formatCurrency(amount, locale);
  const filtered = query.q !== "" || query.filter !== "open";
  const pageQuery = (page: number) => ({
    ...(query.q ? { q: query.q } : {}),
    ...(query.filter === "open" ? {} : { filter: query.filter }),
    ...(page > 1 ? { page: String(page) } : {}),
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <section aria-labelledby="kasbon-aging" className="mb-6">
        <h2 id="kasbon-aging" className="sr-only">
          {t("agingTitle")}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1 rounded-card bg-surface p-5 shadow-card sm:p-6">
            <dt className="text-sm text-ink-muted">{t("outstanding")}</dt>
            <dd className="text-xl font-semibold text-ink tabular-nums">
              {money(result.aging.current + result.aging.days31to60 + result.aging.over60)}
            </dd>
            <dd className="text-xs text-ink-muted">
              {t("outstandingCount", { count: result.aging.count, overdue: result.aging.overdue })}
            </dd>
          </div>
          {agingBuckets.map((bucket) => (
            <div
              key={bucket}
              className="flex flex-col gap-1 rounded-card bg-surface p-5 shadow-card sm:p-6"
            >
              <dt className="text-sm text-ink-muted">{t(`aging.${bucket}`)}</dt>
              <dd className="text-xl font-semibold text-ink tabular-nums">
                {money(result.aging[bucket])}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <Card className="mb-6">
        <form method="get" role="search" className="grid gap-4 sm:grid-cols-3 sm:items-end">
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
              <Select {...control} name="filter" defaultValue={query.filter}>
                {kasbonFilters.map((filter) => (
                  <option key={filter} value={filter}>
                    {t(`filters.${filter}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex gap-2">
            <Button type="submit">{t("apply")}</Button>
            {filtered ? (
              <Button asChild variant="ghost">
                <Link href="/kasbon">{t("reset")}</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <Card>
        {result.kasbons.length === 0 ? (
          <EmptyState
            icon={<NotebookPen aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Table>
            <TableCaption>{t("listCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("customer")}</TableHead>
                <TableHead>{t("invoice")}</TableHead>
                <TableHead className="text-right">{t("total")}</TableHead>
                <TableHead className="text-right">{t("balance")}</TableHead>
                <TableHead>{t("age")}</TableHead>
                <TableHead>{t("dueDate")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.kasbons.map((kasbon) => (
                <TableRow key={kasbon.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/kasbon/${kasbon.id}`}
                      aria-label={t("open", {
                        name: kasbon.customerName,
                        invoiceNo: kasbon.invoiceNo,
                      })}
                      className="underline-offset-4 hover:underline"
                    >
                      {kasbon.customerName}
                    </Link>
                    <span className="block text-xs font-normal text-ink-muted tabular-nums">
                      {formatIndonesianPhone(kasbon.customerPhone)}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{kasbon.invoiceNo}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(kasbon.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(kasbon.balance)}
                    {kasbon.pendingTotal > 0 ? (
                      <span className="block text-xs text-ink-muted">
                        {t("pendingAmount", { amount: money(kasbon.pendingTotal) })}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t("ageDays", { days: kasbon.ageDays })}
                    <span className="block text-xs text-ink-muted">
                      {t(`aging.${kasbon.aging}`)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DueMarker due={kasbon.due} dueDate={kasbon.dueDate} />
                  </TableCell>
                  <TableCell>
                    <KasbonStatusChip status={kasbon.status} />
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
                <Link href={{ pathname: "/kasbon", query: pageQuery(query.page - 1) }}>
                  {t("previous")}
                </Link>
              </Button>
            ) : (
              <span />
            )}
            <span className="text-sm text-ink-muted">{t("pageLabel", { page: query.page })}</span>
            {result.hasNextPage ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={{ pathname: "/kasbon", query: pageQuery(query.page + 1) }}>
                  {t("next")}
                </Link>
              </Button>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </Card>
    </>
  );
}
