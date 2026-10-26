import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { ActionForm } from "@/components/form/action-form";
import { FormDateField, FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { RouteDialog } from "@/components/ui/route-dialog";

import { savePurchaseAction } from "../actions";

/** Bill header the edit dialog shows and can change. */
export interface EditablePurchase {
  id: string;
  companyName: string;
  invoiceNo: string;
  total: number;
  orderDate: string;
  dueDate: string | null;
  note: string | null;
}

/**
 * Edits a bill's header in a dialog over the list (FR-PRB-01, ADR-0018):
 * `?edit=<id>` on `/purchases`. Installments and deleting live in their own
 * dialogs, so only the header is here.
 */
export async function EditPurchaseDialog({
  closeHref,
  purchase,
}: {
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
  purchase: EditablePurchase;
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
      size="lg"
      title={t("editTitle")}
      description={t("editDescription")}
    >
      <ActionForm action={savePurchaseAction} locale={locale}>
        <input type="hidden" name="id" value={purchase.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="companyName"
            label={t("companyName")}
            defaultValue={purchase.companyName}
            maxLength={80}
            autoComplete="off"
          />
          <FormField
            name="invoiceNo"
            label={t("invoiceNo")}
            defaultValue={purchase.invoiceNo}
            maxLength={40}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="total"
            label={t("total")}
            hint={t("totalEditHint")}
            money
            maxLength={20}
            defaultValue={String(purchase.total)}
          />
          <FormDateField
            name="orderDate"
            label={t("orderDate")}
            defaultValue={purchase.orderDate}
          />
        </div>
        <FormDateField
          name="dueDate"
          label={t("dueDate")}
          hint={t("dueDateHint")}
          defaultValue={purchase.dueDate ?? ""}
          clearable
        />
        <FormField
          name="note"
          label={t("note")}
          hint={t("optionalHint")}
          maxLength={200}
          defaultValue={purchase.note ?? ""}
        />
        <SubmitButton className="self-start">{t("save")}</SubmitButton>
      </ActionForm>
    </RouteDialog>
  );
}
