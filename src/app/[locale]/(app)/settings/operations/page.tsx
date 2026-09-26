import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { FormCheckbox, FormField, FormSelect } from "@/components/form/form-field";
import { Card } from "@/components/ui/card";
import { updateOperationsAction } from "@/features/settings/actions";
import { SettingsForm, SettingsHeader } from "@/features/settings/components/settings-frame";
import { getSettings } from "@/features/settings/service";
import { requirePermission } from "@/lib/auth/guard";
import { sampleInvoiceNumber } from "@/lib/settings/schemas";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: t("tabOperations") };
}

/** Operational rules (FR-SET-07, FR-AUTH-05, FR-UI-11, BR-07, BR-18). */
export default async function OperationsSettingsPage() {
  const session = await requirePermission("page:settings");
  const [t, operations] = await Promise.all([
    getTranslations("Settings"),
    getSettings(session, "operations"),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: operations.timeZone })
    .format(new Date())
    .replaceAll("-", "");
  const sample = sampleInvoiceNumber(
    operations.invoicePrefix,
    operations.invoiceSequenceDigits,
    today,
  );

  return (
    <>
      <SettingsHeader current="operations" />
      <Card className="max-w-2xl">
        <SettingsForm
          action={updateOperationsAction}
          canManage={session.permissions.has("settings:manage")}
        >
          <FormSelect
            name="timeZone"
            label={t("timeZone")}
            defaultValue={operations.timeZone}
            options={[
              { value: "Asia/Jakarta", label: t("timeZoneJakarta") },
              { value: "Asia/Makassar", label: t("timeZoneMakassar") },
              { value: "Asia/Jayapura", label: t("timeZoneJayapura") },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              name="invoicePrefix"
              label={t("invoicePrefix")}
              hint={t("invoicePrefixHint")}
              defaultValue={operations.invoicePrefix}
              maxLength={10}
              autoCapitalize="characters"
            />
            <FormSelect
              name="invoiceSequenceDigits"
              label={t("invoiceSequenceDigits")}
              hint={t("invoiceSample", { sample })}
              defaultValue={String(operations.invoiceSequenceDigits)}
              options={["3", "4", "5", "6"].map((value) => ({ value, label: value }))}
            />
          </div>
          <FormSelect
            name="paperSize"
            label={t("paperSize")}
            defaultValue={operations.paperSize}
            options={[
              { value: "58mm", label: t("paper58mm") },
              { value: "80mm", label: t("paper80mm") },
              { value: "a4", label: t("paperA4") },
            ]}
          />
          <FormCheckbox
            name="allowNegativeStock"
            label={t("allowNegativeStock")}
            hint={t("allowNegativeStockHint")}
            defaultChecked={operations.allowNegativeStock}
          />
          <FormField
            name="heldOrderHours"
            label={t("heldOrderHours")}
            hint={t("heldOrderHoursHint")}
            defaultValue={String(operations.heldOrderHours)}
            inputMode="numeric"
            maxLength={3}
            className="max-w-40"
          />
          <FormField
            name="housekeepingRetentionMonths"
            label={t("housekeepingRetentionMonths")}
            hint={t("housekeepingRetentionMonthsHint")}
            defaultValue={String(operations.housekeepingRetentionMonths)}
            inputMode="numeric"
            maxLength={2}
            className="max-w-40"
          />
          <FormField
            name="sessionIdleMinutes"
            label={t("sessionIdleMinutes")}
            hint={t("sessionIdleMinutesHint")}
            defaultValue={String(operations.sessionIdleMinutes)}
            inputMode="numeric"
            maxLength={4}
            className="max-w-40"
          />
        </SettingsForm>
      </Card>
    </>
  );
}
