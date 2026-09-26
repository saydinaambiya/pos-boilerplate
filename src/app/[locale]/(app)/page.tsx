import { ChartColumn, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { toneClasses } from "@/components/ui/tone";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { readSetting } from "@/lib/settings/store";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const [t, session, profile] = await Promise.all([
    getTranslations("Dashboard"),
    requirePermission("page:dashboard"),
    readSetting("store.profile"),
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
