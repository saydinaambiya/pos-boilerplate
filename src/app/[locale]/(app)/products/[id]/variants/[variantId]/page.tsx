import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ActionForm } from "@/components/form/action-form";
import { ConfirmAction } from "@/components/form/confirm-action";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ColorSwatch } from "@/features/catalog/components/color-swatch";
import { VariantFields } from "@/features/catalog/components/variant-fields";
import { setVariantStatusAction, updateVariantAction } from "@/features/catalog/variant-actions";
import { getVariant } from "@/features/catalog/variant-service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { variantLabel } from "@/lib/format/variant-label";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Variants");
  return { title: t("editTitle") };
}

/** Edit a colour variant and its status (FR-VAR-01/02/03/05). */
export default async function EditVariantPage({
  params,
}: PageProps<"/[locale]/products/[id]/variants/[variantId]">) {
  const { id, variantId } = await params;
  const session = await requirePermission("product:update");
  if (!z.uuid().safeParse(variantId).success) notFound();

  const [t, tCommon, locale, variant] = await Promise.all([
    getTranslations("Variants"),
    getTranslations("Common"),
    getLocale(),
    getVariant(session, variantId),
  ]);
  if (!variant?.color || variant.productId !== id) notFound();
  const name = variant.color.name;
  const locked = variant.isDefault && variant.productActive && variant.isActive;

  return (
    <>
      <PageHeader
        title={variantLabel(variant.productName, name)}
        description={variant.sku}
        actions={
          <>
            {session.permissions.has("page:stock") ? (
              <Button asChild variant="ghost">
                <Link href={`/stock/${variant.id}`}>{t("manageStock")}</Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link href={`/products/${id}`}>{t("back")}</Link>
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <Card className="max-w-2xl">
          <div className="mb-4 flex items-center gap-3">
            <ColorSwatch color={variant.color} className="size-10" />
            <span className="text-sm text-ink-muted">{variant.color.hex ?? name}</span>
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
        </Card>
        <Card className="max-w-2xl">
          <CardHeader className="flex-col gap-1">
            <CardTitle>{t("statusSection")}</CardTitle>
            <CardDescription>
              {locked
                ? t("defaultNote")
                : variant.isActive
                  ? t("statusActive")
                  : t("statusInactive")}
            </CardDescription>
          </CardHeader>
          {locked ? null : (
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
          )}
        </Card>
      </div>
    </>
  );
}
