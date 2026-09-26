import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ConfirmAction } from "@/components/form/confirm-action";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  deactivateVoucherAction,
  reactivateVoucherAction,
  reviseVoucherAction,
} from "@/features/vouchers/actions";
import { VoucherForm } from "@/features/vouchers/components/voucher-form";
import { VoucherStatusChip } from "@/features/vouchers/components/voucher-status-chip";
import { dateInput, lastDayInput, voucherValueText } from "@/features/vouchers/format";
import { getVoucher } from "@/features/vouchers/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { readSetting } from "@/lib/settings/store";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Vouchers");
  return { title: t("title") };
}

/**
 * Voucher detail (FR-VCH-01..06): active terms, pending revision, revision
 * history, usage history, and the actions allowed in the current state.
 */
export default async function VoucherPage({ params }: PageProps<"/[locale]/vouchers/[id]">) {
  const { id } = await params;
  const session = await requirePermission("page:vouchers");
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, tCommon, tReceipt, format, locale, voucher, operations] = await Promise.all([
    getTranslations("Vouchers"),
    getTranslations("Common"),
    getTranslations("Receipt"),
    getFormatter(),
    getLocale(),
    getVoucher(session, id),
    readSetting("operations"),
  ]);
  if (!voucher) notFound();

  const canRequest = session.permissions.has("voucher:request");
  const money = (amount: number) => formatCurrency(amount, locale);
  const day = (date: Date) => format.dateTime(date, { dateStyle: "medium" });
  const active = voucher.active;
  const editable = voucher.status === "ACTIVE" || voucher.status === "INACTIVE";

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );

  return (
    <>
      <PageHeader
        title={voucher.code}
        description={active?.name}
        actions={
          <Button asChild variant="secondary">
            <Link href="/vouchers">{t("back")}</Link>
          </Button>
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <VoucherStatusChip status={voucher.displayStatus} />
        {voucher.pending && voucher.status !== "PENDING_APPROVAL" ? (
          <span className="text-sm text-ink-muted">{t("pendingRevision")}</span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("activeTerms")}</CardTitle>
          </CardHeader>
          {active ? (
            <dl className="text-sm">
              {row(t("value"), voucherValueText(active.type, active.value, locale))}
              {row(t("minPurchase"), active.minPurchase === null ? "—" : money(active.minPurchase))}
              {row(t("maxDiscount"), active.maxDiscount === null ? "—" : money(active.maxDiscount))}
              {row(t("startDate"), active.startsAt ? day(active.startsAt) : "—")}
              {row(t("endDate"), active.endsAt ? day(new Date(active.endsAt.getTime() - 1)) : "—")}
              {row(
                t("usage"),
                active.quota === null
                  ? t("unlimited", { used: voucher.usageCount })
                  : t("usageOf", { used: voucher.usageCount, quota: active.quota }),
              )}
            </dl>
          ) : (
            <CardDescription>{t("noActiveTerms")}</CardDescription>
          )}
          {canRequest && voucher.status === "ACTIVE" ? (
            <div className="mt-4">
              <ConfirmAction
                action={deactivateVoucherAction.bind(null, voucher.id)}
                locale={locale}
                labels={{
                  trigger: t("deactivate"),
                  title: t("deactivateTitle", { code: voucher.code }),
                  description: t("deactivateDescription"),
                  confirm: t("deactivate"),
                  cancel: tCommon("cancel"),
                  close: tCommon("close"),
                }}
              />
            </div>
          ) : null}
          {canRequest && voucher.status === "INACTIVE" ? (
            <div className="mt-4">
              <ConfirmAction
                action={reactivateVoucherAction.bind(null, voucher.id)}
                locale={locale}
                variant="secondary"
                labels={{
                  trigger: t("reactivate"),
                  title: t("reactivateTitle", { code: voucher.code }),
                  description: t("reactivateDescription"),
                  confirm: t("reactivate"),
                  cancel: tCommon("cancel"),
                  close: tCommon("close"),
                }}
              />
            </div>
          ) : null}
        </Card>

        {canRequest && editable && active ? (
          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle>{t("reviseTitle")}</CardTitle>
              <CardDescription>{t("reviseHint")}</CardDescription>
            </CardHeader>
            <VoucherForm
              action={reviseVoucherAction.bind(null, voucher.id)}
              submitLabel={t("revise")}
              withCode={false}
              defaults={{
                name: active.name,
                type: active.type,
                value: String(active.type === "PERCENT" ? active.value / 100 : active.value),
                minPurchase: active.minPurchase === null ? "" : String(active.minPurchase),
                maxDiscount: active.maxDiscount === null ? "" : String(active.maxDiscount),
                startDate: active.startsAt ? dateInput(active.startsAt, operations.timeZone) : "",
                endDate: active.endsAt ? lastDayInput(active.endsAt, operations.timeZone) : "",
                quota: active.quota === null ? "" : String(active.quota),
              }}
            />
          </Card>
        ) : null}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("history")}</CardTitle>
        </CardHeader>
        <Table>
          <TableCaption>{t("historyCaption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("submittedAt")}</TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("value")}</TableHead>
              <TableHead>{t("status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {voucher.revisions.map((revision) => (
              <TableRow key={revision.revisionId}>
                <TableCell>
                  {format.dateTime(revision.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                </TableCell>
                <TableCell>{revision.name}</TableCell>
                <TableCell className="tabular-nums">
                  {voucherValueText(revision.type, revision.value, locale)}
                </TableCell>
                <TableCell>{t(`revisionStatuses.${revision.status}`)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("usageHistory")}</CardTitle>
        </CardHeader>
        {voucher.usage.length === 0 ? (
          <CardDescription>{t("noUsage")}</CardDescription>
        ) : (
          <Table>
            <TableCaption>{t("usageCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("invoice")}</TableHead>
                <TableHead>{t("date")}</TableHead>
                <TableHead className="text-right">{t("discount")}</TableHead>
                <TableHead>{t("saleStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {voucher.usage.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>
                    <Link
                      href={`/pos/sales/${sale.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {sale.invoiceNo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {format.dateTime(sale.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(sale.voucherDiscount)}
                  </TableCell>
                  <TableCell>{tReceipt(`statuses.${sale.status}`)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
