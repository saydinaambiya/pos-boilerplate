import { getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormCheckbox, FormField, FormSelect } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import type { FormAction } from "@/lib/validation/form-state";

import { formatSize, PRODUCT_SIZES, ROLL_USAGE_CM } from "../sizes";
import { ColorField, MotifField } from "./catalog-choices";

interface ProductFormProps {
  action: FormAction;
  brands: readonly { id: string; name: string }[];
  submitLabel: string;
  product?: {
    name: string;
    brandId: string | null;
    motif: string | null;
    thickness: number | null;
    isRoll: boolean;
    sizePrices: unknown;
    defectSizePrices: unknown;
    price: number;
    unit: string;
    trackStock: boolean;
    hasVariants: boolean;
    sku: string;
    minStock: number;
  };
}

/** Decimal shown in an input in the form's locale, e.g. `2,5`. */
function decimalValue(value: number, locale: string): string {
  return locale.startsWith("en") ? String(value) : String(value).replace(".", ",");
}

/**
 * Create/edit form for a product and its default variant (FR-PRD-01,
 * FR-PRD-06, §3.1.1). New products are rolls (FR-ROL-01): prices are per
 * meter, each size has its piece price for every colour
 * (FR-ROL-02), and the minimum stock of the roll is in meters. Older plain
 * products keep a single price, unit and stock switch. Colour and
 * per-colour SKU live on variants.
 */
export async function ProductForm({ action, brands, submitLabel, product }: ProductFormProps) {
  const [t, locale] = await Promise.all([getTranslations("Catalog"), getLocale()]);
  const isRoll = product?.isRoll ?? true;
  const sizePrices = (product?.sizePrices ?? {}) as Partial<Record<string, number>>;
  const defectPrices = (product?.defectSizePrices ?? {}) as Partial<Record<string, number>>;

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
          name="brandId"
          label={t("brand")}
          placeholder={t("brandPlaceholder")}
          defaultValue={product?.brandId ?? ""}
          options={brands.map((brand) => ({ value: brand.id, label: brand.name }))}
        />
        <MotifField defaultValue={product?.motif} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {product ? null : <ColorField />}
        <FormField
          name="thickness"
          label={t("thickness")}
          hint={t("thicknessHint")}
          defaultValue={
            product?.thickness != null ? decimalValue(product.thickness, locale) : undefined
          }
          inputMode="decimal"
          maxLength={8}
        />
        {isRoll ? null : (
          <FormField
            name="unit"
            label={t("unit")}
            hint={t("unitHint")}
            defaultValue={product?.unit ?? "pcs"}
            maxLength={16}
          />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="price"
          money
          label={isRoll ? t("pricePerMeter") : t("price")}
          hint={isRoll ? t("pricePerMeterHint") : t("moneyHint")}
          defaultValue={product ? String(product.price) : undefined}
          maxLength={20}
        />
      </div>
      {isRoll ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium text-ink">{t("sizePrices")}</legend>
          <p className="text-sm text-ink-muted">{t("sizePricesHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {PRODUCT_SIZES.map((size) => (
              <FormField
                key={size}
                name={`sizePrice_${size}`}
                money
                label={t("sizePrice", { size: formatSize(size) })}
                hint={t("sizeUsage", { meters: decimalValue(ROLL_USAGE_CM[size] / 100, locale) })}
                defaultValue={sizePrices[size] === undefined ? undefined : String(sizePrices[size])}
                maxLength={20}
              />
            ))}
          </div>
        </fieldset>
      ) : null}
      {isRoll ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium text-ink">{t("defectPrices")}</legend>
          <p className="text-sm text-ink-muted">{t("defectPricesHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {PRODUCT_SIZES.map((size) => (
              <FormField
                key={size}
                name={`defectPrice_${size}`}
                money
                label={t("defectPrice", { size: formatSize(size) })}
                defaultValue={
                  defectPrices[size] === undefined ? undefined : String(defectPrices[size])
                }
                maxLength={20}
              />
            ))}
          </div>
        </fieldset>
      ) : null}
      {product?.hasVariants ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="sku"
            label={t("sku")}
            hint={isRoll ? t("rollSkuHint") : t("skuHint")}
            defaultValue={product?.sku}
            maxLength={isRoll ? 32 : 40}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <FormField
            name="minStock"
            label={isRoll ? t("rollMinStock") : t("minStock")}
            hint={t("minStockHint")}
            defaultValue={
              isRoll
                ? decimalValue((product?.minStock ?? 0) / 100, locale)
                : String(product?.minStock ?? 0)
            }
            inputMode={isRoll ? "decimal" : "numeric"}
            maxLength={isRoll ? 9 : 7}
          />
        </div>
      )}
      {isRoll ? null : (
        <FormCheckbox
          name="trackStock"
          label={t("trackStock")}
          hint={t("trackStockHint")}
          defaultChecked={product?.trackStock ?? true}
        />
      )}
      <SubmitButton className="self-start">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
