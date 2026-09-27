import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { ActionForm } from "@/components/form/action-form";
import { ConfirmAction } from "@/components/form/confirm-action";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { DialogSection } from "@/components/ui/dialog";
import { RouteDialog } from "@/components/ui/route-dialog";

import { deleteCategoryAction, updateCategoryAction } from "../actions";

interface CategoryDialogProps {
  category: { id: string; name: string; sortOrder: number; productCount: number };
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}

/** Rename, reorder or delete an unused category in a dialog (FR-CAT-01, ADR-0018). */
export async function CategoryDialog({ category, closeHref }: CategoryDialogProps) {
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("Catalog"),
    getTranslations("Common"),
    getLocale(),
  ]);

  return (
    <RouteDialog closeHref={closeHref} closeLabel={tCommon("close")} title={t("editCategory")}>
      <ActionForm action={updateCategoryAction.bind(null, category.id)} locale={locale}>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <FormField
            name="name"
            label={t("categoryName")}
            defaultValue={category.name}
            maxLength={40}
          />
          <FormField
            name="sortOrder"
            label={t("sortOrder")}
            hint={t("sortOrderHint")}
            defaultValue={String(category.sortOrder)}
            inputMode="numeric"
            maxLength={4}
          />
        </div>
        <SubmitButton className="self-start">{t("save")}</SubmitButton>
      </ActionForm>
      <DialogSection
        title={t("deleteCategory")}
        description={
          category.productCount > 0
            ? t("categoryInUseNote", { count: category.productCount })
            : t("deleteCategoryDescription")
        }
      >
        {category.productCount === 0 ? (
          <div>
            <ConfirmAction
              action={deleteCategoryAction.bind(null, category.id)}
              locale={locale}
              labels={{
                trigger: t("deleteCategory"),
                title: t("deleteCategoryTitle", { name: category.name }),
                description: t("deleteCategoryDescription"),
                confirm: t("deleteCategory"),
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
