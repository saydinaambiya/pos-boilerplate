import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { setMarketplaceStatusAction, updateMarketplaceAction } from "@/features/settings/actions";
import { RecordStatus } from "@/features/settings/components/record-status";
import { SettingsForm, SettingsHeader } from "@/features/settings/components/settings-frame";
import { getMarketplace } from "@/features/settings/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: t("editMarketplace") };
}

/** Rename or deactivate a marketplace (FR-SET-06). */
export default async function EditMarketplacePage({
  params,
}: PageProps<"/[locale]/settings/marketplaces/[id]">) {
  const { id } = await params;
  const session = await requirePermission("settings:manage");
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, marketplace] = await Promise.all([
    getTranslations("Settings"),
    getMarketplace(session, id),
  ]);
  if (!marketplace) notFound();

  return (
    <>
      <SettingsHeader
        current="marketplaces"
        actions={
          <Button asChild variant="secondary">
            <Link href="/settings/marketplaces">{t("back")}</Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <Card className="max-w-2xl">
          <SettingsForm action={updateMarketplaceAction.bind(null, marketplace.id)} canManage>
            <FormField
              name="name"
              label={t("marketplaceName")}
              defaultValue={marketplace.name}
              maxLength={40}
            />
          </SettingsForm>
        </Card>
        <RecordStatus
          name={marketplace.name}
          isActive={marketplace.isActive}
          action={setMarketplaceStatusAction.bind(null, marketplace.id, !marketplace.isActive)}
        />
      </div>
    </>
  );
}
