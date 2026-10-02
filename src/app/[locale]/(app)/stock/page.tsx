import { Boxes, Tag } from "lucide-react";
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
import { TableGroup, TableSubGroup } from "@/components/ui/table-group";
import { ListSortFields } from "@/features/catalog/components/list-sort-fields";
import { StockCell } from "@/features/catalog/components/stock-cell";
import { getThicknesses } from "@/features/catalog/service";
import { stockFilters } from "@/features/stock/schemas";
import { formatSize } from "@/features/catalog/sizes";
import { getStockLevels, takesPieceMinimum } from "@/features/stock/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatMeters, formatThickness } from "@/lib/format/length";
import { stockItemLabel, variantLabel } from "@/lib/format/variant-label";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Stock");
  return { title: t("title") };
}

/**
 * Stock grouped per brand, then product, motif and colour, with search, a
 * thickness, a low-stock, a defect and a minimum-set filter and a sort
 * (FR-STK-07/08/09, FR-ROL-05): ten brands a page, starting closed, each
 * roll in meters with its pieces folded under it, all shown on a click or
 * once a search or filter is applied (ADR-0023, ADR-0038, ADR-0040,
 * ADR-0041). A plain visit starts
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
    thickness: first(raw.thickness),
    sort: first(raw.sort),
    page: first(raw.page) ?? "1",
  });
  const [t, locale, thicknesses, page] = await Promise.all([
    getTranslations("Stock"),
    getLocale(),
    getThicknesses(session),
    getStockLevels(session, filters),
  ]);
  const amount = (level: { isRoll: boolean }, value: number) =>
    level.isRoll ? formatMeters(value, locale) : String(value);
  const searched =
    filters.q !== "" ||
    filters.low !== undefined ||
    filters.defect !== undefined ||
    filters.thickness !== undefined;
  const filtered = searched || filters.minimum !== undefined;
  const changed = searched || filters.minimum === undefined || filters.sort !== "name";
  const brandGroups = Object.values(
    Object.groupBy(page.groups, (group) => group.brandId ?? ""),
  ).filter((group) => group !== undefined);
  const query = (pageNumber: number) => ({
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.low ? { low: filters.low } : {}),
    ...(filters.defect ? { defect: filters.defect } : {}),
    minimum: filters.minimum ?? "0",
    ...(filters.thickness === undefined ? {} : { thickness: String(filters.thickness) }),
    ...(filters.sort === "name" ? {} : { sort: filters.sort }),
    ...(pageNumber > 1 ? { page: String(pageNumber) } : {}),
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Card className="mb-6">
        <FilterForm
          applyLabel={t("filter")}
          className="grid gap-4 sm:grid-cols-2 sm:items-end lg:grid-cols-3 xl:grid-cols-[2fr_1fr_1fr]"
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
          <ListSortFields
            locale={locale}
            thicknesses={thicknesses}
            thickness={filters.thickness}
            sort={filters.sort}
            labels={{
              thickness: t("thicknessFilter"),
              allThicknesses: t("allThicknesses"),
              sort: t("sort"),
              name: t("sortName"),
              thinFirst: t("sortThinFirst"),
              thickFirst: t("sortThickFirst"),
            }}
          />
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
                <TableHead>{t("thickness")}</TableHead>
                <TableHead>{t("stock")}</TableHead>
                <TableHead className="text-right">{t("minStock")}</TableHead>
              </TableRow>
            </TableHeader>
            {brandGroups.map((brandGroup) => {
              const brand = brandGroup[0]?.brandName ?? t("noBrand");
              return (
                <TableGroup
                  key={`${brandGroup[0]?.brandId ?? "none"}-${String(searched)}`}
                  defaultOpen={searched}
                  leadColSpan={7}
                  className="bg-surface-muted/60"
                  toggleLabel={t("toggleBrand", { brand })}
                  toggleContent={
                    <>
                      <Tag aria-hidden="true" className="size-4 shrink-0 text-primary" />
                      <span>{brand}</span>
                      <span className="text-xs font-normal text-ink-muted">
                        {t("brandGroup", { count: brandGroup.length })}
                      </span>
                    </>
                  }
                >
                  {brandGroup.map((group) => {
                    const name = stockItemLabel(group, t("defect"));
                    return (
                      <TableSubGroup
                        key={`${group.variantId}-${String(searched)}`}
                        defaultOpen={searched}
                        toggleLabel={t("togglePieces", {
                          name: variantLabel(group.productName, group.colorName),
                          count: group.pieces.length,
                        })}
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
                            <TableCell className="whitespace-nowrap tabular-nums">
                              {group.thickness ? formatThickness(group.thickness, locale) : "—"}
                            </TableCell>
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
                                    aria-label={t("open", {
                                      name: stockItemLabel(piece, t("defect")),
                                    })}
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
                                <TableCell>{piece.colorName ?? "—"}</TableCell>
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
                      </TableSubGroup>
                    );
                  })}
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
