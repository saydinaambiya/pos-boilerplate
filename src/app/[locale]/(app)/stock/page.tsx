import { Boxes } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { FilterForm } from "@/components/form/filter-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StockCell } from "@/features/catalog/components/stock-cell";
import { stockFilters } from "@/features/stock/schemas";
import { getStockLevels } from "@/features/stock/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatMeters } from "@/lib/format/length";
import { stockItemLabel } from "@/lib/format/variant-label";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Stock");
  return { title: t("title") };
}

/**
 * Stock per variant with search, a low-stock and a defect filter
 * (FR-STK-01, FR-STK-07, FR-ROL-05): each roll in meters followed by its
 * pieces, defect pieces flagged (ADR-0023).
 */
export default async function StockPage({ searchParams }: PageProps<"/[locale]/stock">) {
  const session = await requirePermission("page:stock");
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const filters = stockFilters.parse({
    q: first(raw.q) ?? "",
    low: first(raw.low),
    defect: first(raw.defect),
    page: first(raw.page) ?? "1",
  });
  const [t, locale, page] = await Promise.all([
    getTranslations("Stock"),
    getLocale(),
    getStockLevels(session, filters),
  ]);
  const amount = (level: { isRoll: boolean }, value: number) =>
    level.isRoll ? formatMeters(value, locale) : String(value);
  const filtered = filters.q !== "" || filters.low !== undefined || filters.defect !== undefined;
  const query = (pageNumber: number) => ({
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.low ? { low: filters.low } : {}),
    ...(filters.defect ? { defect: filters.defect } : {}),
    ...(pageNumber > 1 ? { page: String(pageNumber) } : {}),
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Card className="mb-6">
        <FilterForm
          applyLabel={t("filter")}
          className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
        >
          <Field label={t("search")}>
            {(control) => (
              <Input
                {...control}
                type="search"
                name="q"
                defaultValue={filters.q}
                placeholder={t("searchPlaceholder")}
                maxLength={60}
              />
            )}
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="low"
              value="1"
              defaultChecked={filters.low !== undefined}
              className="size-5 accent-primary"
            />
            {t("lowOnly")}
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="defect"
              value="1"
              defaultChecked={filters.defect !== undefined}
              className="size-5 accent-primary"
            />
            {t("defectOnly")}
          </label>
          {filtered ? (
            <Button asChild variant="ghost">
              <Link href="/stock">{t("reset")}</Link>
            </Button>
          ) : null}
        </FilterForm>
      </Card>
      <Card>
        {page.levels.length === 0 ? (
          <EmptyState
            icon={<Boxes aria-hidden="true" />}
            title={filtered ? t("noResultsTitle") : t("emptyTitle")}
            description={filtered ? t("noResultsDescription") : t("emptyDescription")}
          />
        ) : (
          <Table>
            <TableCaption>{t("listCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("product")}</TableHead>
                <TableHead>{t("sku")}</TableHead>
                <TableHead>{t("brand")}</TableHead>
                <TableHead>{t("stock")}</TableHead>
                <TableHead className="text-right">{t("minStock")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.levels.map((level) => {
                const name = stockItemLabel(level, t("defect"));
                const piece = level.parentId !== null;
                return (
                  <TableRow key={level.variantId}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/stock/${level.variantId}`}
                        aria-label={t("open", { name })}
                        className="underline-offset-4 hover:underline"
                      >
                        {name}
                      </Link>
                      <span className="block text-xs font-normal text-ink-muted">
                        {level.isRoll ? "m" : piece ? "pcs" : level.unit}
                      </span>
                    </TableCell>
                    <TableCell className="text-ink-muted">{level.sku}</TableCell>
                    <TableCell>{level.brandName ?? "—"}</TableCell>
                    <TableCell>
                      <StockCell
                        trackStock
                        stockQty={level.stockQty}
                        minStock={level.minStock}
                        low={level.stockQty <= level.minStock && (!piece || level.minStock > 0)}
                        label={amount(level, level.stockQty)}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {amount(level, level.minStock)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {filters.page > 1 || page.hasNextPage ? (
          <nav aria-label={t("pagination")} className="mt-4 flex items-center justify-end gap-2">
            {filters.page > 1 ? (
              <Button asChild variant="ghost">
                <Link href={{ pathname: "/stock", query: query(filters.page - 1) }}>
                  {t("previous")}
                </Link>
              </Button>
            ) : null}
            <span className="text-sm text-ink-muted">{t("pageLabel", { page: filters.page })}</span>
            {page.hasNextPage ? (
              <Button asChild variant="secondary">
                <Link href={{ pathname: "/stock", query: query(filters.page + 1) }}>
                  {t("next")}
                </Link>
              </Button>
            ) : null}
          </nav>
        ) : null}
      </Card>
    </>
  );
}
