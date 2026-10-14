import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SectionTabs } from "@/components/shell/section-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { consignmentSaleQuery, listConsignmentSales } from "@/features/checkout/history";
import { SaleDialog } from "@/features/checkout/components/sale-dialog";
import { SaleHistoryFilters } from "@/features/checkout/components/sale-history-filters";
import { SaleHistoryTable } from "@/features/checkout/components/sale-history-table";
import { requirePermission } from "@/lib/auth/guard";
import { firstParam as first, keptQuery } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Consignments");
  return { title: t("tabSales") };
}

/** Sales of carried goods can't be voided (FR-CSG-06), so only these statuses occur. */
const statuses = ["COMPLETED", "COMPLETED_WITH_KASBON"] as const;

/**
 * Salespeople's transaction history (FR-CSG-10), laid out like the
 * cashier's (FR-POS-13): sales in a date range with invoice search and
 * salesperson, method and status filters. Each row opens the full invoice in
 * a dialog (`?view=`) with print, PDF and share (ADR-0018). Salespeople only
 * see their own.
 */
export default async function ConsignmentSalesPage({
  searchParams,
}: PageProps<"/[locale]/consignments/sales">) {
  const session = await requirePermission("page:consignments");
  const raw = await searchParams;
  const query = consignmentSaleQuery.parse({
    from: first(raw.from),
    to: first(raw.to),
    q: first(raw.q),
    salesperson: first(raw.salesperson),
    method: first(raw.method),
    status: first(raw.status),
    archived: first(raw.archived),
    page: first(raw.page),
  });
  const [t, result] = await Promise.all([
    getTranslations("Consignments"),
    listConsignmentSales(session, query),
  ]);
  const pageHref = (page: number) => ({
    pathname: "/consignments/sales",
    query: {
      from: result.from,
      to: result.to,
      ...(query.q ? { q: query.q } : {}),
      ...(query.salesperson && result.seesAll ? { salesperson: query.salesperson } : {}),
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
    query.salesperson !== undefined ||
    query.method !== undefined ||
    query.status !== undefined ||
    query.archived !== undefined ||
    result.from !== result.today ||
    result.to !== result.today;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={result.seesAll ? t("salesSubtitleAll") : t("salesSubtitleOwn")}
      />
      <SectionTabs
        label={t("tabsLabel")}
        current="SALES"
        tabs={[
          { id: "OPEN", href: "/consignments", label: t("tabOpen") },
          { id: "CLOSED", href: "/consignments?status=closed", label: t("tabClosed") },
          { id: "SALES", href: "/consignments/sales", label: t("tabSales") },
        ]}
      />
      <SaleHistoryFilters
        from={result.from}
        to={result.to}
        today={result.today}
        query={query}
        person={
          result.seesAll
            ? {
                name: "salesperson",
                label: t("colSalesperson"),
                allLabel: t("allSalespeople"),
                value: query.salesperson,
                options: result.salespeople,
              }
            : null
        }
        statuses={statuses}
        resetHref={filtered ? "/consignments/sales" : undefined}
      />
      <SaleHistoryTable
        sales={result.sales}
        summary={result.summary}
        page={query.page}
        hasNextPage={result.hasNextPage}
        person={
          result.seesAll
            ? {
                label: t("colSalesperson"),
                nameOf: (sale) => sale.salespersonName ?? sale.cashierName,
              }
            : null
        }
        viewHref={(id) => ({ pathname: "/consignments/sales", query: { ...kept, view: id } })}
        pageHref={pageHref}
      />
      {viewing ? (
        <SaleDialog
          key={viewing}
          session={session}
          saleId={viewing}
          closeHref={{ pathname: "/consignments/sales", query: kept }}
        />
      ) : null}
    </>
  );
}
