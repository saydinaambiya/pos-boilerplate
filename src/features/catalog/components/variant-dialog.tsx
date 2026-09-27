import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { ActionForm } from "@/components/form/action-form";
import { ConfirmAction } from "@/components/form/confirm-action";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { DialogSection } from "@/components/ui/dialog";
import { RouteDialog } from "@/components/ui/route-dialog";
import { Link } from "@/i18n/navigation";
import type { Session } from "@/lib/auth/session";
import { variantLabel } from "@/lib/format/variant-label";

import { setVariantStatusAction, updateVariantAction } from "../variant-actions";
import { getVariant } from "../variant-service";
import { ColorSwatch } from "./color-swatch";
import { VariantFields } from "./variant-fields";

interface VariantDialogProps {
  session: Session;
  productId: string;
  variantId: string;
}

/**
 * Edit a colour variant and its status in a dialog over its product
 * (FR-VAR-01/02/03/05, ADR-0018). Renders nothing for a variant of another
 * product.
 */
export async function VariantDialog({ session, productId, variantId }: VariantDialogProps) {
  if (!z.uuid().safeParse(variantId).success) return null;
  const [t, tCommon, locale, variant] = await Promise.all([
    getTranslations("Variants"),
    getTranslations("Common"),
    getLocale(),
    getVariant(session, variantId),
  ]);
  if (!variant?.color || variant.productId !== productId) return null;
  const name = variant.color.name;
  const locked = variant.isDefault && variant.productActive && variant.isActive;

  return (
    <RouteDialog
      closeHref={`/products/${productId}`}
      closeLabel={tCommon("close")}
      size="lg"
      title={variantLabel(variant.productName, name)}
      description={variant.sku}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <ColorSwatch color={variant.color} className="size-10" />
          <span className="text-sm text-ink-muted">{variant.color.hex ?? name}</span>
        </span>
        {session.permissions.has("page:stock") ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/stock/${variant.id}`}>{t("manageStock")}</Link>
          </Button>
        ) : null}
      </div>
      <ActionForm action={updateVariantAction.bind(null, variant.id)} locale={locale}>
        <VariantFields
          canSeeCost={session.permissions.has("product:view-cost")}
          withInitialStock={false}
          variant={{
            colorName: name,
            hex: variant.color.hex ?? "",
            sku: variant.sku,
            minStock: variant.minStock,
            priceOverride: variant.priceOverride,
            costOverride: variant.costOverride,
          }}
        />
        <SubmitButton className="self-start">{tCommon("save")}</SubmitButton>
      </ActionForm>
      <DialogSection
        title={t("statusSection")}
        description={
          locked ? t("defaultNote") : variant.isActive ? t("statusActive") : t("statusInactive")
        }
      >
        {locked ? null : (
          <div>
            <ConfirmAction
              action={setVariantStatusAction.bind(null, variant.id, !variant.isActive)}
              locale={locale}
              variant={variant.isActive ? "danger" : "secondary"}
              labels={{
                trigger: variant.isActive ? t("deactivate") : t("activate"),
                title: variant.isActive
                  ? t("deactivateTitle", { name })
                  : t("activateTitle", { name }),
                description: variant.isActive
                  ? t("deactivateDescription")
                  : t("activateDescription"),
                confirm: variant.isActive ? t("deactivate") : t("activate"),
                cancel: tCommon("cancel"),
                close: tCommon("close"),
              }}
            />
          </div>
        )}
      </DialogSection>
    </RouteDialog>
  );
}
