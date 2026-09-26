import { Archive, CircleDashed, Download, FileCheck } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { ConfirmAction } from "@/components/form/confirm-action";
import { Button } from "@/components/ui/button";
import { Card, CardDescription } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
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
import { CapacityWidget } from "@/features/capacity/components/capacity-widget";
import { getCapacity } from "@/features/capacity/service";
import { archiveMonthAction } from "@/features/housekeeping/actions";
import { getHousekeeping } from "@/features/housekeeping/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Housekeeping");
  return { title: t("title") };
}

/**
 * Monthly housekeeping (FR-HK-01..07): months past the retention period,
 * each downloaded as a ZIP of CSV files, then marked as archived. Archived
 * months keep their tag and can be downloaded again.
 */
export default async function HousekeepingPage() {
  const session = await requirePermission("page:housekeeping");
  const [t, tCommon, format, locale, data, capacity] = await Promise.all([
    getTranslations("Housekeeping"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    getHousekeeping(session),
    getCapacity(session),
  ]);
  const monthLabel = (month: string) =>
    format.dateTime(new Date(`${month}-01T00:00:00Z`), {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const when = (date: Date) => format.dateTime(date, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <CapacityWidget capacity={capacity} />
      <Card className="mb-6 flex flex-col gap-2">
        <CardDescription>
          {t("retention", { months: data.retentionMonths, latest: monthLabel(data.latest) })}
        </CardDescription>
        <CardDescription>{t("howItWorks")}</CardDescription>
        {session.permissions.has("settings:manage") ? (
          <Link
            href="/settings/operations"
            className="inline-flex min-h-11 items-center self-start text-sm font-medium underline-offset-4 hover:underline"
          >
            {t("changeRetention")}
          </Link>
        ) : null}
      </Card>

      <Card>
        {data.months.length === 0 ? (
          <EmptyState
            icon={<Archive aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Table>
            <TableCaption>{t("caption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("month")}</TableHead>
                <TableHead className="text-right">{t("sales")}</TableHead>
                <TableHead className="text-right">{t("orders")}</TableHead>
                <TableHead className="text-right">{t("movements")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.months.map((row) => {
                const label = monthLabel(row.month);
                return (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{label}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.sales}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.orders}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.movements}</TableCell>
                    <TableCell>
                      {row.archivedAt ? (
                        <Chip tone="success" icon={<Archive aria-hidden="true" />}>
                          {t("archivedTag")}
                        </Chip>
                      ) : row.exportedAt ? (
                        <Chip tone="info" icon={<FileCheck aria-hidden="true" />}>
                          {t("exportedAt", { time: when(row.exportedAt) })}
                        </Chip>
                      ) : (
                        <Chip tone="neutral" icon={<CircleDashed aria-hidden="true" />}>
                          {t("notExported")}
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap justify-end gap-2">
                        <Button asChild variant="secondary" size="sm">
                          <a href={`/api/v1/housekeeping/${row.month}`} download>
                            <Download aria-hidden="true" />
                            {t("download", { month: label })}
                          </a>
                        </Button>
                        {row.archivedAt ? null : (
                          <ConfirmAction
                            action={archiveMonthAction.bind(null, row.month)}
                            locale={locale}
                            variant="primary"
                            labels={{
                              trigger: t("markArchived", { month: label }),
                              title: t("markTitle", { month: label }),
                              description: t("markDescription"),
                              confirm: t("markConfirm"),
                              cancel: tCommon("cancel"),
                              close: tCommon("close"),
                            }}
                          />
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
