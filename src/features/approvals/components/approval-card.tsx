import { CircleCheck, CircleOff, Clock, CircleX } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { ConfirmAction } from "@/components/form/confirm-action";
import { FormField } from "@/components/form/form-field";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Link } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/format/currency";

import { cancelApprovalAction, decideApprovalAction } from "../actions";
import type { ApprovalRow } from "../service";

const voidPayload = z.object({
  invoiceNo: z.string(),
  grandTotal: z.number(),
  cashierName: z.string(),
  reason: z.string(),
});

const statusChip = {
  PENDING: { tone: "warning", icon: Clock },
  APPROVED: { tone: "success", icon: CircleCheck },
  REJECTED: { tone: "danger", icon: CircleX },
  CANCELLED: { tone: "neutral", icon: CircleOff },
} as const;

/**
 * One approval request with its snapshot summary (FR-APR-01). `mode`
 * decides the actions: approvers decide, requesters may cancel.
 */
export async function ApprovalCard({
  approval,
  mode,
}: {
  approval: ApprovalRow;
  mode: "decide" | "mine";
}) {
  const [t, tCommon, format, locale] = await Promise.all([
    getTranslations("Approvals"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
  ]);
  const chip = statusChip[approval.status];
  const voided = approval.type === "VOID" ? voidPayload.safeParse(approval.payload) : null;
  const noteField = <FormField name="note" label={t("decisionNote")} maxLength={200} />;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{t(`types.${approval.type}`)}</p>
          {voided?.success ? (
            <p className="text-sm [overflow-wrap:anywhere] text-ink">
              {t("voidSummary", {
                invoiceNo: voided.data.invoiceNo,
                amount: formatCurrency(voided.data.grandTotal, locale),
                cashier: voided.data.cashierName,
              })}
            </p>
          ) : null}
          <p className="text-xs text-ink-muted">
            {t("requestedBy", {
              name: approval.requesterName,
              time: format.dateTime(approval.createdAt, {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </p>
        </div>
        <Chip tone={chip.tone} icon={<chip.icon aria-hidden="true" />}>
          {t(`statuses.${approval.status}`)}
        </Chip>
      </div>
      {voided?.success ? (
        <p className="text-sm [overflow-wrap:anywhere] text-ink">
          {t("reason", { reason: voided.data.reason })}
        </p>
      ) : null}
      {approval.note ? (
        <p className="text-sm text-ink-muted">{t("note", { note: approval.note })}</p>
      ) : null}
      {approval.deciderName && approval.status !== "PENDING" ? (
        <p className="text-xs text-ink-muted">{t("decidedBy", { name: approval.deciderName })}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {approval.type === "VOID" ? (
          <Link
            href={`/pos/sales/${approval.targetId}`}
            className="inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
          >
            {t("openTarget")}
          </Link>
        ) : null}
        {mode === "decide" ? (
          <>
            <ConfirmAction
              action={decideApprovalAction.bind(null, approval.id, approval.version, "approve")}
              locale={locale}
              variant="primary"
              labels={{
                trigger: t("approve"),
                title: t("approveTitle"),
                description: t("approveDescription"),
                confirm: t("approve"),
                cancel: tCommon("cancel"),
                close: tCommon("close"),
              }}
            >
              {noteField}
            </ConfirmAction>
            <ConfirmAction
              action={decideApprovalAction.bind(null, approval.id, approval.version, "reject")}
              locale={locale}
              labels={{
                trigger: t("reject"),
                title: t("rejectTitle"),
                description: t("rejectDescription"),
                confirm: t("reject"),
                cancel: tCommon("cancel"),
                close: tCommon("close"),
              }}
            >
              {noteField}
            </ConfirmAction>
          </>
        ) : approval.status === "PENDING" ? (
          <ConfirmAction
            action={cancelApprovalAction.bind(null, approval.id, approval.version)}
            locale={locale}
            variant="secondary"
            labels={{
              trigger: t("cancelRequest"),
              title: t("cancelTitle"),
              description: t("cancelDescription"),
              confirm: t("cancelRequest"),
              cancel: t("keep"),
              close: tCommon("close"),
            }}
          />
        ) : null}
      </div>
    </Card>
  );
}
