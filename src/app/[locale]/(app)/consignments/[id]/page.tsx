import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FilterForm } from "@/components/form/filter-form";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { RouteDialog } from "@/components/ui/route-dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SaleDialog } from "@/features/checkout/components/sale-dialog";
import { ConsignmentMessages } from "@/features/consignments/components/consignment-messages";
import { SettleForm } from "@/features/consignments/components/settle-form";
import { TakeForm } from "@/features/consignments/components/take-form";
import { matchesGoods, searchBatches } from "@/features/consignments/goods-filter";
import { getConsignment, getSalespeopleFor } from "@/features/consignments/service";
import { getCheckoutBankAccounts, getQrisAccount } from "@/features/settings/service";
import { getOpenShift } from "@/features/shifts/service";
import { defectWord } from "@/features/catalog/sizes";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatMeters } from "@/lib/format/length";
import { goodsName, variantLabel } from "@/lib/format/variant-label";
import { storeDate } from "@/lib/format/zoned-time";
import { readSetting } from "@/lib/settings/store";
import { firstParam, keptQuery } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Consignments");
  return { title: t("title") };
}

/**
 * Item name with its brand beside it, then motif, colour and size, e.g.
 * "Turkiye · Karpet · Mihrab · Merah" (FR-CSG-08, FR-PRD-08).
 */
function itemLabel(item: {
  name: string;
  brandName: string | null;
  motif: string | null;
  variantName: string | null;
}) {
  return variantLabel(
    item.name,
    [item.motif, item.variantName].filter(Boolean).join(" · ") || null,
    item.brandName,
  );
}

/**
 * One salesperson's goods (FR-CSG-02..05, FR-CSG-07..09): what is still out per item, rolls in meters, and
 * every pickup and settlement grouped by day, newest first. `?take=1` adds
 * goods and `?reduce=1` takes off goods entered by mistake (pickup staff),
 * `?return=1` records goods brought back (shop
 * floor) and `?sell=1` lets the salesperson record what they sold; selling
 * takes money, so it needs the salesperson's own open shift, but not the
 * cashier (ADR-0024, ADR-0029). `?sale=` opens the full invoice of a sold
 * batch, also for salespeople without the cashier (FR-CSG-10). `?q=` searches
 * both the summary and the history, and the summary starts with only goods
 * still carried; unticking that sends `carried=0`, so the hidden field keeps
 * the choice in the URL (FR-CSG-11). Dialogs keep the filters.
 */
