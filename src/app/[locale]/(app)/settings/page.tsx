import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { FormField } from "@/components/form/form-field";
import { Card, CardDescription } from "@/components/ui/card";
import { updateStoreProfileAction } from "@/features/settings/actions";
import { SettingsForm, SettingsHeader } from "@/features/settings/components/settings-frame";
import { getSettings } from "@/features/settings/service";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: t("tabProfile") };
}

/** Store profile printed on invoices (FR-SET-01); brand stays in app.config.ts (FR-SET-01a). */
export default async function StoreProfilePage() {
  const session = await requirePermission("page:settings");
  const [t, profile] = await Promise.all([
    getTranslations("Settings"),
    getSettings(session, "store.profile"),
  ]);

  return (
    <>
      <SettingsHeader current="profile" />
      <Card className="max-w-2xl">
        <CardDescription className="mb-4">{t("brandNote")}</CardDescription>
        <SettingsForm
          action={updateStoreProfileAction}
          canManage={session.permissions.has("settings:manage")}
        >
          <FormField
            name="address"
            label={t("address")}
            defaultValue={profile.address}
            maxLength={200}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              name="phone"
              label={t("phone")}
              hint={t("phoneHint")}
              defaultValue={profile.phone}
              type="tel"
              autoComplete="tel"
              maxLength={20}
            />
            <FormField
              name="email"
              label={t("email")}
              defaultValue={profile.email}
              type="email"
              autoComplete="email"
              maxLength={254}
            />
          </div>
          <FormField
            name="npwp"
            label={t("npwp")}
            hint={t("npwpHint")}
            defaultValue={profile.npwp}
            inputMode="numeric"
            maxLength={24}
          />
          <FormField
            name="invoiceFooterId"
            label={t("invoiceFooterId")}
            hint={t("invoiceFooterHint")}
            defaultValue={profile.invoiceFooterId}
            maxLength={120}
          />
          <FormField
            name="invoiceFooterEn"
            label={t("invoiceFooterEn")}
            hint={t("invoiceFooterHint")}
            defaultValue={profile.invoiceFooterEn}
            maxLength={120}
          />
        </SettingsForm>
      </Card>
    </>
  );
}
