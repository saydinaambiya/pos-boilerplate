import { History } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ActionForm } from "@/components/form/action-form";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { FilterForm } from "@/components/form/filter-form";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
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
import { stockMovementTypes } from "@/db/schema";
import { StockCell } from "@/features/catalog/components/stock-cell";
import {
  countStockAction,
  receiveStockAction,
  writeOffStockAction,
} from "@/features/stock/actions";
import { ShowArchivedField } from "@/features/housekeeping/components/show-archived-field";
import { movementFilters } from "@/features/stock/schemas";
import { getMovements, getVariantStock } from "@/features/stock/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { variantLabel } from "@/lib/format/variant-label";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Stock");
  return { title: t("title") };
}

/** One variant's stock: manual movements and the filtered ledger (FR-STK-01/05/06). */
export default async function VariantStockPage({
  params,
  searchParams,
}: PageProps<"/[locale]/stock/[variantId]">) {
  const { variantId } = await params;
  const session = await requirePermission("page:stock");
  if (!z.uuid().safeParse(variantId).success) notFound();

  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const filters = movementFilters.parse({
    type: first(raw.type),
    from: first(raw.from),
    to: first(raw.to),
    cursor: first(raw.cursor),
    archived: first(raw.archived),
  });

  const [t, format, locale, variant, history] = await Promise.all([
    getTranslations("Stock"),
    getFormatter(),
    getLocale(),
    getVariantStock(session, variantId),
    getMovements(session, variantId, filters),
  ]);
  if (!variant) notFound();

  const canAdjust = session.permissions.has("stock:adjust") && variant.trackStock;
  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(
      (entry): entry is [string, string] => entry[0] !== "cursor" && entry[1] !== undefined,
    ),
  );
  const quantityProps = { inputMode: "numeric", maxLength: 7, autoComplete: "off" } as const;

  return (
    <>
      <PageHeader
        title={variantLabel(variant.productName, variant.colorName)}
        description={`${variant.sku} · ${variant.categoryName}`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/stock">{t("back")}</Link>
          </Button>
        }
      />

      <Card className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <p className="text-sm text-ink-muted">{t("current")}</p>
          <p className="text-3xl font-semibold text-ink tabular-nums">
            {t("currentValue", { qty: variant.stockQty, unit: variant.unit })}
          </p>
        </div>
        <StockCell
          trackStock={variant.trackStock}
          stockQty={variant.stockQty}
          minStock={variant.minStock}
        />
        <p className="text-sm text-ink-muted">{t("minimumValue", { qty: variant.minStock })}</p>
      </Card>

      {canAdjust ? (
        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle>{t("receiveTitle")}</CardTitle>
              <CardDescription>{t("receiveDescription")}</CardDescription>
            </CardHeader>
            <ActionForm action={receiveStockAction.bind(null, variantId)} locale={locale}>
              <FormField name="qty" label={t("quantity")} {...quantityProps} />
              <FormField name="note" label={t("note")} hint={t("noteHint")} maxLength={200} />
              <SubmitButton className="self-start">{t("receive")}</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle>{t("countTitle")}</CardTitle>
              <CardDescription>{t("countDescription")}</CardDescription>
            </CardHeader>
            <ActionForm action={countStockAction.bind(null, variantId)} locale={locale}>
              <FormField name="counted" label={t("counted")} {...quantityProps} />
              <FormField
                name="reason"
                label={t("reason")}
                hint={t("countReasonHint")}
                maxLength={200}
              />
              <SubmitButton variant="secondary" className="self-start">
                {t("count")}
              </SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle>{t("writeOffTitle")}</CardTitle>
              <CardDescription>{t("writeOffDescription")}</CardDescription>
            </CardHeader>
            <ActionForm action={writeOffStockAction.bind(null, variantId)} locale={locale}>
              <FormField name="qty" label={t("quantity")} {...quantityProps} />
              <FormField
                name="reason"
                label={t("reason")}
                hint={t("writeOffReasonHint")}
                maxLength={200}
              />
              <SubmitButton variant="danger" className="self-start">
                {t("writeOff")}
              </SubmitButton>
            </ActionForm>
          </Card>
        </div>
      ) : (
        <p className="mb-6 text-sm text-ink-muted">
          {variant.trackStock ? t("readOnly") : t("errorNotTracked")}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("history")}</CardTitle>
        </CardHeader>
        <FilterForm
          applyLabel={t("filter")}
          className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        >
          <Field label={t("type")}>
            {(control) => (
              <Select
                {...control}
                name="type"
                defaultValue={filters.type ?? ""}
                options={[
                  { value: "", label: t("allTypes") },
                  ...stockMovementTypes.map((type) => ({ value: type, label: t(`types.${type}`) })),
                ]}
              />
            )}
          </Field>
          <Field label={t("from")}>
            {(control) => (
              <DatePicker {...control} name="from" defaultValue={filters.from ?? ""} clearable />
            )}
          </Field>
          <Field label={t("to")}>
            {(control) => (
              <DatePicker {...control} name="to" defaultValue={filters.to ?? ""} clearable />
            )}
          </Field>
          <ShowArchivedField checked={filters.archived === "1"} />
        </FilterForm>

        {history.movements.length === 0 ? (
          <EmptyState
            icon={<History aria-hidden="true" />}
            title={t("historyEmpty")}
            description={t("historyEmptyDescription")}
          />
        ) : (
          <Table>
            <TableCaption>{t("historyCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("time")}</TableHead>
                <TableHead>{t("type")}</TableHead>
                <TableHead className="text-right">{t("change")}</TableHead>
                <TableHead className="text-right">{t("after")}</TableHead>
                <TableHead>{t("reason")}</TableHead>
                <TableHead>{t("actor")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.movements.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="whitespace-nowrap">
                    <time dateTime={movement.createdAt.toISOString()}>
                      {format.dateTime(movement.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </TableCell>
                  <TableCell>{t(`types.${movement.type}`)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      movement.qtyDelta < 0 && "text-danger-ink",
                    )}
                  >
                    {movement.qtyDelta > 0 ? `+${movement.qtyDelta}` : movement.qtyDelta}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{movement.stockAfter}</TableCell>
                  <TableCell className="max-w-64 break-words">{movement.reason ?? "—"}</TableCell>
                  <TableCell>{movement.actorName ?? t("system")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {filters.cursor ? (
            <Button asChild variant="ghost">
              <Link href={{ pathname: `/stock/${variantId}`, query: activeFilters }}>
                {t("newest")}
              </Link>
            </Button>
          ) : null}
          {history.nextCursor ? (
            <Button asChild variant="secondary">
              <Link
                href={{
                  pathname: `/stock/${variantId}`,
                  query: { ...activeFilters, cursor: history.nextCursor },
                }}
              >
                {t("older")}
              </Link>
            </Button>
          ) : null}
        </div>
      </Card>
    </>
  );
}