export default async function ConsignmentPage({
  params,
  searchParams,
}: PageProps<"/[locale]/consignments/[id]">) {
  const session = await requirePermission("page:consignments");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const dialog = (["take", "reduce", "sell", "return"] as const).find(
    (name) => firstParam(query[name]) === "1",
  );
  const viewingSale = firstParam(query.sale);
  const search = (firstParam(query.q) ?? "").trim().slice(0, 60);
  const carriedChoice = [query.carried ?? []].flat();
  const carriedOnly = carriedChoice.length === 0 || carriedChoice.includes("1");
  const filters = keptQuery(query, ["take", "reduce", "sell", "return", "sale"]);
  const here = (extra: Record<string, string> = {}) => ({
    pathname: `/consignments/${id}`,
    query: { ...filters, ...extra },
  });

  const [t, tCommon, format, locale, consignment, salespeople, operations] = await Promise.all([
    getTranslations("Consignments"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    getConsignment(session, id),
    getSalespeopleFor(session),
    readSetting("operations"),
  ]);
  if (!consignment) notFound();

  const open = consignment.status === "OPEN";
  const outstanding = consignment.balances.filter((balance) => balance.outstanding > 0);
  const canTake = open && salespeople.some((person) => person.id === consignment.salespersonId);
  const canReduce = canTake && outstanding.length > 0;
  const isOwn = consignment.salespersonId === session.user.id;
  const canSell =
    open &&
    outstanding.length > 0 &&
    (session.role.isSystem || (isOwn && session.permissions.has("consignment:sell")));
  const shiftOpen = canSell ? (await getOpenShift(session)) !== null : false;
  const canReturn = open && outstanding.length > 0 && session.permissions.has("consignment:return");
  const dayOf = (date: Date) => storeDate(date, operations.timeZone);
  const nameOf = (item: Parameters<typeof goodsName>[0] & { isRoll: boolean }) => {
    const name = goodsName(item, defectWord(locale));
    return item.isRoll ? `${name} · ${t("rollWord")}` : name;
  };
  const amount = (item: { isRoll: boolean }, qty: number) =>
    item.isRoll ? formatMeters(qty, locale) : String(qty);
  const shownBalances = consignment.balances.filter(
    (balance) => (!carriedOnly || balance.outstanding > 0) && matchesGoods(balance, search),
  );
  const batches = searchBatches(consignment.batches, search);
  const days = [...new Set(batches.map((batch) => dayOf(batch.createdAt)))];
  const filtered = search !== "" || !carriedOnly;
  const goodsDetails = (item: { motif: string | null; colorName: string | null }) =>
    [
      item.motif ? `${t("colMotif")}: ${item.motif}` : null,
      item.colorName ? `${t("colColor")}: ${item.colorName}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <PageHeader
        title={t("detailTitle", { name: consignment.salespersonName })}
        description={format.dateTime(consignment.createdAt, { dateStyle: "medium" })}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/consignments">{t("back")}</Link>
            </Button>
            {canTake ? (
              <Button asChild variant="secondary">
                <Link href={here({ take: "1" })} scroll={false}>
                  {t("takeMore")}
                </Link>
              </Button>
            ) : null}
            {canReduce ? (
              <Button asChild variant="secondary">
                <Link href={here({ reduce: "1" })} scroll={false}>
                  {t("recordReduce")}
                </Link>
              </Button>
            ) : null}
            {canReturn ? (
              <Button asChild variant="secondary">
                <Link href={here({ return: "1" })} scroll={false}>
                  {t("recordReturn")}
                </Link>
              </Button>
            ) : null}
            {canSell ? (
              <Button asChild>
                <Link href={here({ sell: "1" })} scroll={false}>
                  {t("recordSold")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Chip tone={open ? "warning" : "success"}>{t(`statuses.${consignment.status}`)}</Chip>
        {open && isOwn && !canSell && !canReturn ? (
          <p className="text-sm text-ink-muted">{t("viewOnly")}</p>
        ) : null}
        {canSell && !shiftOpen ? (
          <p className="text-sm text-ink-muted">{t("sellNeedsShift")}</p>
        ) : null}
      </div>

      <Card className="mb-6">
        <FilterForm
          applyLabel={t("filterApply")}
          className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
        >
          <Field label={t("searchGoods")}>
            {(control) => (
              <Input
                {...control}
                type="search"
                name="q"
                defaultValue={search}
                placeholder={t("searchGoodsPlaceholder")}
                maxLength={60}
              />
            )}
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="carried"
              value="1"
              defaultChecked={carriedOnly}
              className="size-5 accent-primary"
            />
            <input type="hidden" name="carried" value="0" />
            {t("carriedOnly")}
          </label>
          {filtered ? (
            <Button asChild variant="ghost" className="justify-self-start">
              <Link href={`/consignments/${id}`}>{t("resetFilters")}</Link>
            </Button>
          ) : null}
        </FilterForm>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("balanceTitle")}</CardTitle>
            <CardDescription>
              {t("balanceCount", {
                shown: shownBalances.length,
                total: consignment.balances.length,
              })}
            </CardDescription>
          </CardHeader>
          {shownBalances.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {consignment.balances.length === 0 ? t("historyEmpty") : t("balanceNoResults")}
            </p>
          ) : (
            <Table>
              <TableCaption>{t("balanceCaption")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colBrand")}</TableHead>
                  <TableHead>{t("colItem")}</TableHead>
                  <TableHead>{t("colMotif")}</TableHead>
                  <TableHead>{t("colColor")}</TableHead>
                  <TableHead className="text-right">{t("colTaken")}</TableHead>
                  <TableHead className="text-right">{t("colSold")}</TableHead>
                  <TableHead className="text-right">{t("colReturned")}</TableHead>
                  <TableHead className="text-right">{t("colOutstanding")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownBalances.map((balance) => (
                  <TableRow key={balance.variantId}>
                    <TableCell className="[overflow-wrap:anywhere]">
                      {balance.brandName ?? "—"}
                    </TableCell>
                    <TableCell className="[overflow-wrap:anywhere]">
                      {nameOf({ ...balance, brandName: null })}
                    </TableCell>
                    <TableCell className="[overflow-wrap:anywhere]">
                      {balance.motif ?? "—"}
                    </TableCell>
                    <TableCell className="[overflow-wrap:anywhere]">
                      {balance.colorName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {amount(balance, balance.taken)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {amount(balance, balance.sold)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {amount(balance, balance.returned)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {amount(balance, balance.outstanding)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("historyTitle")}</CardTitle>
          </CardHeader>
          {days.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {consignment.batches.length === 0 ? t("historyEmpty") : t("historyNoResults")}
            </p>
          ) : (
            <ol className="flex flex-col gap-5">
              {days.map((day) => (
                <li key={day} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-ink">
                    {format.dateTime(new Date(`${day}T12:00:00Z`), {
                      dateStyle: "full",
                      timeZone: "UTC",
                    })}
                  </h3>
                  <ol className="flex flex-col gap-2">
                    {batches
                      .filter((batch) => dayOf(batch.createdAt) === day)
                      .map((batch) => (
                        <li key={batch.id} className="rounded-card border border-border p-3">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                            <Chip
                              tone={
                                batch.kind === "TAKE"
                                  ? "info"
                                  : batch.kind === "REDUCE"
                                    ? "warning"
                                    : "success"
                              }
                            >
                              {t(`batches.${batch.kind}`)}
                            </Chip>
                            <span className="text-xs font-normal text-ink-muted">
                              {t("batchBy", {
                                time: format.dateTime(batch.createdAt, { timeStyle: "short" }),
                                name: batch.actorName,
                              })}
                            </span>
                          </p>
                          <ul className="mt-2 flex flex-col gap-0.5 text-sm">
                            {batch.items.map((item) => (
                              <li key={item.id} className="flex justify-between gap-3">
                                <span className="min-w-0 [overflow-wrap:anywhere]">
                                  {nameOf(item)}
                                  {goodsDetails(item) ? (
                                    <span className="block text-xs text-ink-muted">
                                      {goodsDetails(item)}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="shrink-0 text-ink-muted tabular-nums">
                                  {t(`items.${item.kind}`, { qty: amount(item, item.qty) })}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {batch.invoiceNo && batch.saleId ? (
                            <p className="mt-2 text-sm">
                              <Link
                                href={here({ sale: batch.saleId })}
                                scroll={false}
                                className="underline underline-offset-4"
                              >
                                {t("invoice", { invoiceNo: batch.invoiceNo })}
                              </Link>
                            </p>
                          ) : null}
                          {batch.note ? (
                            <p className="mt-1 text-xs text-ink-muted">{batch.note}</p>
                          ) : null}
                        </li>
                      ))}
                  </ol>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {viewingSale ? (
        <SaleDialog key={viewingSale} session={session} saleId={viewingSale} closeHref={here()} />
      ) : null}
      {dialog === "take" && canTake ? (
        <RouteDialog
          closeHref={here()}
          closeLabel={tCommon("close")}
          size="lg"
          title={t("takeTitle")}
          description={t("takeDescription")}
        >
          <ConsignmentMessages>
            <TakeForm
              locale={locale}
              salespeople={salespeople.filter((person) => person.id === consignment.salespersonId)}
              defaultSalespersonId={consignment.salespersonId}
            />
          </ConsignmentMessages>
        </RouteDialog>
      ) : null}
      {(dialog === "sell" && canSell) ||
      (dialog === "return" && canReturn) ||
      (dialog === "reduce" && canReduce) ? (
        <RouteDialog
          closeHref={here()}
          closeLabel={tCommon("close")}
          size="lg"
          title={t(`${dialog}Title`)}
          description={t(`${dialog}Description`)}
        >
          <ConsignmentMessages>
            <SettleForm
              locale={locale}
              consignmentId={id}
              mode={dialog}
              items={outstanding.map((balance) => ({
                variantId: balance.variantId,
                label: balance.isRoll
                  ? `${itemLabel(balance)} · ${t("rollWord")}`
                  : itemLabel(balance),
                price: balance.price,
                outstanding: balance.outstanding,
                isRoll: balance.isRoll,
              }))}
              tax={await readSetting("tax")}
              bankAccounts={await getCheckoutBankAccounts(session)}
              qrisAccount={await getQrisAccount(session)}
              canKasbon={session.permissions.has("kasbon:create")}
              canDiscount={session.permissions.has("pos:item-discount")}
              today={storeDate(new Date(), operations.timeZone)}
            />
          </ConsignmentMessages>
        </RouteDialog>
      ) : null}
    </>
  );
}
