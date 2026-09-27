import { getTranslations } from "next-intl/server";

import { FormField } from "@/components/form/form-field";

interface VariantFieldsProps {
  canSeeCost: boolean;
  /** Opening stock is only asked when creating, and only from `stock:adjust` holders. */
  withInitialStock: boolean;
  variant?: {
    colorName: string;
    hex: string;
    sku: string;
    minStock: number;
    priceOverride: number | null;
    costOverride: number | null;
  };
}

/** Colour variant fields shared by the add and edit forms (FR-VAR-01/02/03). */
export async function VariantFields({ canSeeCost, withInitialStock, variant }: VariantFieldsProps) {
  const t = await getTranslations("Variants");
  const money = { inputMode: "numeric", maxLength: 20 } as const;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="colorName"
          label={t("colorName")}
          defaultValue={variant?.colorName}
          maxLength={40}
        />
        <FormField
          name="hex"
          label={t("hex")}
          hint={t("hexHint")}
          defaultValue={variant?.hex}
          maxLength={7}
          autoCapitalize="characters"
          spellCheck={false}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="sku"
          label={t("sku")}
          defaultValue={variant?.sku}
          maxLength={40}
          autoCapitalize="characters"
          spellCheck={false}
          autoComplete="off"
        />
        <FormField
          name="minStock"
          label={t("minStock")}
          defaultValue={String(variant?.minStock ?? 0)}
          inputMode="numeric"
          maxLength={7}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="priceOverride"
          money
          label={t("priceOverride")}
          hint={t("priceOverrideHint")}
          defaultValue={variant?.priceOverride == null ? "" : String(variant.priceOverride)}
          {...money}
        />
        {canSeeCost ? (
          <FormField
            name="costOverride"
            money
            label={t("costOverride")}
            hint={t("costOverrideHint")}
            defaultValue={variant?.costOverride == null ? "" : String(variant.costOverride)}
            {...money}
          />
        ) : null}
      </div>
      {withInitialStock ? (
        <FormField
          name="initialStock"
          label={t("initialStock")}
          hint={t("initialStockHint")}
          defaultValue="0"
          inputMode="numeric"
          maxLength={7}
          className="max-w-40"
        />
      ) : null}
    </>
  );
}
