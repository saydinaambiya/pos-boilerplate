import { Tags } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createCategoryAction } from "@/features/catalog/actions";
import { CategoryDialog } from "@/features/catalog/components/category-dialog";
import { CatalogTabs } from "@/features/catalog/components/catalog-tabs";
import { getCategories } from "@/features/catalog/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { firstParam } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Catalog");
  return { title: t("tabCategories") };
}

/**
 * Category list in display order with an add form (FR-CAT-01); `?edit=`
 * opens the edit dialog (ADR-0018).
 */
export default async function CategoriesPage({
  searchParams,
}: PageProps<"/[locale]/products/categories">) {
  const session = await requirePermission("category:manage");
  const editing = firstParam((await searchParams).edit);
  const [t, locale, categories] = await Promise.all([
    getTranslations("Catalog"),
    getLocale(),
    getCategories(session),
  ]);
  const editingCategory = categories.find((entry) => entry.id === editing);
  const nextOrder = Math.min((categories.at(-1)?.sortOrder ?? -10) + 10, 9999);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <CatalogTabs current="categories" session={session} />
      <div className="flex flex-col gap-6">
        <Card>
          {categories.length === 0 ? (
            <EmptyState
              icon={<Tags aria-hidden="true" />}
              title={t("categoriesEmptyTitle")}
              description={t("categoriesEmptyDescription")}
            />
          ) : (
            <Table>
              <TableCaption>{t("categoriesCaption")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("categoryName")}</TableHead>
                  <TableHead>{t("sortOrder")}</TableHead>
                  <TableHead>{t("tabProducts")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={{ pathname: "/products/categories", query: { edit: category.id } }}
                        scroll={false}
                        aria-label={t("edit", { name: category.name })}
                        className="underline-offset-4 hover:underline"
                      >
                        {category.name}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{category.sortOrder}</TableCell>
                    <TableCell>
                      <Link
                        href={{ pathname: "/products", query: { category: category.id } }}
                        className="underline-offset-4 hover:underline"
                      >
                        {t("productCount", { count: category.productCount })}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{t("addCategory")}</CardTitle>
          </CardHeader>
          <ActionForm action={createCategoryAction} locale={locale}>
            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
              <FormField name="name" label={t("categoryName")} maxLength={40} autoComplete="off" />
              <FormField
                name="sortOrder"
                label={t("sortOrder")}
                hint={t("sortOrderHint")}
                defaultValue={String(nextOrder)}
                inputMode="numeric"
                maxLength={4}
              />
            </div>
            <SubmitButton className="self-start">{t("addCategory")}</SubmitButton>
          </ActionForm>
        </Card>
      </div>
      {editingCategory ? (
        <CategoryDialog
          key={editingCategory.id}
          category={editingCategory}
          closeHref="/products/categories"
        />
      ) : null}
    </>
  );
}
