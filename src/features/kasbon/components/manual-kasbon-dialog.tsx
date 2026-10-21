import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { ActionForm } from "@/components/form/action-form";
import { FormDateField, FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { RouteDialog } from "@/components/ui/route-dialog";

import { recordManualKasbonAction } from "../actions";

/**
 * Enter an older store credit by hand, e.g. from the paper book, in a
 * dialog over the list (FR-KSB-08, ADR-0018, ADR-0052).
 */
export async function ManualKasbonDialog({
  closeHref,
  today,
}: {
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
  /** Store-local today; the credit cannot be given later than this. */
  today: string;
}) {
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("Kasbon"),
    getTranslations("Common"),
    getLocale(),
  ]);
  return (
    <RouteDialog
      closeHref={closeHref}
      closeLabel={tCommon("close")}
      size="lg"
      title={t("manualTitle")}
      description={t("manualDescription")}
    >
      <ActionForm action={recordManualKasbonAction} locale={locale}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="name" label={t("manualName")} maxLength={80} autoComplete="off" />
          <FormField
            name="phone"
            label={t("manualPhone")}
            hint={t("optionalHint")}
            inputMode="tel"
            maxLength={20}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormDateField
            name="openedOn"
            label={t("manualOpenedOn")}
            hint={t("manualOpenedOnHint")}
            max={today}
          />
          <FormField
            name="amount"
            label={t("manualAmount")}
            hint={t("manualAmountHint")}
            money
            maxLength={20}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="reference"
            label={t("manualReference")}
            hint={t("optionalHint")}
            maxLength={40}
            autoComplete="off"
          />
          <FormDateField name="dueDate" label={t("dueDate")} hint={t("optionalHint")} clearable />
        </div>
        <FormField
          name="description"
          label={t("manualDescriptionField")}
          hint={t("manualDescriptionHint")}
          maxLength={200}
        />
        <SubmitButton className="self-start">{t("manualSave")}</SubmitButton>
      </ActionForm>
    </RouteDialog>
  );
}
