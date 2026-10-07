import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
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
import { ConsignmentMessages } from "@/features/consignments/components/consignment-messages";
import { SettleForm } from "@/features/consignments/components/settle-form";
import { TakeForm } from "@/features/consignments/components/take-form";
import { getConsignment, getSalespeopleFor } from "@/features/consignments/service";
import { getCheckoutBankAccounts, getQrisAccount } from "@/features/settings/service";
import { getOpenShift } from "@/features/shifts/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { variantLabel } from "@/lib/format/variant-label";
import { storeDate } from "@/lib/format/zoned-time";
import { readSetting } from "@/lib/settings/store";
import { firstParam } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Consignments");
  return { title: t("title") };
}

/** Item name with its motif, colour and size, e.g. "Karpet · Mihrab · Merah" (FR-CSG-08). */
function itemLabel(item: { name: string; motif: string | null; variantName: string | null }) {
  return variantLabel(
    item.name,
    [item.motif, item.variantName].filter(Boolean).join(" · ") || null,
  );
}

/**
 * One salesperson's goods (FR-CSG-02..05, FR-CSG-07/08): what is still out per item and
 * every pickup and settlement grouped by day, newest first. `?take=1` adds
 * goods and `?reduce=1` takes off goods entered by mistake (pickup staff),
 * `?return=1` records goods brought back (shop
 * floor) and `?sell=1` lets the salesperson record what they sold; selling
 * takes money, so it needs the salesperson's own open shift, but not the
 * cashier (ADR-0024, ADR-0029).
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
  const days = [...new Set(consignment.batches.map((batch) => dayOf(batch.createdAt)))];

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
                <Link href={`/consignments/${id}?take=1`} scroll={false}>
                  {t("takeMore")}
                </Link>
              </Button>
            ) : null}
            {canReduce ? (
              <Button asChild variant="secondary">
                <Link href={`/consignments/${id}?reduce=1`} scroll={false}>
                  {t("recordReduce")}
                </Link>
              </Button>
            ) : null}
            {canReturn ? (
              <Button asChild variant="secondary">
                <Link href={`/consignments/${id}?return=1`} scroll={false}>
                  {t("recordReturn")}
                </Link>
              </Button>
            ) : null}
            {canSell ? (
              <Button asChild>
                <Link href={`/consignments/${id}?sell=1`} scroll={false}>
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

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("balanceTitle")}</CardTitle>
          </CardHeader>
          <Table>
            <TableCaption>{t("balanceCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colItem")}</TableHead>
                <TableHead>{t("colMotif")}</TableHead>
                <TableHead className="text-right">{t("colTaken")}</TableHead>
                <TableHead className="text-right">{t("colSold")}</TableHead>
                <TableHead className="text-right">{t("colReturned")}</TableHead>
                <TableHead className="text-right">{t("colOutstanding")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consignment.balances.map((balance) => (
                <TableRow key={balance.variantId}>
                  <TableCell className="[overflow-wrap:anywhere]">
                    {variantLabel(balance.name, balance.variantName)}
                  </TableCell>
                  <TableCell className="[overflow-wrap:anywhere]">{balance.motif ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{balance.taken}</TableCell>
                  <TableCell className="text-right tabular-nums">{balance.sold}</TableCell>
                  <TableCell className="text-right tabular-nums">{balance.returned}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {balance.outstanding}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("historyTitle")}</CardTitle>
          </CardHeader>
          {days.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("historyEmpty")}</p>
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
                    {consignment.batches
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
                                  {itemLabel(item)}
                                </span>
                                <span className="shrink-0 text-ink-muted tabular-nums">
                                  {t(`items.${item.kind}`, { qty: item.qty })}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {batch.invoiceNo && batch.saleId ? (
                            <p className="mt-2 text-sm">
                              {session.permissions.has("page:pos") ? (
                                <Link
                                  href={`/pos/sales?view=${batch.saleId}`}
                                  className="underline underline-offset-4"
                                >
                                  {t("invoice", { invoiceNo: batch.invoiceNo })}
                                </Link>
                              ) : (
                                t("invoice", { invoiceNo: batch.invoiceNo })
                              )}
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

      {dialog === "take" && canTake ? (
        <RouteDialog
          closeHref={`/consignments/${id}`}
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
          closeHref={`/consignments/${id}`}
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
                label: itemLabel(balance),
                price: balance.price,
                outstanding: balance.outstanding,
              }))}
              tax={await readSetting("tax")}
              bankAccounts={await getCheckoutBankAccounts(session)}
              qrisAccount={await getQrisAccount(session)}
              canKasbon={session.permissions.has("kasbon:create")}
              today={storeDate(new Date(), operations.timeZone)}
            />
          </ConsignmentMessages>
        </RouteDialog>
      ) : null}
    </>
  );
}
