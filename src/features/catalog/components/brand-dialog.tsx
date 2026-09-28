import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { ActionForm } from "@/components/form/action-form";
import { ConfirmAction } from "@/components/form/confirm-action";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { DialogSection } from "@/components/ui/dialog";
import { RouteDialog } from "@/components/ui/route-dialog";

import { deleteBrandAction, updateBrandAction } from "../actions";

interface BrandDialogProps {
  brand: { id: string; name: string; productCount: number };
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}

/** Rename or delete an unused brand in a dialog (FR-CAT-02, ADR-0018). */
export async function BrandDialog({ brand, closeHref }: BrandDialogProps) {
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("Catalog"),
    getTranslations("Common"),
    getLocale(),
  ]);

  return (
    <RouteDialog closeHref={closeHref} closeLabel={tCommon("close")} title={t("editBrand")}>
      <ActionForm action={updateBrandAction.bind(null, brand.id)} locale={locale}>
        <FormField name="name" label={t("brandName")} defaultValue={brand.name} maxLength={40} />
        <SubmitButton className="self-start">{t("save")}</SubmitButton>
      </ActionForm>
      <DialogSection
        title={t("deleteBrand")}
        description={
          brand.productCount > 0
            ? t("brandInUseNote", { count: brand.productCount })
            : t("deleteBrandDescription")
        }
      >
        {brand.productCount === 0 ? (
          <div>
            <ConfirmAction
              action={deleteBrandAction.bind(null, brand.id)}
              locale={locale}
              labels={{
                trigger: t("deleteBrand"),
                title: t("deleteBrandTitle", { name: brand.name }),
                description: t("deleteBrandDescription"),
                confirm: t("deleteBrand"),
                cancel: tCommon("cancel"),
                close: tCommon("close"),
              }}
            />
          </div>
        ) : null}
      </DialogSection>
    </RouteDialog>
  );
}
