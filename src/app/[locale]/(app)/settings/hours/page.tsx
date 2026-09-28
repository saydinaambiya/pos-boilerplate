import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { FormCheckbox, FormField } from "@/components/form/form-field";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateStoreHoursAction } from "@/features/settings/actions";
import { SettingsForm, SettingsHeader } from "@/features/settings/components/settings-frame";
import { getSettings } from "@/features/settings/service";
import { requirePermission } from "@/lib/auth/guard";
import { weekdays } from "@/lib/settings/schemas";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: t("tabHours") };
}

/** Opening hours per weekday that limit the POS for employees (FR-SET-09, BR-24). */
export default async function StoreHoursSettingsPage() {
  const session = await requirePermission("page:settings");
  const [t, hours] = await Promise.all([
    getTranslations("Settings"),
    getSettings(session, "store.hours"),
  ]);

  return (
    <>
      <SettingsHeader current="hours" />
      <Card className="max-w-3xl">
        <CardHeader className="flex-col gap-1">
          <CardTitle>{t("hoursTitle")}</CardTitle>
          <CardDescription>{t("hoursDescription")}</CardDescription>
        </CardHeader>
        <SettingsForm
          action={updateStoreHoursAction}
          canManage={session.permissions.has("settings:manage")}
        >
          <FormCheckbox
            name="enabled"
            label={t("hoursEnabled")}
            hint={t("hoursEnabledHint")}
            defaultChecked={hours.enabled}
          />
          <ul className="flex flex-col divide-y divide-border">
            {weekdays.map((day, index) => {
              const value = hours.days[index];
              const name = t(`weekdays.${day}`);
              return (
                <li
                  key={day}
                  className="grid items-start gap-x-4 gap-y-2 py-3 sm:grid-cols-[8rem_1fr_1fr_auto]"
                >
                  <span className="pt-2 font-medium text-ink sm:pt-9">{name}</span>
                  <FormField
                    name={`${day}-open`}
                    type="time"
                    label={t("hoursOpenLabel", { day: name })}
                    defaultValue={value?.open}
                  />
                  <FormField
                    name={`${day}-close`}
                    type="time"
                    label={t("hoursCloseLabel", { day: name })}
                    defaultValue={value?.close}
                  />
                  <div className="sm:pt-6">
                    <FormCheckbox
                      name={`${day}-closed`}
                      label={t("hoursClosedLabel", { day: name })}
                      defaultChecked={value?.closed}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </SettingsForm>
      </Card>
    </>
  );
}
