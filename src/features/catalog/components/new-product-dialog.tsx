import { getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { RouteDialog } from "@/components/ui/route-dialog";

import { createProductAction } from "../actions";
import { ProductForm } from "./product-form";

interface NewProductDialogProps {
  brands: ComponentProps<typeof ProductForm>["brands"];
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}

/** Create a product in a dialog over the list (FR-PRD-01, ADR-0018). */
export async function NewProductDialog({ brands, closeHref }: NewProductDialogProps) {
  const [t, tCommon] = await Promise.all([getTranslations("Catalog"), getTranslations("Common")]);
  return (
    <RouteDialog
      closeHref={closeHref}
      closeLabel={tCommon("close")}
      size="lg"
      title={t("newTitle")}
    >
      <ProductForm action={createProductAction} brands={brands} submitLabel={t("create")} />
    </RouteDialog>
  );
}
