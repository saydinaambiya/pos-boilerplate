import { getLocale, getTranslations } from "next-intl/server";

import { FormField } from "@/components/form/form-field";
import { type StockMeasure, stockInputValue } from "@/lib/format/quantity";

import { ColorField } from "./catalog-choices";

interface VariantFieldsProps {
  /**
   * How stock is typed: roll colours in meters and take prices from the
   * product (ADR-0023); kg accessories in kg with decimals (ADR-0045).
   */
  measure: StockMeasure;
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
export async function VariantFields({ measure, withInitialStock, variant }: VariantFieldsProps) {
  const [t, locale] = await Promise.all([getTranslations("Variants"), getLocale()]);
  const roll = measure === "meter";
  const decimal = measure !== "count";
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
          label={roll ? t("rollMinStock") : measure === "kg" ? t("kgMinStock") : t("minStock")}
          defaultValue={stockInputValue(measure, variant?.minStock ?? 0, locale)}
          inputMode={decimal ? "decimal" : "numeric"}
          maxLength={decimal ? 9 : 7}
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
          label={
            roll
              ? t("rollInitialStock")
              : measure === "kg"
                ? t("kgInitialStock")
                : t("initialStock")
          }
          hint={roll ? t("rollInitialStockHint") : t("initialStockHint")}
          defaultValue="0"
          inputMode={decimal ? "decimal" : "numeric"}
          maxLength={9}
          className="max-w-40"
        />
      ) : null}
    </>
  );
}
