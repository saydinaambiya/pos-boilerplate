import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { FormCheckbox, FormField } from "@/components/form/form-field";
import { Card } from "@/components/ui/card";
import { updateTaxAction } from "@/features/settings/actions";
import { SettingsForm, SettingsHeader } from "@/features/settings/components/settings-frame";
import { getSettings } from "@/features/settings/service";
import { requirePermission } from "@/lib/auth/guard";
import { basisPointsToPercent } from "@/lib/settings/rates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: t("tabTax") };
}

/** VAT and service charge (FR-SET-04, BR-14, BRD Q-02). */
export default async function TaxSettingsPage() {
  const session = await requirePermission("page:settings");
  const [t, tax] = await Promise.all([getTranslations("Settings"), getSettings(session, "tax")]);

  return (
    <>
      <SettingsHeader current="tax" />
      <Card className="max-w-2xl">
        <SettingsForm
          action={updateTaxAction}
          canManage={session.permissions.has("settings:manage")}
        >
          <FormCheckbox name="ppnEnabled" label={t("ppnEnabled")} defaultChecked={tax.ppnEnabled} />
          <FormField
            name="ppnRate"
            label={t("ppnRate")}
            hint={t("rateHint")}
            defaultValue={basisPointsToPercent(tax.ppnRateBps)}
            inputMode="decimal"
            maxLength={6}
            className="max-w-40"
          />
          <FormCheckbox
            name="priceIncludesTax"
            label={t("priceIncludesTax")}
            hint={t("priceIncludesTaxHint")}
            defaultChecked={tax.priceIncludesTax}
          />
          <FormCheckbox
            name="serviceEnabled"
            label={t("serviceEnabled")}
            defaultChecked={tax.serviceEnabled}
          />
          <FormField
            name="serviceRate"
            label={t("serviceRate")}
            hint={t("rateHint")}
            defaultValue={basisPointsToPercent(tax.serviceRateBps)}
            inputMode="decimal"
            maxLength={6}
            className="max-w-40"
          />
        </SettingsForm>
      </Card>
    </>
  );
}
