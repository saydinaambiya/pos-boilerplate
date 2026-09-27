import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ConfirmAction } from "@/components/form/confirm-action";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { setProductStatusAction, updateProductAction } from "@/features/catalog/actions";
import { ProductForm } from "@/features/catalog/components/product-form";
import { VariantDialog } from "@/features/catalog/components/variant-dialog";
import { VariantsSection } from "@/features/catalog/components/variants-section";
import { getCategories, getProduct } from "@/features/catalog/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { firstParam } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Catalog");
  return { title: t("editTitle") };
}

/**
 * Edit a product and its default variant, or change its status
 * (FR-PRD-01/03); `?variant=` opens a variant's edit dialog (ADR-0018).
 */
export default async function EditProductPage({
  params,
  searchParams,
}: PageProps<"/[locale]/products/[id]">) {
  const { id } = await params;
  const editingVariant = firstParam((await searchParams).variant);
  const session = await requirePermission("product:update");
  if (!z.uuid().safeParse(id).success) notFound();

  const [t, tCommon, locale, categories, product] = await Promise.all([
    getTranslations("Catalog"),
    getTranslations("Common"),
    getLocale(),
    getCategories(session),
    getProduct(session, id),
  ]);
  if (!product) notFound();

  return (
    <>
      <PageHeader
        title={product.name}
        description={product.sku}
        actions={
          <Button asChild variant="secondary">
            <Link href="/products">{t("back")}</Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <Card className="max-w-2xl">
          {product.trackStock ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <CardDescription>{t("stockNote", { stock: product.stockQty })}</CardDescription>
              {session.permissions.has("page:stock") && !product.hasVariants ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/stock/${product.variantId}`}>{t("manageStock")}</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
          <ProductForm
            action={updateProductAction.bind(null, product.id)}
            categories={categories}
            canSeeCost={session.permissions.has("product:view-cost")}
            submitLabel={t("save")}
            product={product}
          />
        </Card>
        <VariantsSection session={session} product={product} />
        <Card className="max-w-2xl">
          <CardHeader className="flex-col gap-1">
            <CardTitle>{t("statusSection")}</CardTitle>
            <CardDescription>
              {product.isActive ? t("statusActiveNote") : t("statusInactiveNote")}
            </CardDescription>
          </CardHeader>
          <ConfirmAction
            action={setProductStatusAction.bind(null, product.id, !product.isActive)}
            locale={locale}
            variant={product.isActive ? "danger" : "secondary"}
            labels={{
              trigger: product.isActive ? t("deactivate") : t("activate"),
              title: product.isActive
                ? t("deactivateTitle", { name: product.name })
                : t("activateTitle", { name: product.name }),
              description: product.isActive ? t("deactivateDescription") : t("activateDescription"),
              confirm: product.isActive ? t("deactivate") : t("activate"),
              cancel: tCommon("cancel"),
              close: tCommon("close"),
            }}
          />
        </Card>
      </div>
      {editingVariant ? (
        <VariantDialog
          key={editingVariant}
          session={session}
          productId={product.id}
          variantId={editingVariant}
        />
      ) : null}
    </>
  );
}
