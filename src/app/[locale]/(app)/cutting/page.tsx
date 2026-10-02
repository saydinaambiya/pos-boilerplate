import { Scissors, Tag } from "lucide-react";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getFormatter, getLocale, getMessages, getTranslations } from "next-intl/server";
import { z } from "zod";

import { FilterForm } from "@/components/form/filter-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { RouteDialog } from "@/components/ui/route-dialog";
import {
  Table,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableGroup, TableSubGroup } from "@/components/ui/table-group";
import { formatSize, isProductSize } from "@/features/catalog/sizes";
import { CutForm } from "@/features/cutting/components/cut-form";
import { rollFilters } from "@/features/cutting/schemas";
import { getRecentCuts, getRoll, getRolls } from "@/features/cutting/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatMeters } from "@/lib/format/length";
import { variantLabel } from "@/lib/format/variant-label";
import { firstParam } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Cutting");
  return { title: t("title") };
}

/**
 * Cut Rolls (FR-ROL-03, ADR-0023): every active roll with the meters left
 * and the latest cuts, grouped per brand like the product list with each
 * roll's pieces folded under it, ten brands a page; brands start closed
 * until a search applies (ADR-0040, ADR-0041). `?roll=` opens the cut
 * form over the list (ADR-0018).
 */
export default async function CuttingPage({ searchParams }: PageProps<"/[locale]/cutting">) {
  const session = await requirePermission("page:cutting");
  const raw = await searchParams;
  const filters = rollFilters.parse({
    q: firstParam(raw.q) ?? "",
    page: firstParam(raw.page) ?? "1",
  });
  const rollId = z.uuid().safeParse(firstParam(raw.roll));

  const [t, tCommon, format, locale, messages, { rolls, hasNextPage }, cuts, selected] =
    await Promise.all([
      getTranslations("Cutting"),
      getTranslations("Common"),
      getFormatter(),
      getLocale(),
      getMessages(),
      getRolls(session, filters),
      getRecentCuts(session),
      rollId.success ? getRoll(session, rollId.data) : Promise.resolve(undefined),
    ]);
  const meters = (cm: number) => formatMeters(cm, locale);
  const query = (pageNumber: number) => ({
    ...(filters.q ? { q: filters.q } : {}),
    ...(pageNumber > 1 ? { page: String(pageNumber) } : {}),
  });
  const kept = query(filters.page);
  const searched = filters.q !== "";
  const brandGroups = Object.values(Object.groupBy(rolls, (roll) => roll.brandId ?? "")).filter(
    (group) => group !== undefined,
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Card className="mb-6">
        <FilterForm
          applyLabel={t("filter")}
          className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"
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
          {filters.q ? (
            <Button asChild variant="ghost">
              <Link href="/cutting">{t("reset")}</Link>
            </Button>
          ) : null}
        </FilterForm>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          {rolls.length === 0 ? (
            <EmptyState
              icon={<Scissors aria-hidden="true" />}
              title={filters.q ? t("noResultsTitle") : t("emptyTitle")}
              description={filters.q ? t("noResultsDescription") : t("emptyDescription")}
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
                  <TableHead>{t("sku")}</TableHead>
                  <TableHead className="text-right">{t("length")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              {brandGroups.map((group) => {
                const brand = group[0]?.brandName ?? t("noBrand");
                return (
                  <TableGroup
                    key={`${group[0]?.brandId ?? "none"}-${String(searched)}`}
                    defaultOpen={searched}
                    leadColSpan={7}
                    className="bg-surface-muted/60"
                    toggleLabel={t("toggleBrand", { brand })}
                    toggleContent={
                      <>
                        <Tag aria-hidden="true" className="size-4 shrink-0 text-primary" />
                        <span>{brand}</span>
                        <span className="text-xs font-normal text-ink-muted">
                          {t("brandGroup", {
                            count: new Set(group.map((roll) => roll.productId)).size,
                          })}
                        </span>
                      </>
                    }
                  >
                    {group.map((roll) => {
                      const name = variantLabel(roll.productName, roll.colorName);
                      return (
                        <TableSubGroup
                          key={`${roll.id}-${String(searched)}`}
                          defaultOpen={searched}
                          toggleLabel={t("togglePieces", { name, count: roll.pieces.length })}
                          cells={
                            <>
                              <TableCell className="font-medium [overflow-wrap:anywhere]">
                                {roll.productName}
                                <span className="block text-xs font-normal text-ink-muted">
                                  {t("rollUnit")}
                                </span>
                              </TableCell>
                              <TableCell>{roll.motif ?? "—"}</TableCell>
                              <TableCell>{roll.colorName ?? "—"}</TableCell>
                              <TableCell className="text-ink-muted">{roll.sku}</TableCell>
                              <TableCell className="text-right whitespace-nowrap tabular-nums">
                                {meters(roll.stockQty)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button asChild size="sm" variant="secondary">
                                  <Link
                                    href={{
                                      pathname: "/cutting",
                                      query: { ...kept, roll: roll.id },
                                    }}
                                    scroll={false}
                                    aria-label={t("cutNamed", { name })}
                                  >
                                    {t("cut")}
                                  </Link>
                                </Button>
                              </TableCell>
                            </>
                          }
                        >
                          {roll.pieces.length > 0
                            ? roll.pieces.map((piece) => (
                                <TableRow key={piece.id} className="bg-surface-muted/40">
                                  <TableCell />
                                  <TableCell className="pl-8 font-medium">
                                    {[
                                      piece.size ? formatSize(piece.size) : "—",
                                      piece.isDefect ? t("defect") : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </TableCell>
                                  <TableCell />
                                  <TableCell>{roll.colorName ?? "—"}</TableCell>
                                  <TableCell />
                                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                                    {t("pieceStock", { count: piece.stockQty })}
                                  </TableCell>
                                  <TableCell />
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
          {filters.page > 1 || hasNextPage ? (
            <nav aria-label={t("pagination")} className="mt-4 flex items-center justify-end gap-2">
              {filters.page > 1 ? (
                <Button asChild variant="ghost">
                  <Link href={{ pathname: "/cutting", query: query(filters.page - 1) }}>
                    {t("previous")}
                  </Link>
                </Button>
              ) : null}
              <span className="text-sm text-ink-muted">
                {t("pageLabel", { page: filters.page })}
              </span>
              {hasNextPage ? (
                <Button asChild variant="secondary">
                  <Link href={{ pathname: "/cutting", query: query(filters.page + 1) }}>
                    {t("next")}
                  </Link>
                </Button>
              ) : null}
            </nav>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("historyTitle")}</CardTitle>
          </CardHeader>
          {cuts.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("historyEmpty")}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {cuts.map((cut) => (
                <li key={cut.id} className="rounded-card border border-border p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium [overflow-wrap:anywhere] text-ink">
                    {variantLabel(cut.productName, cut.colorName)}
                    {cut.defect ? <Chip tone="warning">{t("defectChip")}</Chip> : null}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {t("cutBy", {
                      time: format.dateTime(cut.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                      name: cut.actorName ?? "—",
                    })}
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                    {cut.pieces.map((piece) => (
                      <li key={piece.size}>
                        {t("pieceLine", {
                          count: piece.qty,
                          size: piece.size ? formatSize(piece.size) : "—",
                        })}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-ink-muted tabular-nums">
                    {t("usedLine", { used: meters(cut.usedCm), left: meters(cut.stockAfter) })}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {selected ? (
        <RouteDialog
          closeHref={{ pathname: "/cutting", query: kept }}
          closeLabel={tCommon("close")}
          size="lg"
          title={t("cutTitle", { name: variantLabel(selected.productName, selected.colorName) })}
          description={t("cutDescription")}
        >
          <NextIntlClientProvider
            messages={{ Cutting: messages.Cutting, Feedback: messages.Feedback }}
          >
            <CutForm
              locale={locale}
              rollId={selected.id}
              stockCm={selected.stockQty}
              pieces={Object.fromEntries(
                selected.pieces.flatMap((piece) =>
                  isProductSize(piece.size) && !piece.isDefect
                    ? [[piece.size, piece.stockQty]]
                    : [],
                ),
              )}
              defectPieces={Object.fromEntries(
                selected.pieces.flatMap((piece) =>
                  isProductSize(piece.size) && piece.isDefect ? [[piece.size, piece.stockQty]] : [],
                ),
              )}
            />
          </NextIntlClientProvider>
        </RouteDialog>
      ) : null}
    </>
  );
}
