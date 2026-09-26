"use client";

import { useTranslations } from "next-intl";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Locale } from "@/config/locales";
import { ColorSwatch } from "@/features/catalog/components/color-swatch";
import type { PosProduct, PosVariant } from "@/features/catalog/pos-types";
import { formatCurrency } from "@/lib/format/currency";

interface VariantPickerProps {
  product: PosProduct | null;
  locale: Locale;
  isSelectable: (product: PosProduct, variant: PosVariant) => boolean;
  onPick: (product: PosProduct, variant: PosVariant) => void;
  onClose: () => void;
}

/**
 * Colour picker for products with variants: swatch, colour name and stock;
 * sold-out colours are disabled unless negative stock is allowed. One tap
 * adds to the cart (FR-VAR-04).
 */
export function VariantPicker({
  product,
  locale,
  isSelectable,
  onPick,
  onClose,
}: VariantPickerProps) {
  const t = useTranslations("Pos");

  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent closeLabel={t("close")}>
        <DialogTitle>{t("chooseVariant")}</DialogTitle>
        <DialogDescription>
          {product ? t("chooseVariantFor", { name: product.name }) : null}
        </DialogDescription>
        <ul className="grid gap-2 sm:grid-cols-2">
          {product?.variants.map((variant) => {
            const selectable = isSelectable(product, variant);
            return (
              <li key={variant.id}>
                <button
                  type="button"
                  disabled={!selectable}
                  onClick={() => {
                    onPick(product, variant);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 rounded-control border border-border px-3 py-2 text-left hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ColorSwatch
                    color={
                      variant.colorName
                        ? { name: variant.colorName, ...(variant.hex ? { hex: variant.hex } : {}) }
                        : null
                    }
                    className="size-8"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium [overflow-wrap:anywhere] text-ink">
                      {variant.colorName ?? variant.sku}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {product.trackStock
                        ? variant.stockQty > 0
                          ? t("stockLeft", { count: variant.stockQty })
                          : t("outOfStock")
                        : variant.sku}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatCurrency(variant.price, locale)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
