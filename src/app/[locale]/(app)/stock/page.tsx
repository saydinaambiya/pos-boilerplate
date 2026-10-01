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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableGroup } from "@/components/ui/table-group";
import { StockCell } from "@/features/catalog/components/stock-cell";
import { stockFilters } from "@/features/stock/schemas";
import { formatSize } from "@/features/catalog/sizes";
import { getStockLevels, takesPieceMinimum } from "@/features/stock/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatMeters } from "@/lib/format/length";
import { stockItemLabel, variantLabel } from "@/lib/format/variant-label";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Stock");
  return { title: t("title") };
}

/**
 * Stock grouped per product, motif and colour with search, a low-stock, a
 * defect and a minimum-set filter (FR-STK-07/08/09, FR-ROL-05): each roll
 * in meters, its pieces folded under it and shown on a click or once a
 * search or filter is applied (ADR-0023, ADR-0038). A plain visit starts
 * with only stock that has a minimum; unticking it sends `minimum=0`, so
 * the hidden field keeps the choice in the URL.
 */
export default async function StockPage({ searchParams }: PageProps<"/[locale]/stock">) {
  const session = await requirePermission("page:stock");
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const minimumChoice = [raw.minimum ?? []].flat();
  const plainVisit = !first(raw.q) && !first(raw.low) && !first(raw.defect);
  const filters = stockFilters.parse({
    q: first(raw.q) ?? "",
    low: first(raw.low),
    defect: first(raw.defect),
    minimum:
      minimumChoice.includes("1") || (minimumChoice.length === 0 && plainVisit) ? "1" : undefined,
    page: first(raw.page) ?? "1",
  });
  const [t, locale, page] = await Promise.all([
    getTranslations("Stock"),
    getLocale(),
    getStockLevels(session, filters),
  ]);
  const amount = (level: { isRoll: boolean }, value: number) =>
    level.isRoll ? formatMeters(value, locale) : String(value);
  const searched = filters.q !== "" || filters.low !== undefined || filters.defect !== undefined;
  const filtered = searched || filters.minimum !== undefined;
  const changed = searched || filters.minimum === undefined;
  const query = (pageNumber: number) => ({
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.low ? { low: filters.low } : {}),
    ...(filters.defect ? { defect: filters.defect } : {}),
    minimum: filters.minimum ?? "0",
    ...(pageNumber > 1 ? { page: String(pageNumber) } : {}),
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Card className="mb-6">
        <FilterForm
          applyLabel={t("filter")}
          className="grid gap-4 sm:grid-cols-2 sm:items-end lg:grid-cols-[1fr_auto_auto_auto_auto]"
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
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="minimum"
              value="1"
              defaultChecked={filters.minimum !== undefined}
              className="size-5 accent-primary"
            />
            <input type="hidden" name="minimum" value="0" />
            {t("minimumOnly")}
          </label>
          {changed ? (
            <Button asChild variant="ghost">
              <Link href="/stock">{t("reset")}</Link>
            </Button>
          ) : null}
        </FilterForm>
      </Card>
      <Card>
        {page.groups.length === 0 ? (
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
                <TableHead>{t("brand")}</TableHead>
                <TableHead>{t("product")}</TableHead>
                <TableHead>{t("motif")}</TableHead>
                <TableHead>{t("color")}</TableHead>
                <TableHead>{t("stock")}</TableHead>
                <TableHead className="text-right">{t("minStock")}</TableHead>
              </TableRow>
            </TableHeader>
            {page.groups.map((group) => {
              const name = stockItemLabel(group, t("defect"));
              return (
                <TableGroup
                  key={`${group.variantId}-${String(searched)}`}
                  defaultOpen={searched}
                  toggleLabel={t("togglePieces", {
                    name: variantLabel(group.productName, group.colorName),
                    count: group.pieces.length,
                  })}
                  lead={group.brandName ?? "—"}
                  cells={
                    <>
                      <TableCell className="font-medium">
                        <Link
                          href={`/stock/${group.variantId}`}
                          aria-label={t("open", { name })}
                          className="underline-offset-4 hover:underline"
                        >
                          {group.productName}
                        </Link>
                        <span className="block text-xs font-normal text-ink-muted">
                          {group.isRoll ? t("rollUnit") : group.unit}
                        </span>
                      </TableCell>
                      <TableCell>{group.motif ?? "—"}</TableCell>
                      <TableCell>{group.colorName ?? "—"}</TableCell>
                      <TableCell>
                        <StockCell
                          trackStock
                          stockQty={group.stockQty}
                          minStock={group.minStock}
                          low={group.stockQty <= group.minStock}
                          label={amount(group, group.stockQty)}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {amount(group, group.minStock)}
                      </TableCell>
                    </>
                  }
                >
                  {group.pieces.length > 0
                    ? group.pieces.map((piece) => (
                        <TableRow key={piece.variantId} className="bg-surface-muted/40">
                          <TableCell />
                          <TableCell className="pl-8 font-medium">
                            <Link
                              href={`/stock/${piece.variantId}`}
                              aria-label={t("open", { name: stockItemLabel(piece, t("defect")) })}
                              className="underline-offset-4 hover:underline"
                            >
                              {[
                                piece.size ? formatSize(piece.size) : piece.sku,
                                piece.isDefect ? t("defect") : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </Link>
                            <span className="block text-xs font-normal text-ink-muted">
                              {"pcs"}
                            </span>
                          </TableCell>
                          <TableCell />
                          <TableCell />
                          <TableCell>
                            <StockCell
                              trackStock
                              stockQty={piece.stockQty}
                              minStock={piece.minStock}
                              low={piece.minStock > 0 && piece.stockQty <= piece.minStock}
                              label={String(piece.stockQty)}
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {piece.minStock > 0 || takesPieceMinimum(piece)
                              ? String(piece.minStock)
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                </TableGroup>
              );
            })}
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
