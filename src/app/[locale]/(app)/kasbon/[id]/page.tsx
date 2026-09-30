import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getFormatter, getLocale, getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { ConfirmAction } from "@/components/form/confirm-action";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
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
import { cancelApprovalAction } from "@/features/approvals/actions";
import { DueMarker, KasbonStatusChip } from "@/features/kasbon/components/kasbon-chips";
import { KasbonPaymentForm } from "@/features/kasbon/components/kasbon-payment-form";
import { getKasbon, kasbonPaysDirectly } from "@/features/kasbon/service";
import { getKasbonBankAccounts } from "@/features/settings/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { formatIndonesianPhone } from "@/lib/format/phone";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Kasbon");
  return { title: t("title") };
}

const paymentTones = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
} as const;

/**
 * One store credit (FR-KSB-02..05): customer, amounts, due marker, the
 * form to record an installment, and every payment with its approval state.
 */
export default async function KasbonDetailPage({ params }: PageProps<"/[locale]/kasbon/[id]">) {
  const { id } = await params;
  const session = await requirePermission("page:kasbon");
  if (!z.uuid().safeParse(id).success) notFound();
  const canPay = session.permissions.has("kasbon:pay");
  const [t, tApprovals, tCommon, format, locale, kasbon, bankAccounts, messages, direct] =
    await Promise.all([
      getTranslations("Kasbon"),
      getTranslations("Approvals"),
      getTranslations("Common"),
      getFormatter(),
      getLocale(),
      getKasbon(session, id),
      canPay ? getKasbonBankAccounts(session) : [],
      getMessages(),
      canPay ? kasbonPaysDirectly(session) : false,
    ]);
  if (!kasbon) notFound();

  const money = (amount: number) => formatCurrency(amount, locale);
  const row = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );

  return (
    <>
      <PageHeader
        title={kasbon.customerName}
        description={t("detailSubtitle", {
          phone: formatIndonesianPhone(kasbon.customerPhone),
          invoiceNo: kasbon.invoiceNo,
        })}
        actions={
          <Button asChild variant="secondary">
            <Link href="/kasbon">{t("back")}</Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("summary")}</CardTitle>
              <KasbonStatusChip status={kasbon.status} />
            </CardHeader>
            <dl className="text-sm">
              {row(
                t("invoice"),
                <Link
                  href={`/pos/sales?view=${kasbon.saleId}`}
                  className="underline-offset-4 hover:underline"
                >
                  {kasbon.invoiceNo}
                </Link>,
              )}
              {row(
                t("createdAt"),
                format.dateTime(kasbon.createdAt, { dateStyle: "medium", timeStyle: "short" }),
              )}
              {row(t("cashier"), kasbon.cashierName)}
              {row(t("total"), money(kasbon.total))}
              {row(t("paid"), money(kasbon.paidTotal))}
              {row(
                t("balance"),
                <span className="font-semibold text-ink">{money(kasbon.balance)}</span>,
              )}
              {kasbon.pendingTotal > 0 ? row(t("pending"), money(kasbon.pendingTotal)) : null}
              {row(
                t("age"),
                `${t("ageDays", { days: kasbon.ageDays })} · ${t(`aging.${kasbon.aging}`)}`,
              )}
              {row(t("dueDate"), <DueMarker due={kasbon.due} dueDate={kasbon.dueDate} />)}
              {kasbon.customerNote ? row(t("customerNote"), kasbon.customerNote) : null}
            </dl>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("payments")}</CardTitle>
            </CardHeader>
            {kasbon.installments.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("noPayments")}</p>
            ) : (
              <Table>
                <TableCaption>{t("paymentsCaption")}</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("paymentDate")}</TableHead>
                    <TableHead>{t("method")}</TableHead>
                    <TableHead className="text-right">{t("amount")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t("actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kasbon.installments.map((installment) => {
                    const status = installment.approvalStatus ?? "PENDING";
                    return (
                      <TableRow key={installment.id}>
                        <TableCell className="text-sm">
                          {format.dateTime(installment.createdAt, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                          {installment.requesterName ? (
                            <span className="block text-xs text-ink-muted">
                              {installment.requesterName}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">
                          <ul className="flex flex-col gap-0.5">
                            {installment.parts.map((part, index) => (
                              <li key={index}>
                                {part.method === "TRANSFER"
                                  ? t("transferPart", { bank: part.bankName ?? "" })
                                  : t("cashPart")}
                                {installment.parts.length > 1 ? ` · ${money(part.amount)}` : null}
                                {part.reference ? (
                                  <span className="block text-xs text-ink-muted">
                                    {part.reference}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(installment.total)}
                        </TableCell>
                        <TableCell>
                          <Chip tone={paymentTones[status]}>
                            {tApprovals(`statuses.${status}`)}
                          </Chip>
                          {installment.approvalNote ? (
                            <span className="block text-xs text-ink-muted">
                              {installment.approvalNote}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {status === "PENDING" &&
                          installment.approvalId &&
                          installment.approvalVersion !== null &&
                          installment.requestedBy === session.user.id ? (
                            <ConfirmAction
                              action={cancelApprovalAction.bind(
                                null,
                                installment.approvalId,
                                installment.approvalVersion,
                              )}
                              locale={locale}
                              variant="secondary"
                              labels={{
                                trigger: tApprovals("cancelRequest"),
                                title: tApprovals("cancelTitle"),
                                description: tApprovals("cancelDescription"),
                                confirm: tApprovals("cancelRequest"),
                                cancel: tApprovals("keep"),
                                close: tCommon("close"),
                              }}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>

        {canPay && kasbon.status !== "SETTLED" ? (
          <Card className="self-start">
            <CardHeader>
              <CardTitle>{t("recordPayment")}</CardTitle>
            </CardHeader>
            <NextIntlClientProvider
              messages={{
                Kasbon: messages.Kasbon,
                Feedback: messages.Feedback,
                Picker: messages.Picker,
              }}
            >
              <KasbonPaymentForm
                locale={locale}
                kasbonId={kasbon.id}
                available={kasbon.available}
                bankAccounts={bankAccounts}
                direct={direct}
              />
            </NextIntlClientProvider>
          </Card>
        ) : null}
      </div>
    </>
  );
}
