import { getLocale, getTranslations } from "next-intl/server";

import { FormField } from "@/components/form/form-field";

import { ColorField } from "./catalog-choices";

interface VariantFieldsProps {
  /** Roll colours take prices from the product; stock is typed in meters (ADR-0023). */
  roll: boolean;
  /** Opening stock is only asked when creating, and only from `stock:adjust` holders. */
  withInitialStock: boolean;
  variant?: {
    colorName: string;
    sku: string;
    minStock: number;
    priceOverride: number | null;
  };
}

/** Colour variant fields shared by the add and edit forms (FR-VAR-01/02/03, FR-ROL-01). */
export async function VariantFields({ roll, withInitialStock, variant }: VariantFieldsProps) {
  const [t, locale] = await Promise.all([getTranslations("Variants"), getLocale()]);
  const meters = (cm: number) => {
    const text = String(cm / 100);
    return locale.startsWith("en") ? text : text.replace(".", ",");
  };
  const money = { inputMode: "numeric", maxLength: 20 } as const;
  return (
    <>
      <ColorField defaultValue={variant?.colorName} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="sku"
          label={t("sku")}
          hint={roll ? t("rollSkuHint") : undefined}
          defaultValue={variant?.sku}
          maxLength={roll ? 32 : 40}
          autoCapitalize="characters"
          spellCheck={false}
          autoComplete="off"
        />
        <FormField
          name="minStock"
          label={roll ? t("rollMinStock") : t("minStock")}
          defaultValue={roll ? meters(variant?.minStock ?? 0) : String(variant?.minStock ?? 0)}
          inputMode={roll ? "decimal" : "numeric"}
          maxLength={roll ? 9 : 7}
        />
      </div>
      {roll ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="priceOverride"
            money
            label={t("priceOverride")}
            hint={t("priceOverrideHint")}
            defaultValue={variant?.priceOverride == null ? "" : String(variant.priceOverride)}
            {...money}
          />
        </div>
      )}
      {withInitialStock ? (
        <FormField
          name="initialStock"
          label={roll ? t("rollInitialStock") : t("initialStock")}
          hint={roll ? t("rollInitialStockHint") : t("initialStockHint")}
          defaultValue="0"
          inputMode={roll ? "decimal" : "numeric"}
          maxLength={9}
          className="max-w-40"
        />
      ) : null}
    </>
  );
}
