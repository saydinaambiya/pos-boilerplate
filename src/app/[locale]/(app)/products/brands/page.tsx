import { BadgeCheck } from "lucide-react";
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
import { createBrandAction } from "@/features/catalog/actions";
import { BrandDialog } from "@/features/catalog/components/brand-dialog";
import { CatalogTabs } from "@/features/catalog/components/catalog-tabs";
import { getBrands } from "@/features/catalog/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { firstParam } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Catalog");
  return { title: t("tabBrands") };
}

/**
 * Brand list with an add form (FR-CAT-02); `?edit=` opens the edit dialog
 * (ADR-0018).
 */
export default async function BrandsPage({ searchParams }: PageProps<"/[locale]/products/brands">) {
  const session = await requirePermission("brand:manage");
  const editing = firstParam((await searchParams).edit);
  const [t, locale, brands] = await Promise.all([
    getTranslations("Catalog"),
    getLocale(),
    getBrands(session),
  ]);
  const editingBrand = brands.find((entry) => entry.id === editing);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <CatalogTabs current="brands" session={session} />
      <div className="flex flex-col gap-6">
        <Card>
          {brands.length === 0 ? (
            <EmptyState
              icon={<BadgeCheck aria-hidden="true" />}
              title={t("brandsEmptyTitle")}
              description={t("brandsEmptyDescription")}
            />
          ) : (
            <Table>
              <TableCaption>{t("brandsCaption")}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("brandName")}</TableHead>
                  <TableHead>{t("tabProducts")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brands.map((brand) => (
                  <TableRow key={brand.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={{ pathname: "/products/brands", query: { edit: brand.id } }}
                        scroll={false}
                        aria-label={t("edit", { name: brand.name })}
                        className="underline-offset-4 hover:underline"
                      >
                        {brand.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={{ pathname: "/products", query: { brand: brand.id } }}
                        className="underline-offset-4 hover:underline"
                      >
                        {t("productCount", { count: brand.productCount })}
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
            <CardTitle>{t("addBrand")}</CardTitle>
          </CardHeader>
          <ActionForm action={createBrandAction} locale={locale}>
            <FormField name="name" label={t("brandName")} maxLength={40} autoComplete="off" />
            <SubmitButton className="self-start">{t("addBrand")}</SubmitButton>
          </ActionForm>
        </Card>
      </div>
      {editingBrand ? (
        <BrandDialog key={editingBrand.id} brand={editingBrand} closeHref="/products/brands" />
      ) : null}
    </>
  );
}
