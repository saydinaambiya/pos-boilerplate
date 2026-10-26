import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { ActionForm } from "@/components/form/action-form";
import { SubmitButton } from "@/components/form/submit-button";
import { RouteDialog } from "@/components/ui/route-dialog";

import { savePurchaseAction } from "../actions";
import { NewPurchaseFields } from "./new-purchase-fields";

/**
 * Records a supplier bill in a dialog over the list (FR-PRB-01, ADR-0018):
 * `?new=1` on `/purchases`. Any date can be entered, so an older bill can be
 * backdated (FR-PRB-05).
 */
export async function NewPurchaseDialog({
  closeHref,
}: {
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}) {
  const [t, tCommon, locale, messages] = await Promise.all([
    getTranslations("Purchases"),
    getTranslations("Common"),
    getLocale(),
    getMessages(),
  ]);
  return (
    <RouteDialog
      closeHref={closeHref}
      closeLabel={tCommon("close")}
      size="lg"
      title={t("newTitle")}
      description={t("newDescription")}
    >
      <ActionForm action={savePurchaseAction} locale={locale}>
        <NextIntlClientProvider
          messages={{
            Purchases: messages.Purchases,
            Feedback: messages.Feedback,
            Picker: messages.Picker,
          }}
        >
          <NewPurchaseFields />
        </NextIntlClientProvider>
        <SubmitButton className="self-start">{t("save")}</SubmitButton>
      </ActionForm>
    </RouteDialog>
  );
}
