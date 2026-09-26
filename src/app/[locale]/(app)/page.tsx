import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const t = await getTranslations("Dashboard");

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
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
