import { Backpack } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { SectionTabs } from "@/components/shell/section-tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import { ConsignmentMessages } from "@/features/consignments/components/consignment-messages";
import { TakeForm } from "@/features/consignments/components/take-form";
import { getConsignments, getSalespeopleFor } from "@/features/consignments/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { firstParam } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Consignments");
  return { title: t("title") };
}

/**
 * Goods out with salespeople (FR-CSG-05): open consignments with what is
 * still out and its value, or settled ones; salespeople only see their
 * own. `?take=1` opens the pickup form over the list (ADR-0018).
 */
export default async function ConsignmentsPage({
  searchParams,
}: PageProps<"/[locale]/consignments">) {
  const session = await requirePermission("page:consignments");
  const params = await searchParams;
  const status = firstParam(params.status) === "closed" ? "CLOSED" : "OPEN";
  const taking = firstParam(params.take) === "1";
  const [t, tCommon, format, locale, rows, salespeople] = await Promise.all([
    getTranslations("Consignments"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    getConsignments(session, status),
    getSalespeopleFor(session),
  ]);
  const money = (amount: number) => formatCurrency(amount, locale);
  const when = (date: Date) => format.dateTime(date, { dateStyle: "medium", timeStyle: "short" });
  const kept = status === "CLOSED" ? { status: "closed" } : {};

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          salespeople.length > 0 ? (
            <Button asChild>
              <Link
                href={{ pathname: "/consignments", query: { ...kept, take: "1" } }}
                scroll={false}
              >
                {t("take")}
              </Link>
            </Button>
          ) : null
        }
      />
      <SectionTabs
        label={t("tabsLabel")}
        current={status}
        tabs={[
          { id: "OPEN", href: "/consignments", label: t("tabOpen") },
          { id: "CLOSED", href: "/consignments?status=closed", label: t("tabClosed") },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Backpack aria-hidden="true" />}
            title={status === "OPEN" ? t("emptyOpenTitle") : t("emptyClosedTitle")}
            description={
              status === "OPEN" ? t("emptyOpenDescription") : t("emptyClosedDescription")
            }
          />
        ) : (
          <Table>
            <TableCaption>{t("caption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colSalesperson")}</TableHead>
                <TableHead>{t("colSince")}</TableHead>
                <TableHead>{t("colLastActivity")}</TableHead>
                {status === "OPEN" ? (
                  <>
                    <TableHead className="text-right">{t("colOutstanding")}</TableHead>
                    <TableHead className="text-right">{t("colValue")}</TableHead>
                  </>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/consignments/${row.id}`}
                      aria-label={t("open", { name: row.salespersonName })}
                      className="underline-offset-4 hover:underline"
                    >
                      {row.salespersonName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{when(row.createdAt)}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {when(row.closedAt ?? row.updatedAt)}
                  </TableCell>
                  {status === "OPEN" ? (
                    <>
                      <TableCell className="text-right tabular-nums">
                        {t("units", { count: row.outstanding })}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(row.outstandingValue)}
                      </TableCell>
                    </>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {taking && salespeople.length > 0 ? (
        <RouteDialog
          closeHref={{ pathname: "/consignments", query: kept }}
          closeLabel={tCommon("close")}
          size="lg"
          title={t("takeTitle")}
          description={t("takeDescription")}
        >
          <ConsignmentMessages>
            <TakeForm
              locale={locale}
              salespeople={salespeople}
              defaultSalespersonId={
                salespeople.find((person) => person.id === session.user.id)?.id ??
                salespeople[0]?.id ??
                ""
              }
            />
          </ConsignmentMessages>
        </RouteDialog>
      ) : null}
    </>
  );
}
