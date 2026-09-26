import { BadgeCheck, ChartColumn, NotebookPen, PackageCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { toneClasses } from "@/components/ui/tone";
import { StockCell } from "@/features/catalog/components/stock-cell";
import { countPendingForViewer } from "@/features/approvals/service";
import { getKasbonSummary } from "@/features/kasbon/service";
import { getLowStock } from "@/features/stock/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";
import { variantLabel } from "@/lib/format/variant-label";
import { readSetting } from "@/lib/settings/store";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const [t, locale, session, profile] = await Promise.all([
    getTranslations("Dashboard"),
    getLocale(),
    requirePermission("page:dashboard"),
    readSetting("store.profile"),
  ]);
  const [lowStock, pendingApprovals, kasbon] = await Promise.all([
    session.permissions.has("page:stock") ? getLowStock(session, 5) : null,
    countPendingForViewer(session),
    getKasbonSummary(session),
  ]);
  const profileIncomplete =
    session.permissions.has("settings:manage") && (profile.address === "" || profile.phone === "");

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      {profileIncomplete ? (
        <Card
          role="status"
          className={cn(
            "mb-6 flex flex-col gap-3 sm:flex-row sm:items-center",
            toneClasses.warning,
          )}
        >
          <TriangleAlert className="size-6 shrink-0" aria-hidden="true" />
          <div className="flex flex-1 flex-col gap-1">
            <CardTitle className="text-base text-inherit">{t("profileIncompleteTitle")}</CardTitle>
            <CardDescription className="text-inherit">
              {t("profileIncompleteDescription")}
            </CardDescription>
          </div>
          <Button asChild variant="secondary">
            <Link href="/settings">{t("profileIncompleteAction")}</Link>
          </Button>
        </Card>
      ) : null}
      {pendingApprovals > 0 ? (
        <Card
          role="status"
          className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-center", toneClasses.info)}
        >
          <BadgeCheck className="size-6 shrink-0" aria-hidden="true" />
          <div className="flex flex-1 flex-col gap-1">
            <CardTitle className="text-base text-inherit">{t("pendingApprovalsTitle")}</CardTitle>
            <CardDescription className="text-inherit">
              {t("pendingApprovalsDescription", { count: pendingApprovals })}
            </CardDescription>
          </div>
          <Button asChild variant="secondary">
            <Link href="/approvals">{t("pendingApprovalsAction")}</Link>
          </Button>
        </Card>
      ) : null}
      {kasbon && kasbon.count > 0 ? (
        <Card
          role="status"
          className={cn(
            "mb-6 flex flex-col gap-3 sm:flex-row sm:items-center",
            kasbon.overdue > 0 ? toneClasses.warning : toneClasses.neutral,
          )}
        >
          <NotebookPen className="size-6 shrink-0" aria-hidden="true" />
          <div className="flex flex-1 flex-col gap-1">
            <CardTitle className="text-base text-inherit">{t("kasbonTitle")}</CardTitle>
            <CardDescription className="text-inherit">
              {t("kasbonDescription", {
                amount: formatCurrency(kasbon.total, locale),
                count: kasbon.count,
                overdue: kasbon.overdue,
              })}
            </CardDescription>
          </div>
          <Button asChild variant="secondary">
            <Link href="/kasbon">{t("kasbonAction")}</Link>
          </Button>
        </Card>
      ) : null}
      {lowStock ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("lowStockTitle")}</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={{ pathname: "/stock", query: { low: "1" } }}>{t("lowStockAll")}</Link>
            </Button>
          </CardHeader>
          {lowStock.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <PackageCheck className="size-4" aria-hidden="true" />
              {t("lowStockEmpty")}
            </p>
          ) : (
            <ul aria-label={t("lowStockCaption")} className="flex flex-col divide-y divide-border">
              {lowStock.map((item) => (
                <li key={item.variantId} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/stock/${item.variantId}`}
                    className="min-w-0 truncate text-sm font-medium text-ink underline-offset-4 hover:underline"
                  >
                    {variantLabel(item.productName, item.colorName)}
                  </Link>
                  <StockCell trackStock stockQty={item.stockQty} minStock={item.minStock} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
      <Card>
        <EmptyState
          icon={<ChartColumn aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      </Card>
    </>
  );
}
