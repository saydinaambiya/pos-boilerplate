import { Boxes } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

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
import { variantLabel } from "@/lib/format/variant-label";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Stock");
  return { title: t("title") };
}

/** Stock per variant with search and a low-stock filter (FR-STK-01, FR-STK-07). */
export default async function StockPage({ searchParams }: PageProps<"/[locale]/stock">) {
  const session = await requirePermission("page:stock");
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const filters = stockFilters.parse({
    q: first(raw.q) ?? "",
    low: first(raw.low),
    page: first(raw.page) ?? "1",
  });
  const [t, page] = await Promise.all([getTranslations("Stock"), getStockLevels(session, filters)]);
  const filtered = filters.q !== "" || filters.low !== undefined;
  const query = (pageNumber: number) => ({
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.low ? { low: filters.low } : {}),
    ...(pageNumber > 1 ? { page: String(pageNumber) } : {}),
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Card className="mb-6">
        <form
          method="get"
          role="search"
          className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
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
          <div className="flex gap-2">
            <Button type="submit">{t("filter")}</Button>
            {filtered ? (
              <Button asChild variant="ghost">
                <Link href="/stock">{t("reset")}</Link>
              </Button>
            ) : null}
          </div>
        </form>
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
                <TableHead>{t("category")}</TableHead>
                <TableHead>{t("stock")}</TableHead>
                <TableHead className="text-right">{t("minStock")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.levels.map((level) => (
                <TableRow key={level.variantId}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/stock/${level.variantId}`}
                      aria-label={t("open", {
                        name: variantLabel(level.productName, level.colorName),
                      })}
                      className="underline-offset-4 hover:underline"
                    >
                      {variantLabel(level.productName, level.colorName)}
                    </Link>
                    <span className="block text-xs font-normal text-ink-muted">{level.unit}</span>
                  </TableCell>
                  <TableCell className="text-ink-muted">{level.sku}</TableCell>
                  <TableCell>{level.categoryName}</TableCell>
                  <TableCell>
                    <StockCell trackStock stockQty={level.stockQty} minStock={level.minStock} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{level.minStock}</TableCell>
                </TableRow>
              ))}
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
