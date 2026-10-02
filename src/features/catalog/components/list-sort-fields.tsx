import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { Locale } from "@/config/locales";
import { formatThickness } from "@/lib/format/length";

import type { ListSort } from "../schemas";

interface ListSortFieldsProps {
  locale: Locale;
  /** Thicknesses in use, thinnest first. */
  thicknesses: readonly number[];
  thickness: number | undefined;
  sort: ListSort;
  labels: {
    thickness: string;
    allThicknesses: string;
    sort: string;
    name: string;
    thinFirst: string;
    thickFirst: string;
  };
}

/**
 * Thickness filter and sort of the product and stock lists, posted as
 * `thickness` and `sort` (FR-PRD-04, FR-STK-08, ADR-0041).
 */
export function ListSortFields({
  locale,
  thicknesses,
  thickness,
  sort,
  labels,
}: ListSortFieldsProps) {
  return (
    <>
      <Field label={labels.thickness}>
        {(control) => (
          <Select
            {...control}
            name="thickness"
            defaultValue={thickness === undefined ? "" : String(thickness)}
            options={[
              { value: "", label: labels.allThicknesses },
              ...thicknesses.map((value) => ({
                value: String(value),
                label: formatThickness(value, locale),
              })),
            ]}
          />
        )}
      </Field>
      <Field label={labels.sort}>
        {(control) => (
          <Select
            {...control}
            name="sort"
            defaultValue={sort}
            options={[
              { value: "name", label: labels.name },
              { value: "thickness-asc", label: labels.thinFirst },
              { value: "thickness-desc", label: labels.thickFirst },
            ]}
          />
        )}
      </Field>
    </>
  );
}
