import { TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Chip } from "@/components/ui/chip";

/** Stock with a labelled low-stock marker (FR-STK-07, FR-UI-05). */
export async function StockCell({
  trackStock,
  stockQty,
  minStock,
  low = stockQty <= minStock,
  label,
}: {
  trackStock: boolean;
  stockQty: number;
  minStock: number;
  /** Overrides the check, e.g. "any variant is low" for a product total. */
  low?: boolean;
  /** Formatted quantity, e.g. a roll's meters and pieces (ADR-0023). */
  label?: string | undefined;
}) {
  const t = await getTranslations("Catalog");
  if (!trackStock) return <span className="text-ink-muted">{t("notTracked")}</span>;
  return (
    <span className="flex flex-wrap items-center gap-2 tabular-nums">
      {label ?? stockQty}
      {low ? (
        <Chip tone="warning" icon={<TriangleAlert aria-hidden="true" />}>
          {t("lowStock")}
        </Chip>
      ) : null}
    </span>
  );
}
