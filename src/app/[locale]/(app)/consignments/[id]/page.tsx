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
import { getCheckoutBankAccounts } from "@/features/settings/service";
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

/**
 * One salesperson's goods (FR-CSG-02..05): what is still out per item and
 * every pickup and settlement grouped by day, newest first. `?take=1` adds
 * goods and `?settle=1` settles sold and returned goods; settling takes
 * money, so it needs POS access and an open shift.
 */
export default async function ConsignmentPage({
  params,
  searchParams,
}: PageProps<"/[locale]/consignments/[id]">) {
  const session = await requirePermission("page:consignments");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const dialog =
    firstParam(query.take) === "1" ? "take" : firstParam(query.settle) === "1" ? "settle" : null;

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
  const canSettle =
    open && outstanding.length > 0 && canTake && session.permissions.has("page:pos");
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
            {canSettle ? (
              <Button asChild>
                <Link href={`/consignments/${id}?settle=1`} scroll={false}>
                  {t("settle")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Chip tone={open ? "warning" : "success"}>{t(`statuses.${consignment.status}`)}</Chip>
        {open && outstanding.length > 0 && !session.permissions.has("page:pos") ? (
          <p className="text-sm text-ink-muted">{t("settleNeedsPos")}</p>
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
                            <Chip tone={batch.kind === "TAKE" ? "info" : "success"}>
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
                                  {variantLabel(item.name, item.variantName)}
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
      {dialog === "settle" && canSettle ? (
        <RouteDialog
          closeHref={`/consignments/${id}`}
          closeLabel={tCommon("close")}
          size="lg"
          title={t("settleTitle")}
          description={t("settleDescription")}
        >
          <ConsignmentMessages>
            <SettleForm
              locale={locale}
              consignmentId={id}
              items={outstanding.map((balance) => ({
                variantId: balance.variantId,
                label: variantLabel(balance.name, balance.variantName),
                price: balance.price,
                outstanding: balance.outstanding,
              }))}
              tax={await readSetting("tax")}
              bankAccounts={await getCheckoutBankAccounts(session)}
              canKasbon={session.permissions.has("kasbon:create")}
              today={storeDate(new Date(), operations.timeZone)}
            />
          </ConsignmentMessages>
        </RouteDialog>
      ) : null}
    </>
  );
}
