import { getTranslations } from "next-intl/server";

import { FormCombobox } from "@/components/form/form-combobox";

import { COLORS, MOTIF_OPTIONS } from "../options";

/**
 * Searchable motif choice from `MOTIFS`; 3D motifs sit under their family.
 * "Other" takes a typed motif, and a stored motif outside the list opens
 * there prefilled (FR-PRD-06, ADR-0026, ADR-0034).
 */
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
      options={MOTIF_OPTIONS}
      other={{ label: t("otherChoice"), inputLabel: t("otherMotif"), maxLength: 60 }}
    />
  );
}

/**
 * Searchable colour choice from `COLORS` with swatches; the hex follows the
 * name. "Other" takes a typed colour without a swatch (FR-VAR-01/03,
 * ADR-0026, ADR-0034).
 */
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
      options={COLORS.map((color) => ({ value: color.name, label: color.name, hex: color.hex }))}
      other={{ label: tCatalog("otherChoice"), inputLabel: tCatalog("otherColor"), maxLength: 40 }}
    />
  );
}
