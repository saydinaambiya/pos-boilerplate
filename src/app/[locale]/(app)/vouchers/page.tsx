import { TicketPercent, TicketPlus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import { VoucherStatusChip } from "@/features/vouchers/components/voucher-status-chip";
import { voucherValueText } from "@/features/vouchers/format";
import { getVouchers } from "@/features/vouchers/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Vouchers");
  return { title: t("title") };
}

/** Voucher list with derived status (expired, scheduled) and usage (PRD §3.9, §4.4). */
export default async function VouchersPage() {
  const session = await requirePermission("page:vouchers");
  const [t, format, locale, vouchers] = await Promise.all([
    getTranslations("Vouchers"),
    getFormatter(),
    getLocale(),
    getVouchers(session),
  ]);
  const day = (date: Date) => format.dateTime(date, { dateStyle: "medium" });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          session.permissions.has("voucher:request") ? (
            <Button asChild>
              <Link href="/vouchers/new">
                <TicketPlus aria-hidden="true" />
                {t("add")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <Card>
        {vouchers.length === 0 ? (
          <EmptyState
            icon={<TicketPercent aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Table>
            <TableCaption>{t("listCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("code")}</TableHead>
                <TableHead>{t("value")}</TableHead>
                <TableHead>{t("period")}</TableHead>
                <TableHead>{t("usage")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.map((voucher) => (
                <TableRow key={voucher.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/vouchers/${voucher.id}`}
                      aria-label={t("edit", { code: voucher.code })}
                      className="underline-offset-4 hover:underline"
                    >
                      {voucher.code}
                    </Link>
                    {voucher.name ? (
                      <span className="block text-xs font-normal text-ink-muted">
                        {voucher.name}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {voucher.type && voucher.value !== null
                      ? voucherValueText(voucher.type, voucher.value, locale)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {voucher.startsAt && voucher.endsAt
                      ? t("periodRange", {
                          start: day(voucher.startsAt),
                          end: day(new Date(voucher.endsAt.getTime() - 1)),
                        })
                      : voucher.startsAt
                        ? t("from", { start: day(voucher.startsAt) })
                        : voucher.endsAt
                          ? t("until", { end: day(new Date(voucher.endsAt.getTime() - 1)) })
                          : t("always")}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {voucher.quota === null
                      ? t("unlimited", { used: voucher.usageCount })
                      : t("usageOf", { used: voucher.usageCount, quota: voucher.quota })}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1.5">
                      <VoucherStatusChip status={voucher.displayStatus} />
                      {voucher.hasPendingRevision && voucher.status !== "PENDING_APPROVAL" ? (
                        <span className="text-xs text-ink-muted">{t("pendingRevision")}</span>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
