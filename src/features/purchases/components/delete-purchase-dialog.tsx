import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { ActionForm } from "@/components/form/action-form";
import { SubmitButton } from "@/components/form/submit-button";
import { RouteDialog } from "@/components/ui/route-dialog";

import { deletePurchaseAction } from "../actions";

/**
 * Confirms removing a bill and its installments in a dialog over the list
 * (FR-PRB-01, ADR-0018): `?delete=<id>` on `/purchases`. It is rendered from
 * the id alone, so the refresh that drops the row does not unmount it before
 * its own success dialog opens; `companyName` is only for the title and falls
 * back once the row is gone.
 */
export async function DeletePurchaseDialog({
  purchaseId,
  companyName,
  closeHref,
}: {
  purchaseId: string;
  companyName?: string | undefined;
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
      title={companyName ? t("deleteTitle", { companyName }) : t("deleteTitleGeneric")}
      description={t("deleteDescription")}
    >
      <ActionForm action={deletePurchaseAction} locale={locale}>
        <input type="hidden" name="id" value={purchaseId} />
        <p className="text-sm text-ink-muted">{t("deleteNote")}</p>
        <SubmitButton variant="danger" className="self-start">
          {t("delete")}
        </SubmitButton>
      </ActionForm>
    </RouteDialog>
  );
}
