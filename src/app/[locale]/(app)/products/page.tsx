import { CircleCheck, CircleOff, PackagePlus, PackageSearch, Tag } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { FilterForm } from "@/components/form/filter-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableGroup } from "@/components/ui/table-group";
import { CatalogTabs } from "@/features/catalog/components/catalog-tabs";
import { NewProductDialog } from "@/features/catalog/components/new-product-dialog";
import { StockCell } from "@/features/catalog/components/stock-cell";
import { productFilters } from "@/features/catalog/schemas";
import { getBrands, listProducts } from "@/features/catalog/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { formatMeters, formatThickness } from "@/lib/format/length";
import { firstParam as first, keptQuery } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Catalog");
  return { title: t("title") };
}

/**
 * Product list with search and a brand filter, grouped per brand in
 * collapsible rows with the brand leftmost, closed until a filter applies, showing motif and
 * thickness in their own columns (FR-PRD-01/02/04/06, ADR-0038). Roll prices are per
 * meter and roll stock shows meters and cut pieces (FR-ROL-01); `?new=1`
 * opens the create dialog (ADR-0018).
 */
export default async function ProductsPage({ searchParams }: PageProps<"/[locale]/products">) {
  const session = await requirePermission("page:products");
  const raw = await searchParams;
  const filters = productFilters.parse({
    q: first(raw.q) ?? "",
    brand: first(raw.brand),
    status: first(raw.status) ?? "active",
    page: first(raw.page) ?? "1",
  });

  const [t, tVariants, locale, brands, page] = await Promise.all([
    getTranslations("Catalog"),
    getTranslations("Variants"),
    getLocale(),
    getBrands(session),
    listProducts(session, filters),
  ]);
  const canUpdate = session.permissions.has("product:update");
  const canCreate = session.permissions.has("product:create") && brands.length > 0;
  const noBrands = brands.length === 0;
  const kept = keptQuery(raw, ["new"]);
  const filtered = filters.q !== "" || filters.brand !== undefined || filters.status !== "active";
  const brandGroups = Object.values(
    Object.groupBy(page.products, (product) => product.brandId ?? ""),
  ).filter((group) => group !== undefined);
  const query = (pageNumber: number) => ({
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.brand ? { brand: filters.brand } : {}),
    ...(filters.status === "active" ? {} : { status: filters.status }),
    ...(pageNumber > 1 ? { page: String(pageNumber) } : {}),
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href={{ pathname: "/products", query: { ...kept, new: "1" } }} scroll={false}>
                <PackagePlus aria-hidden="true" />
                {t("add")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <CatalogTabs current="products" session={session} />

      <Card className="mb-6">
        <FilterForm
          applyLabel={t("filter")}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end xl:grid-cols-5"
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
          <Field label={t("brand")}>
            {(control) => (
              <Select
                {...control}
                name="brand"
                defaultValue={filters.brand ?? ""}
                options={[
                  { value: "", label: t("allBrands") },
                  ...brands.map((brand) => ({ value: brand.id, label: brand.name })),
                ]}
              />
            )}
          </Field>
          <Field label={t("status")}>
            {(control) => (
              <Select
                {...control}
                name="status"
                defaultValue={filters.status}
                options={[
                  { value: "active", label: t("statusActive") },
                  { value: "inactive", label: t("statusInactive") },
                  { value: "all", label: t("statusAll") },
                ]}
              />
            )}
          </Field>
          {filtered ? (
            <Button asChild variant="ghost" className="self-end justify-self-start">
              <Link href="/products">{t("reset")}</Link>
            </Button>
          ) : null}
        </FilterForm>
      </Card>

      <Card>
        {page.products.length === 0 ? (
          <EmptyState
            icon={<PackageSearch aria-hidden="true" />}
            title={noBrands ? t("noBrandsTitle") : filtered ? t("noResultsTitle") : t("emptyTitle")}
            description={
              noBrands
                ? t("noBrandsDescription")
                : filtered
                  ? t("noResultsDescription")
                  : t("emptyDescription")
            }
            action={
              noBrands && session.permissions.has("brand:manage") ? (
                <Button asChild>
                  <Link href="/products/brands">{t("addBrand")}</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableCaption>{t("listCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("brand")}</TableHead>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("motif")}</TableHead>
                <TableHead>{t("thickness")}</TableHead>
                <TableHead>{t("sku")}</TableHead>
                <TableHead className="text-right">{t("price")}</TableHead>
                <TableHead>{t("stock")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            {brandGroups.map((group) => {
              const brand = group[0]?.brandName ?? t("noBrand");
              return (
                <TableGroup
                  key={`${group[0]?.brandId ?? "none"}-${String(filtered)}`}
                  defaultOpen={filtered}
                  leadColSpan={8}
                  className="bg-surface-muted/60"
                  toggleLabel={t("toggleBrand", { brand })}
                  toggleContent={
                    <>
                      <Tag aria-hidden="true" className="size-4 shrink-0 text-primary" />
                      <span>{brand}</span>
                      <span className="text-xs font-normal text-ink-muted">
                        {t("brandGroup", { count: group.length })}
                      </span>
                    </>
                  }
                >
                  {group.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell />
                      <TableCell className="font-medium">
                        {canUpdate ? (
                          <Link
                            href={`/products/${product.id}`}
                            aria-label={t("edit", { name: product.name })}
                            className="underline-offset-4 hover:underline"
                          >
                            {product.name}
                          </Link>
                        ) : (
                          product.name
                        )}
                        <span className="block text-xs font-normal text-ink-muted">
                          {product.isRoll ? t("rollProduct") : product.unit}
                        </span>
                      </TableCell>
                      <TableCell>{product.motif ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {product.thickness ? formatThickness(product.thickness, locale) : "—"}
                      </TableCell>
                      <TableCell className="text-ink-muted">
                        {product.hasVariants
                          ? tVariants("variantCount", { count: product.variantCount })
                          : product.sku}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {product.isRoll
                          ? t("perMeter", { price: formatCurrency(product.price, locale) })
                          : formatCurrency(product.price, locale)}
                      </TableCell>
                      <TableCell>
                        <StockCell
                          trackStock={product.trackStock}
                          stockQty={product.stockQty}
                          minStock={product.minStock}
                          low={product.lowStockVariants > 0}
                          label={
                            product.isRoll
                              ? t("rollStock", {
                                  meters: formatMeters(product.stockQty, locale),
                                  pieces: product.pieceStock,
                                })
                              : undefined
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {product.isActive ? (
                          <Chip tone="success" icon={<CircleCheck aria-hidden="true" />}>
                            {t("active")}
                          </Chip>
                        ) : (
                          <Chip tone="neutral" icon={<CircleOff aria-hidden="true" />}>
                            {t("inactive")}
                          </Chip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableGroup>
              );
            })}
          </Table>
        )}
        {filters.page > 1 || page.hasNextPage ? (
          <nav aria-label={t("pagination")} className="mt-4 flex items-center justify-end gap-2">
            {filters.page > 1 ? (
              <Button asChild variant="ghost">
                <Link href={{ pathname: "/products", query: query(filters.page - 1) }}>
                  {t("previous")}
                </Link>
              </Button>
            ) : null}
            <span className="text-sm text-ink-muted">{t("pageLabel", { page: filters.page })}</span>
            {page.hasNextPage ? (
              <Button asChild variant="secondary">
                <Link href={{ pathname: "/products", query: query(filters.page + 1) }}>
                  {t("next")}
                </Link>
              </Button>
            ) : null}
          </nav>
        ) : null}
      </Card>
      {canCreate && first(raw.new) === "1" ? (
        <NewProductDialog brands={brands} closeHref={{ pathname: "/products", query: kept }} />
      ) : null}
    </>
  );
}
