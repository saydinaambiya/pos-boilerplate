import { CircleCheck, Clock, History } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { VarianceText } from "@/features/shifts/components/shift-figures";
import { listShifts } from "@/features/shifts/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Shifts");
  return { title: t("history") };
}

const pageParam = z.coerce.number().int().min(1).max(1000).catch(1);

/** Shift history: own shifts, or all for `report:view` (FR-SHF-04). */
export default async function ShiftsPage({ searchParams }: PageProps<"/[locale]/pos/shifts">) {
  const session = await requirePermission("page:pos");
  const raw = (await searchParams).page;
  const page = pageParam.parse(Array.isArray(raw) ? raw[0] : (raw ?? "1"));
  const [t, format, locale, result] = await Promise.all([
    getTranslations("Shifts"),
    getFormatter(),
    getLocale(),
    listShifts(session, page),
  ]);
  const when = (date: Date) => format.dateTime(date, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <PageHeader
        title={t("history")}
        actions={
          <Button asChild variant="secondary">
            <Link href="/pos">{t("back")}</Link>
          </Button>
        }
      />
      <Card>
        {result.shifts.length === 0 ? (
          <EmptyState
            icon={<History aria-hidden="true" />}
            title={t("noShifts")}
            description={t("noShiftsDescription")}
          />
        ) : (
          <Table>
            <TableCaption>{t("historyCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("openedAt", { time: "" }).trim()}</TableHead>
                <TableHead>{t("cashier")}</TableHead>
                <TableHead className="text-right">{t("openingCashShort")}</TableHead>
                <TableHead>{t("variance")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.shifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell>
                    <Link
                      href={`/pos/shifts/${shift.id}`}
                      aria-label={t("view", { date: when(shift.openedAt) })}
                      className="underline-offset-4 hover:underline"
                    >
                      {when(shift.openedAt)}
                    </Link>
                  </TableCell>
                  <TableCell>{shift.cashierName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(shift.openingCash, locale)}
                  </TableCell>
                  <TableCell>
                    {shift.variance === null ? "—" : <VarianceText variance={shift.variance} />}
                  </TableCell>
                  <TableCell>
                    {shift.closedAt ? (
                      <Chip tone="neutral" icon={<CircleCheck aria-hidden="true" />}>
                        {t("statusClosed")}
                      </Chip>
                    ) : (
                      <Chip tone="info" icon={<Clock aria-hidden="true" />}>
                        {t("statusOpen")}
                      </Chip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {page > 1 || result.hasNextPage ? (
          <nav aria-label={t("pagination")} className="mt-4 flex items-center justify-end gap-2">
            {page > 1 ? (
              <Button asChild variant="ghost">
                <Link href={{ pathname: "/pos/shifts", query: { page: String(page - 1) } }}>
                  {t("previous")}
                </Link>
              </Button>
            ) : null}
            <span className="text-sm text-ink-muted">{t("pageLabel", { page })}</span>
            {result.hasNextPage ? (
              <Button asChild variant="secondary">
                <Link href={{ pathname: "/pos/shifts", query: { page: String(page + 1) } }}>
                  {t("next")}
                </Link>
              </Button>
            ) : null}
          </nav>
        ) : null}
      </Card>
    </>
  );
}
