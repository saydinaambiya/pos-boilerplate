import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { saleStatuses } from "@/db/schema";
import { listSales, saleHistoryQuery } from "@/features/checkout/history";
import { SaleDialog } from "@/features/checkout/components/sale-dialog";
import { SaleHistoryFilters } from "@/features/checkout/components/sale-history-filters";
import { SaleHistoryTable } from "@/features/checkout/components/sale-history-table";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { firstParam as first, keptQuery } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("SalesHistory");
  return { title: t("title") };
}

/**
 * Transaction history (FR-POS-13, FR-HK-04): sales in a date range with
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
  const [t, result] = await Promise.all([
    getTranslations("SalesHistory"),
    listSales(session, query),
  ]);
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

      <SaleHistoryFilters
        from={result.from}
        to={result.to}
        today={result.today}
        query={query}
        person={
          result.seesAll
            ? {
                name: "cashier",
                label: t("cashier"),
                allLabel: t("allCashiers"),
                value: query.cashier,
                options: result.cashiers,
              }
            : null
        }
        statuses={saleStatuses}
        resetHref={filtered ? "/pos/sales" : undefined}
      />
      <SaleHistoryTable
        sales={result.sales}
        summary={result.summary}
        page={query.page}
        hasNextPage={result.hasNextPage}
        person={result.seesAll ? { label: t("cashier"), nameOf: (sale) => sale.cashierName } : null}
        viewHref={(id) => ({ pathname: "/pos/sales", query: { ...kept, view: id } })}
        pageHref={pageHref}
      />
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
