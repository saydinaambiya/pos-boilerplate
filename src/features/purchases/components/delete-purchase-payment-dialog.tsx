import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { ActionForm } from "@/components/form/action-form";
import { SubmitButton } from "@/components/form/submit-button";
import { RouteDialog } from "@/components/ui/route-dialog";

import { deletePurchasePaymentAction } from "../actions";

/**
 * Confirms removing one installment of a bill (FR-PRB-03, ADR-0018):
 * `?deletePayment=<id>` on `/purchases`, opened from the bill dialog. Its
 * `closeHref` returns to that dialog, and on success the refreshed history and
 * balance appear in place.
 */
export async function DeletePurchasePaymentDialog({
  paymentId,
  closeHref,
}: {
  paymentId: string;
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}) {
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("Purchases"),
    getTranslations("Common"),
    getLocale(),
  ]);
  return (
    <RouteDialog
      closeHref={closeHref}
      closeLabel={tCommon("close")}
      title={t("deletePaymentTitle")}
      description={t("deletePaymentDescription")}
    >
      <ActionForm action={deletePurchasePaymentAction} locale={locale}>
        <input type="hidden" name="paymentId" value={paymentId} />
        <SubmitButton variant="danger" className="self-start">
          {t("deletePayment")}
        </SubmitButton>
      </ActionForm>
    </RouteDialog>
  );
}
