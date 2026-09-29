import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";
import { z } from "zod";

import { ConfirmAction } from "@/components/form/confirm-action";
import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
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
import { Link } from "@/i18n/navigation";
import type { Session } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/format/currency";
import { formatIndonesianPhone } from "@/lib/format/phone";
import { variantLabel } from "@/lib/format/variant-label";
import { basisPointsToPercent } from "@/lib/settings/rates";

import { getSale } from "../service";
import { requestVoidAction } from "../void-actions";
import { getPendingVoid } from "../void-service";

interface SaleDialogProps {
  session: Session;
  saleId: string;
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}

/**
 * Sale detail in a dialog over the transaction history (FR-INV-04,
 * FR-POS-10, ADR-0018): the frozen lines, totals and payments, with reprint
 * and void. Renders nothing for an unknown or foreign sale.
 */
export async function SaleDialog({ session, saleId, closeHref }: SaleDialogProps) {
  if (!z.uuid().safeParse(saleId).success) return null;
  const [t, tCommon, format, locale, sale, pendingVoid] = await Promise.all([
    getTranslations("Receipt"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    getSale(session, saleId),
    getPendingVoid(saleId),
  ]);
  if (!sale) return null;
  const canRequestVoid =
    sale.status === "COMPLETED" &&
    !sale.consignmentId &&
    !pendingVoid &&
    session.permissions.has("sale:void");

  const money = (amount: number) => formatCurrency(amount, locale);
  const rate = (bps: number) => `${basisPointsToPercent(bps)}%`;
  const row = (label: string, value: string, strong = false) => (
    <div
      key={`${label}-${value}`}
      className={
        strong ? "flex justify-between text-lg font-semibold text-ink" : "flex justify-between"
      }
    >
      <dt className={strong ? undefined : "text-ink-muted"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );

  return (
    <RouteDialog
      closeHref={closeHref}
      closeLabel={tCommon("close")}
      size="xl"
      title={t("title", { invoiceNo: sale.invoiceNo })}
      description={[
        format.dateTime(sale.createdAt, { dateStyle: "medium", timeStyle: "short" }),
        sale.cashierName,
        sale.customerName ? t("customer", { name: sale.customerName }) : null,
        sale.customerPhone ? formatIndonesianPhone(sale.customerPhone) : null,
        t(`statuses.${sale.status}`),
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/print/invoices/${sale.id}`}>{t("print")}</Link>
        </Button>
        {sale.kasbonId && session.permissions.has("page:kasbon") ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/kasbon/${sale.kasbonId}`}>
              {t("openKasbon", { name: sale.customerName ?? "" })}
            </Link>
          </Button>
        ) : null}
      </div>
      <Table>
        <TableCaption>{t("itemsCaption")}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{t("item")}</TableHead>
            <TableHead className="text-right">{t("qty")}</TableHead>
            <TableHead className="text-right">{t("price")}</TableHead>
            <TableHead className="text-right">{t("lineTotal")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sale.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="[overflow-wrap:anywhere]">
                {variantLabel(item.nameSnapshot, item.variantSnapshot)}
                {item.detailsSnapshot || item.lengthCm !== null ? (
                  <span className="block text-xs text-ink-muted">
                    {[
                      item.detailsSnapshot,
                      item.lengthCm === null
                        ? null
                        : t("cutLabel", { length: String(item.lengthCm) }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
                {item.discountAmount > 0 ? (
                  <span className="block text-xs text-ink-muted">
                    {t("discount", { amount: money(item.discountAmount) })}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">{item.qty}</TableCell>
              <TableCell className="text-right tabular-nums">{money(item.unitPrice)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(item.lineTotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">{t("payments")}</h3>
          <dl className="flex flex-col gap-1 text-sm">
            {sale.payments.map((payment) =>
              row(
                payment.method === "TRANSFER" && payment.bankName
                  ? t("transferTo", { bank: payment.bankName, account: payment.accountNo ?? "" })
                  : payment.method === "QRIS"
                    ? t("qrisFrom", { source: payment.sourceBank ?? "—" })
                    : t(`methods.${payment.method}`),
                money(payment.amount),
              ),
            )}
            {sale.kasbonTotal !== null ? row(t("methods.KASBON"), money(sale.kasbonTotal)) : null}
            {sale.kasbonBalance !== null
              ? row(t("kasbonBalance"), money(sale.kasbonBalance), true)
              : null}
          </dl>
        </div>
        <dl className="flex flex-col gap-1 text-sm sm:order-first">
          {row(t("subtotal"), money(sale.subtotal))}
          {sale.voucherDiscount > 0 ? row(t("voucher"), `−${money(sale.voucherDiscount)}`) : null}
          {sale.serviceAmount > 0
            ? row(t("service", { rate: rate(sale.serviceRateBps) }), money(sale.serviceAmount))
            : null}
          {sale.ppnRateBps > 0
            ? row(
                sale.priceIncludesTax
                  ? t("ppnIncluded", { rate: rate(sale.ppnRateBps) })
                  : t("ppn", { rate: rate(sale.ppnRateBps) }),
                money(sale.ppnAmount),
              )
            : null}
          {row(t("total"), money(sale.grandTotal), true)}
        </dl>
      </div>
      {sale.status === "VOIDED" ? (
        <p role="status" className="border-t border-border pt-4 font-medium text-danger-ink">
          {t("voidedNotice")}
        </p>
      ) : pendingVoid ? (
        <p role="status" className="border-t border-border pt-4 font-medium text-ink">
          {t("voidPending")}
        </p>
      ) : canRequestVoid ? (
        <div className="border-t border-border pt-4">
          <ConfirmAction
            action={requestVoidAction.bind(null, sale.id)}
            locale={locale}
            labels={{
              trigger: t("void"),
              title: t("voidTitle", { invoiceNo: sale.invoiceNo }),
              description: t("voidDescription"),
              confirm: t("voidSubmit"),
              cancel: tCommon("cancel"),
              close: tCommon("close"),
            }}
          >
            <FormField name="reason" label={t("voidReason")} maxLength={200} />
          </ConfirmAction>
        </div>
      ) : null}
    </RouteDialog>
  );
}
