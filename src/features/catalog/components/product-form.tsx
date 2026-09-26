import { getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormCheckbox, FormField, FormSelect } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import type { FormAction } from "@/lib/validation/form-state";

interface ProductFormProps {
  action: FormAction;
  categories: readonly { id: string; name: string }[];
  /** Cost fields render only for `product:view-cost` (FR-PRD-02). */
  canSeeCost: boolean;
  submitLabel: string;
  product?: {
    name: string;
    categoryId: string;
    price: number;
    cost: number | null;
    unit: string;
    trackStock: boolean;
    hasVariants: boolean;
    sku: string;
    minStock: number;
  };
}

/** Create/edit form for a product and its default variant (FR-PRD-01, §3.1.1). */
export async function ProductForm({
  action,
  categories,
  canSeeCost,
  submitLabel,
  product,
}: ProductFormProps) {
  const [t, locale] = await Promise.all([getTranslations("Catalog"), getLocale()]);

  return (
    <ActionForm action={action} locale={locale}>
      <FormField
        name="name"
        label={t("name")}
        defaultValue={product?.name}
        maxLength={120}
        autoComplete="off"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormSelect
          name="categoryId"
          label={t("category")}
          defaultValue={product?.categoryId}
          options={categories.map((category) => ({ value: category.id, label: category.name }))}
        />
        <FormField
          name="unit"
          label={t("unit")}
          hint={t("unitHint")}
          defaultValue={product?.unit ?? "pcs"}
          maxLength={16}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="price"
          label={t("price")}
          hint={t("moneyHint")}
          defaultValue={product ? String(product.price) : undefined}
          inputMode="numeric"
          maxLength={20}
        />
        {canSeeCost ? (
          <FormField
            name="cost"
            label={t("cost")}
            hint={t("costHint")}
            defaultValue={product && product.cost !== null ? String(product.cost) : undefined}
            inputMode="numeric"
            maxLength={20}
          />
        ) : null}
      </div>
      {product?.hasVariants ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="sku"
            label={t("sku")}
            hint={t("skuHint")}
            defaultValue={product?.sku}
            maxLength={40}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <FormField
            name="minStock"
            label={t("minStock")}
            hint={t("minStockHint")}
            defaultValue={String(product?.minStock ?? 0)}
            inputMode="numeric"
            maxLength={7}
          />
        </div>
      )}
      <FormCheckbox
        name="trackStock"
        label={t("trackStock")}
        hint={t("trackStockHint")}
        defaultChecked={product?.trackStock ?? true}
      />
      <SubmitButton className="self-start">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
