import { Store } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { FormField } from "@/components/form/form-field";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createMarketplaceAction } from "@/features/settings/actions";
import { SettingsForm, SettingsHeader } from "@/features/settings/components/settings-frame";
import { ActiveChip } from "@/features/settings/components/status-chip";
import { getMarketplaces } from "@/features/settings/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: t("tabMarketplaces") };
}

/** Marketplaces for online orders (FR-SET-06). */
export default async function MarketplacesPage() {
  const session = await requirePermission("page:settings");
  const [t, marketplaces] = await Promise.all([
    getTranslations("Settings"),
    getMarketplaces(session),
  ]);
  const canManage = session.permissions.has("settings:manage");

  return (
    <>
      <SettingsHeader current="marketplaces" />
      <div className="flex flex-col gap-6">
        <Card>
          {marketplaces.length === 0 ? (
            <EmptyState
              icon={<Store aria-hidden="true" />}
              title={t("noMarketplaces")}
              description={t("noMarketplacesDescription")}
            />
          ) : (
            <Table>
              <TableCaption>{t("marketplacesCaption")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {marketplaces.map((marketplace) => (
                  <TableRow key={marketplace.id}>
                    <TableCell className="font-medium">
                      {canManage ? (
                        <Link
                          href={`/settings/marketplaces/${marketplace.id}`}
                          aria-label={t("edit", { name: marketplace.name })}
                          className="underline-offset-4 hover:underline"
                        >
                          {marketplace.name}
                        </Link>
                      ) : (
                        marketplace.name
                      )}
                    </TableCell>
                    <TableCell>
                      <ActiveChip active={marketplace.isActive} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        {canManage ? (
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>{t("addMarketplace")}</CardTitle>
            </CardHeader>
            <SettingsForm
              action={createMarketplaceAction}
              canManage
              submitLabel={t("addMarketplace")}
            >
              <FormField
                name="name"
                label={t("marketplaceName")}
                maxLength={40}
                autoComplete="off"
              />
            </SettingsForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
