import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { getSale } from "@/features/checkout/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { variantLabel } from "@/lib/format/variant-label";
import { basisPointsToPercent } from "@/lib/settings/rates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Receipt");
  return { title: t("pageTitle") };
}

/** Sale detail with the frozen lines, totals and payments (FR-INV-04). */
export default async function SalePage({ params }: PageProps<"/[locale]/pos/sales/[id]">) {
  const { id } = await params;
  const session = await requirePermission("page:pos");
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, format, locale, sale] = await Promise.all([
    getTranslations("Receipt"),
    getFormatter(),
    getLocale(),
    getSale(session, id),
  ]);
  if (!sale) notFound();

  const money = (amount: number) => formatCurrency(amount, locale);
  const rate = (bps: number) => `${basisPointsToPercent(bps)}%`;
  const row = (label: string, value: string, strong = false) => (
    <div
      className={
        strong ? "flex justify-between text-lg font-semibold text-ink" : "flex justify-between"
      }
    >
      <dt className={strong ? undefined : "text-ink-muted"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("title", { invoiceNo: sale.invoiceNo })}
        description={`${format.dateTime(sale.createdAt, { dateStyle: "medium", timeStyle: "short" })} · ${sale.cashierName} · ${t(`statuses.${sale.status}`)}`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={`/print/invoices/${sale.id}`}>{t("print")}</Link>
            </Button>
            <Button asChild>
              <Link href="/pos">{t("newSale")}</Link>
            </Button>
          </>
        }
      />
      <Card className="max-w-3xl">
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
        <dl className="mt-4 ml-auto flex max-w-sm flex-col gap-1 border-t border-border pt-3 text-sm">
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
        <div className="mt-6 ml-auto max-w-sm">
          <h2 className="mb-2 text-sm font-semibold text-ink">{t("payments")}</h2>
          <dl className="flex flex-col gap-1 text-sm">
            {sale.payments.map((payment) =>
              row(
                payment.method === "TRANSFER" && payment.bankName
                  ? t("transferTo", { bank: payment.bankName, account: payment.accountNo ?? "" })
                  : t(`methods.${payment.method}`),
                money(payment.amount),
              ),
            )}
          </dl>
        </div>
      </Card>
    </>
  );
}
