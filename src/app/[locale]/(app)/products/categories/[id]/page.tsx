import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ActionForm } from "@/components/form/action-form";
import { ConfirmAction } from "@/components/form/confirm-action";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { deleteCategoryAction, updateCategoryAction } from "@/features/catalog/actions";
import { getCategories } from "@/features/catalog/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Catalog");
  return { title: t("editCategory") };
}

/** Rename, reorder or delete an empty category (FR-CAT-01). */
export default async function EditCategoryPage({
  params,
}: PageProps<"/[locale]/products/categories/[id]">) {
  const { id } = await params;
  const session = await requirePermission("category:manage");
  if (!z.uuid().safeParse(id).success) notFound();

  const [t, tCommon, locale, categories] = await Promise.all([
    getTranslations("Catalog"),
    getTranslations("Common"),
    getLocale(),
    getCategories(session),
  ]);
  const category = categories.find((entry) => entry.id === id);
  if (!category) notFound();

  return (
    <>
      <PageHeader
        title={category.name}
        actions={
          <Button asChild variant="secondary">
            <Link href="/products/categories">{t("back")}</Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <Card className="max-w-2xl">
          <ActionForm action={updateCategoryAction.bind(null, category.id)} locale={locale}>
            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
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
        </Card>
        <Card className="max-w-2xl">
          <CardHeader className="flex-col gap-1">
            <CardTitle>{t("deleteCategory")}</CardTitle>
            <CardDescription>
              {category.productCount > 0
                ? t("categoryInUseNote", { count: category.productCount })
                : t("deleteCategoryDescription")}
            </CardDescription>
          </CardHeader>
          {category.productCount === 0 ? (
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
          ) : null}
        </Card>
      </div>
    </>
  );
}
