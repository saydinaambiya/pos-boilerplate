import { getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { RouteDialog } from "@/components/ui/route-dialog";
import { Link } from "@/i18n/navigation";

import { createProductAction } from "../actions";
import { ProductForm } from "./product-form";

interface NewProductDialogProps {
  brands: ComponentProps<typeof ProductForm>["brands"];
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
  category: "MAIN" | "ACCESSORY";
  /** Links to this dialog for each kind of product (`?category=`). */
  categoryHrefs: Record<"MAIN" | "ACCESSORY", string>;
}

/**
 * Create a product in a dialog over the list (FR-PRD-01, ADR-0018): a roll
 * of the store's main goods, or an accessory such as glue or thread
 * (FR-PRD-07, ADR-0045).
 */
export async function NewProductDialog({
  brands,
  closeHref,
  category,
  categoryHrefs,
}: NewProductDialogProps) {
  const [t, tCommon] = await Promise.all([getTranslations("Catalog"), getTranslations("Common")]);
  return (
    <RouteDialog
      closeHref={closeHref}
      closeLabel={tCommon("close")}
      size="lg"
      title={t("newTitle")}
    >
      <div role="group" aria-label={t("categoryTabs")} className="flex flex-wrap gap-2">
        {(["MAIN", "ACCESSORY"] as const).map((option) => (
          <Button
            key={option}
            asChild
            size="sm"
            variant={option === category ? "primary" : "secondary"}
          >
            <Link
              href={categoryHrefs[option]}
              scroll={false}
              aria-current={option === category ? "page" : undefined}
            >
              {t(`category${option}`)}
            </Link>
          </Button>
        ))}
      </div>
      <ProductForm
        key={category}
        action={createProductAction}
        brands={brands}
        category={category}
        submitLabel={t("create")}
      />
    </RouteDialog>
  );
}
