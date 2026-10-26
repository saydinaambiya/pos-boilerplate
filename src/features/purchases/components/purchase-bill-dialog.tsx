import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps, ReactNode } from "react";

import { DialogSection } from "@/components/ui/dialog";
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

import { getPurchase } from "../service";
import { PurchaseDueMarker, PurchaseStatusChip } from "./purchase-chips";
import { PurchasePaymentForm } from "./purchase-payment-form";

/**
 * One supplier bill and its installments in a dialog over the list
 * (FR-PRB-01/03/04, ADR-0018): `?bill=<id>` on `/purchases`. It holds the
 * summary, the installment history with a delete action each, and the form to
 * record the next installment, so the list page needs no detail page.
 */
export async function PurchaseBillDialog({
  session,
  purchaseId,
  canManage,
  listQuery,
  closeHref,
}: {
  session: Session;
  purchaseId: string;
  /** A read-only holder of `page:purchases` sees the history without the write actions. */
  canManage: boolean;
  /** Current list query, so links keep the filters and page. */
  listQuery: Record<string, string>;
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}) {
  const [t, tCommon, format, locale, purchase] = await Promise.all([
    getTranslations("Purchases"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    getPurchase(session, purchaseId),
  ]);
  if (!purchase) return null;

  const money = (amount: number) => formatCurrency(amount, locale);
  const date = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const row = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );

  return (
    <RouteDialog
      closeHref={closeHref}
      closeLabel={tCommon("close")}
      size="lg"
      title={t("paymentsTitle", { companyName: purchase.companyName })}
      description={purchase.invoiceNo}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-ink">{t("summary")}</h3>
        <PurchaseStatusChip status={purchase.status} />
      </div>
      <dl className="text-sm">
        {row(t("orderDate"), date(purchase.orderDate))}
        {row(t("dueDate"), <PurchaseDueMarker due={purchase.due} dueDate={purchase.dueDate} />)}
        {row(t("total"), money(purchase.total))}
        {row(t("paid"), money(purchase.paidTotal))}
        {row(
          t("balance"),
          <span className="font-semibold text-ink">{money(purchase.balance)}</span>,
        )}
        {purchase.createdByName ? row(t("recordedBy"), purchase.createdByName) : null}
        {purchase.note ? row(t("note"), purchase.note) : null}
      </dl>

      <DialogSection title={t("payments")}>
        {purchase.payments.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("noPayments")}</p>
        ) : (
          <Table>
            <TableCaption>{t("paymentsCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("paidOn")}</TableHead>
                <TableHead>{t("method")}</TableHead>
                <TableHead className="text-right">{t("amount")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchase.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="text-sm">
                    {date(payment.paidOn)}
                    {payment.createdByName ? (
                      <span className="block text-xs text-ink-muted">{payment.createdByName}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t(`methods.${payment.method}`)}
                    {payment.note ? (
                      <span className="block text-xs text-ink-muted">{payment.note}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(payment.amount)}</TableCell>
                  <TableCell className="text-right">
                    {canManage ? (
                      <Link
                        href={{
                          pathname: "/purchases",
                          query: { ...listQuery, bill: purchase.id, deletePayment: payment.id },
                        }}
                        scroll={false}
                        className="text-sm underline-offset-4 hover:underline"
                      >
                        {t("deletePayment")}
                      </Link>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogSection>

      {canManage ? (
        <DialogSection
          title={t("recordPayment")}
          description={t("paymentDescription", { amount: money(purchase.balance) })}
        >
          <PurchasePaymentForm
            purchaseId={purchase.id}
            balanceLabel={money(purchase.balance)}
            orderDate={purchase.orderDate}
            today={purchase.today}
          />
        </DialogSection>
      ) : null}
    </RouteDialog>
  );
}
