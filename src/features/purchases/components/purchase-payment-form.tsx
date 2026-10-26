import { getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormDateField, FormField, FormSelect } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { RouteDialogBoundary } from "@/components/ui/route-dialog";

import { recordPurchasePaymentAction } from "../actions";
import { purchasePaymentMethods } from "../schemas";

/**
 * Records an installment or payoff of a bill (FR-PRB-03). The amount is capped
 * at the remaining balance and the date can be backdated but not past today or
 * before the bill's own date (FR-PRB-05). It sits inside the bill dialog, so
 * `RouteDialogBoundary` keeps that dialog open after a successful save and the
 * refreshed history and balance appear in place.
 */
export async function PurchasePaymentForm({
  purchaseId,
  balanceLabel,
  orderDate,
  today,
}: {
  purchaseId: string;
  /** Remaining balance, already formatted for the hint. */
  balanceLabel: string;
  orderDate: string;
  today: string;
}) {
  const [t, locale] = await Promise.all([getTranslations("Purchases"), getLocale()]);
  const methodOptions = purchasePaymentMethods.map((method) => ({
    value: method,
    label: t(`methods.${method}`),
  }));
  return (
    <RouteDialogBoundary>
      <ActionForm action={recordPurchasePaymentAction} locale={locale}>
        <input type="hidden" name="purchaseId" value={purchaseId} />
        <FormField
          name="amount"
          label={t("amount")}
          hint={t("amountHint", { amount: balanceLabel })}
          money
          maxLength={20}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormDateField
            name="paidOn"
            label={t("paidOn")}
            defaultValue={today}
            min={orderDate}
            max={today}
          />
          <FormSelect name="method" label={t("method")} options={methodOptions} />
        </div>
        <FormField name="note" label={t("note")} hint={t("optionalHint")} maxLength={200} />
        <SubmitButton className="self-start">{t("recordPayment")}</SubmitButton>
      </ActionForm>
    </RouteDialogBoundary>
  );
}
