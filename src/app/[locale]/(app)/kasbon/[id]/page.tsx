import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { ActionForm } from "@/components/form/action-form";
import { ConfirmAction } from "@/components/form/confirm-action";
import { FormField, FormSelect } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { recordKasbonPaymentAction } from "@/features/kasbon/actions";
import { DueMarker, KasbonStatusChip } from "@/features/kasbon/components/kasbon-chips";
import { getKasbon } from "@/features/kasbon/service";
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
  const [t, tApprovals, tCommon, format, locale, kasbon, bankAccounts] = await Promise.all([
    getTranslations("Kasbon"),
    getTranslations("Approvals"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    getKasbon(session, id),
    canPay ? getKasbonBankAccounts(session) : [],
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
                  href={`/pos/sales/${kasbon.saleId}`}
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
            {kasbon.payments.length === 0 ? (
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
                  {kasbon.payments.map((payment) => {
                    const status = payment.approvalStatus ?? "PENDING";
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="text-sm">
                          {format.dateTime(payment.createdAt, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                          {payment.requesterName ? (
                            <span className="block text-xs text-ink-muted">
                              {payment.requesterName}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">
                          {t(`methods.${payment.method === "TRANSFER" ? "TRANSFER" : "CASH"}`)}
                          {payment.bankName ? (
                            <span className="block text-xs text-ink-muted">
                              {[payment.bankName, payment.reference].filter(Boolean).join(" · ")}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(payment.amount)}
                        </TableCell>
                        <TableCell>
                          <Chip tone={paymentTones[status]}>
                            {tApprovals(`statuses.${status}`)}
                          </Chip>
                          {payment.approvalNote ? (
                            <span className="block text-xs text-ink-muted">
                              {payment.approvalNote}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {status === "PENDING" &&
                          payment.approvalId &&
                          payment.approvalVersion !== null &&
                          payment.requestedBy === session.user.id ? (
                            <ConfirmAction
                              action={cancelApprovalAction.bind(
                                null,
                                payment.approvalId,
                                payment.approvalVersion,
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
              <div>
                <CardTitle>{t("recordPayment")}</CardTitle>
                <CardDescription>
                  {t("recordPaymentDescription", { amount: money(kasbon.available) })}
                </CardDescription>
              </div>
            </CardHeader>
            <ActionForm action={recordKasbonPaymentAction.bind(null, kasbon.id)} locale={locale}>
              <FormSelect
                name="method"
                label={t("method")}
                defaultValue="CASH"
                options={[
                  { value: "CASH", label: t("methods.CASH") },
                  ...(bankAccounts.length > 0
                    ? [{ value: "TRANSFER", label: t("methods.TRANSFER") }]
                    : []),
                ]}
              />
              <FormField
                name="amount"
                label={t("amount")}
                hint={t("amountHint")}
                inputMode="numeric"
                maxLength={20}
              />
              {bankAccounts.length > 0 ? (
                <>
                  <FormSelect
                    name="bankAccountId"
                    label={t("bankAccount")}
                    hint={t("transferOnly")}
                    options={bankAccounts.map((account) => ({
                      value: account.id,
                      label: account.label,
                    }))}
                  />
                  <FormField
                    name="reference"
                    label={t("reference")}
                    hint={t("transferOnly")}
                    maxLength={60}
                  />
                </>
              ) : null}
              <SubmitButton className="self-start">{t("submitPayment")}</SubmitButton>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
