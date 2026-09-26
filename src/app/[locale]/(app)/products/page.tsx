import { CircleCheck, CircleOff, PackagePlus, PackageSearch } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

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
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CatalogTabs } from "@/features/catalog/components/catalog-tabs";
import { StockCell } from "@/features/catalog/components/stock-cell";
import { productFilters } from "@/features/catalog/schemas";
import { getCategories, listProducts } from "@/features/catalog/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Catalog");
  return { title: t("title") };
}

/** Product list with name/SKU search and filters (FR-PRD-01/02/04). */
export default async function ProductsPage({ searchParams }: PageProps<"/[locale]/products">) {
  const session = await requirePermission("page:products");
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const filters = productFilters.parse({
    q: first(raw.q) ?? "",
    category: first(raw.category),
    status: first(raw.status) ?? "active",
    page: first(raw.page) ?? "1",
  });

  const [t, tVariants, locale, categories, page] = await Promise.all([
    getTranslations("Catalog"),
    getTranslations("Variants"),
    getLocale(),
    getCategories(session),
    listProducts(session, filters),
  ]);
  const canSeeCost = session.permissions.has("product:view-cost");
  const canUpdate = session.permissions.has("product:update");
  const filtered =
    filters.q !== "" || filters.category !== undefined || filters.status !== "active";
  const query = (pageNumber: number) => ({
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.status === "active" ? {} : { status: filters.status }),
    ...(pageNumber > 1 ? { page: String(pageNumber) } : {}),
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          session.permissions.has("product:create") && categories.length > 0 ? (
            <Button asChild>
              <Link href="/products/new">
                <PackagePlus aria-hidden="true" />
                {t("add")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <CatalogTabs current="products" session={session} />

      <Card className="mb-6">
        <form
          method="get"
          role="search"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
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
          <Field label={t("category")}>
            {(control) => (
              <Select
                {...control}
                name="category"
                defaultValue={filters.category ?? ""}
                options={[
                  { value: "", label: t("allCategories") },
                  ...categories.map((category) => ({ value: category.id, label: category.name })),
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
          <div className="flex gap-2">
            <Button type="submit">{t("filter")}</Button>
            {filtered ? (
              <Button asChild variant="ghost">
                <Link href="/products">{t("reset")}</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <Card>
        {page.products.length === 0 ? (
          <EmptyState
            icon={<PackageSearch aria-hidden="true" />}
            title={
              categories.length === 0
                ? t("noCategoriesTitle")
                : filtered
                  ? t("noResultsTitle")
                  : t("emptyTitle")
            }
            description={
              categories.length === 0
                ? t("noCategoriesDescription")
                : filtered
                  ? t("noResultsDescription")
                  : t("emptyDescription")
            }
            action={
              categories.length === 0 && session.permissions.has("category:manage") ? (
                <Button asChild>
                  <Link href="/products/categories">{t("addCategory")}</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableCaption>{t("listCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("category")}</TableHead>
                <TableHead>{t("sku")}</TableHead>
                <TableHead className="text-right">{t("price")}</TableHead>
                {canSeeCost ? (
                  <>
                    <TableHead className="text-right">{t("cost")}</TableHead>
                    <TableHead className="text-right">{t("margin")}</TableHead>
                  </>
                ) : null}
                <TableHead>{t("stock")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.products.map((product) => (
                <TableRow key={product.id}>
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
                    <span className="block text-xs font-normal text-ink-muted">{product.unit}</span>
                  </TableCell>
                  <TableCell>{product.categoryName}</TableCell>
                  <TableCell className="text-ink-muted">
                    {product.hasVariants
                      ? tVariants("variantCount", { count: product.variantCount })
                      : product.sku}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(product.price, locale)}
                  </TableCell>
                  {canSeeCost && product.cost !== null ? (
                    <>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(product.cost, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(product.price - product.cost, locale)}
                      </TableCell>
                    </>
                  ) : null}
                  <TableCell>
                    <StockCell
                      trackStock={product.trackStock}
                      stockQty={product.stockQty}
                      minStock={product.minStock}
                      low={product.lowStockVariants > 0}
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
            </TableBody>
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
    </>
  );
}
