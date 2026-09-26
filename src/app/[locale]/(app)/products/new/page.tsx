import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { createProductAction } from "@/features/catalog/actions";
import { ProductForm } from "@/features/catalog/components/product-form";
import { getCategories } from "@/features/catalog/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Catalog");
  return { title: t("newTitle") };
}

/** Create a product (FR-PRD-01). */
export default async function NewProductPage() {
  const session = await requirePermission("product:create");
  const [t, categories] = await Promise.all([getTranslations("Catalog"), getCategories(session)]);

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        actions={
          <Button asChild variant="secondary">
            <Link href="/products">{t("back")}</Link>
          </Button>
        }
      />
      <Card className="max-w-2xl">
        {categories.length === 0 ? (
          <EmptyState title={t("noCategoriesTitle")} description={t("noCategoriesDescription")} />
        ) : (
          <ProductForm
            action={createProductAction}
            categories={categories}
            canSeeCost={session.permissions.has("product:view-cost")}
            submitLabel={t("create")}
          />
        )}
      </Card>
    </>
  );
}
