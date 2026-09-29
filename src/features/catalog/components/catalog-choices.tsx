import { getTranslations } from "next-intl/server";

import { FormCombobox } from "@/components/form/form-combobox";

import { COLORS, MOTIF_OPTIONS } from "../options";

/** Options plus the stored value when it predates the lists, so editing keeps it. */
function withCurrent<T extends { value: string; label: string }>(
  options: readonly T[],
  current: string | null | undefined,
): readonly (T | { value: string; label: string })[] {
  return current && !options.some((option) => option.value === current)
    ? [{ value: current, label: current }, ...options]
    : options;
}

/** Searchable motif choice from `MOTIFS`; 3D motifs sit under their family (FR-PRD-06, ADR-0026). */
export async function MotifField({ defaultValue }: { defaultValue?: string | null | undefined }) {
  const t = await getTranslations("Catalog");
  return (
    <FormCombobox
      name="motif"
      label={t("motif")}
      placeholder={t("motifPlaceholder")}
      searchPlaceholder={t("searchChoice")}
      emptyText={t("noChoice")}
      defaultValue={defaultValue ?? ""}
      options={withCurrent(MOTIF_OPTIONS, defaultValue)}
    />
  );
}

/** Searchable colour choice from `COLORS` with swatches; the hex follows the name (FR-VAR-01/03). */
export async function ColorField({ defaultValue }: { defaultValue?: string | null | undefined }) {
  const [t, tCatalog] = await Promise.all([
    getTranslations("Variants"),
    getTranslations("Catalog"),
  ]);
  return (
    <FormCombobox
      name="colorName"
      label={t("colorName")}
      placeholder={t("colorPlaceholder")}
      searchPlaceholder={tCatalog("searchChoice")}
      emptyText={tCatalog("noChoice")}
      defaultValue={defaultValue ?? ""}
      options={withCurrent(
        COLORS.map((color) => ({ value: color.name, label: color.name, hex: color.hex })),
        defaultValue,
      )}
    />
  );
}
