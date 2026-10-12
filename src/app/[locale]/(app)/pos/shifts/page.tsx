import { CircleCheck, Clock, History } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { SectionTabs } from "@/components/shell/section-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardDescription } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
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
import { ShiftFigures, VarianceText } from "@/features/shifts/components/shift-figures";
import { getShiftReport, listShifts } from "@/features/shifts/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { firstParam, keptQuery } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Shifts");
  return { title: t("history") };
}

const pageParam = z.coerce.number().int().min(1).max(1000).catch(1);
const kindParam = z.enum(["DRAWER", "SALES"]).catch("DRAWER");

/**
 * Shift history, the store's shifts and salespeople's shifts on separate
 * tabs (`?kind=SALES`, ADR-0044): every cashier sees the shared store
 * shifts with who opened and closed them; sales shifts are own only unless
 * the viewer holds `report:view` (FR-SHF-04). A row opens its report in a
 * dialog (`?view=`, ADR-0018).
 */
export default async function ShiftsPage({ searchParams }: PageProps<"/[locale]/pos/shifts">) {
  const session = await requirePermission("page:pos");
  const raw = await searchParams;
  const page = pageParam.parse(firstParam(raw.page) ?? "1");
  const kind = kindParam.parse(firstParam(raw.kind));
  const drawer = kind === "DRAWER";
  const pageHref = (pageNumber: number) => ({
    pathname: "/pos/shifts" as const,
    query: { ...(drawer ? {} : { kind }), page: String(pageNumber) },
  });
  const viewing = firstParam(raw.view);
  const kept = keptQuery(raw, ["view"]);
  const [t, tCommon, format, locale, result, report] = await Promise.all([
    getTranslations("Shifts"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    listShifts(session, kind, page),
    viewing && z.uuid().safeParse(viewing).success ? getShiftReport(session, viewing) : null,
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
      <SectionTabs
        label={t("kindTabs")}
        current={kind}
        tabs={[
          { id: "DRAWER", href: "/pos/shifts", label: t("kindDRAWER") },
          { id: "SALES", href: "/pos/shifts?kind=SALES", label: t("kindSALES") },
        ]}
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
                <TableHead>{drawer ? t("openedBy") : t("salesperson")}</TableHead>
                {drawer ? <TableHead>{t("closedBy")}</TableHead> : null}
                {drawer ? (
                  <TableHead className="text-right">{t("openingCashShort")}</TableHead>
                ) : null}
                <TableHead>{t("variance")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.shifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell>
                    <Link
                      href={{ pathname: "/pos/shifts", query: { ...kept, view: shift.id } }}
                      scroll={false}
                      aria-label={t("view", { date: when(shift.openedAt) })}
                      className="underline-offset-4 hover:underline"
                    >
                      {when(shift.openedAt)}
                    </Link>
                  </TableCell>
                  <TableCell>{shift.cashierName}</TableCell>
                  {drawer ? <TableCell>{shift.closedByName ?? "—"}</TableCell> : null}
                  {drawer ? (
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(shift.openingCash, locale)}
                    </TableCell>
                  ) : null}
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
                <Link href={pageHref(page - 1)}>{t("previous")}</Link>
              </Button>
            ) : null}
            <span className="text-sm text-ink-muted">{t("pageLabel", { page })}</span>
            {result.hasNextPage ? (
              <Button asChild variant="secondary">
                <Link href={pageHref(page + 1)}>{t("next")}</Link>
              </Button>
            ) : null}
          </nav>
        ) : null}
      </Card>
      {report ? (
        <RouteDialog
          key={report.id}
          closeHref={{ pathname: "/pos/shifts", query: kept }}
          closeLabel={tCommon("close")}
          size="xl"
          title={t("reportTitle")}
        >
          <ShiftFigures shift={report} />
          {report.note ? <CardDescription>{report.note}</CardDescription> : null}
        </RouteDialog>
      ) : null}
    </>
  );
}
