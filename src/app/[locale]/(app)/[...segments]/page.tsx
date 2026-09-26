import { Construction } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { navigation } from "@/config/navigation";

/**
 * Temporary landing for menu entries whose module ships in a later
 * milestone. Unknown paths still 404. Remove once every module exists.
 */
async function findItem(params: PageProps<"/[locale]/[...segments]">["params"]) {
  const { segments } = await params;
  const item = navigation.find((entry) => entry.href === `/${segments.join("/")}`);
  if (!item) notFound();
  return item;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/[...segments]">): Promise<Metadata> {
  const [item, t] = await Promise.all([findItem(params), getTranslations("Navigation")]);
  return { title: t(item.label) };
}

export default async function PlaceholderPage({ params }: PageProps<"/[locale]/[...segments]">) {
  const [item, t, tPlaceholder] = await Promise.all([
    findItem(params),
    getTranslations("Navigation"),
    getTranslations("Placeholder"),
  ]);

  return (
    <>
      <PageHeader title={t(item.label)} />
      <Card>
        <EmptyState
          icon={<Construction aria-hidden="true" />}
          title={tPlaceholder("title")}
          description={tPlaceholder("description")}
        />
      </Card>
    </>
  );
}
