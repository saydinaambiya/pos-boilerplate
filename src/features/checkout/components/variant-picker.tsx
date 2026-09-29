"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/config/locales";
import { ColorSwatch } from "@/features/catalog/components/color-swatch";
import type { PosProduct, PosVariant } from "@/features/catalog/pos-types";
import { formatSize, productDetailsLine } from "@/features/catalog/sizes";
import { formatCurrency } from "@/lib/format/currency";
import { formatMeters, parseDecimal } from "@/lib/format/length";
import { cutPrice } from "@/lib/money/cut";

interface VariantPickerProps {
  product: PosProduct | null;
  locale: Locale;
  isSelectable: (product: PosProduct, variant: PosVariant) => boolean;
  onPick: (product: PosProduct, variant: PosVariant, lengthCm?: number) => void;
  onClose: () => void;
  /** Negative stock allowed, so a cut may be longer than the roll (FR-STK-04). */
  allowNegativeStock: boolean;
}

/** Colours to choose from: a roll product's rolls, or every variant. */
function colorsOf(product: PosProduct): PosVariant[] {
  return product.isRoll
    ? product.variants.filter((variant) => variant.parentId === null)
    : product.variants;
}

function swatch(variant: PosVariant) {
  return variant.colorName
    ? { name: variant.colorName, ...(variant.hex ? { hex: variant.hex } : {}) }
    : null;
}

/**
 * Picker for products with variants (FR-VAR-04). A plain product lists
 * colours with stock; sold-out ones are disabled unless negative stock is
 * allowed, and one tap adds to the cart. A roll product (FR-ROL-04) first
 * asks the colour when it has more than one, then offers each size's
 * pieces or a custom cut typed in cm or m, priced per meter.
 */
export function VariantPicker(props: VariantPickerProps) {
  const { product } = props;
  const t = useTranslations("Pos");
  const colors = product ? colorsOf(product) : [];
  const [chosen, setChosen] = useState<string | null>(null);
  const roll = product?.isRoll
    ? (colors.find((variant) => variant.id === chosen) ?? (colors.length === 1 ? colors[0] : null))
    : null;

  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => {
        if (!open) {
          setChosen(null);
          props.onClose();
        }
      }}
    >
      <DialogContent closeLabel={t("close")}>
        <DialogTitle>{roll ? t("chooseSize") : t("chooseVariant")}</DialogTitle>
        <DialogDescription>
          {product
            ? t("chooseVariantFor", {
                name: [product.name, roll?.colorName, productDetailsLine(product, props.locale)]
                  .filter(Boolean)
                  .join(" · "),
              })
            : null}
        </DialogDescription>
        {product && roll ? (
          <RollOptions
            {...props}
            product={product}
            roll={roll}
            onBack={
              colors.length > 1
                ? () => {
                    setChosen(null);
                  }
                : null
            }
            onPicked={() => {
              setChosen(null);
            }}
          />
        ) : product ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {colors.map((variant) => {
              const selectable = product.isRoll
                ? product.variants.some(
                    (candidate) =>
                      (candidate.id === variant.id || candidate.parentId === variant.id) &&
                      props.isSelectable(product, candidate),
                  )
                : props.isSelectable(product, variant);
              return (
                <li key={variant.id}>
                  <button
                    type="button"
                    disabled={!selectable}
                    onClick={() => {
                      if (product.isRoll) setChosen(variant.id);
                      else props.onPick(product, variant);
                    }}
                    className="flex min-h-14 w-full items-center gap-3 rounded-control border border-border px-3 py-2 text-left hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ColorSwatch color={swatch(variant)} className="size-8" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium [overflow-wrap:anywhere] text-ink">
                        {variant.colorName ?? variant.sku}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {product.isRoll
                          ? t("rollLeft", { length: formatMeters(variant.stockQty, props.locale) })
                          : product.trackStock
                            ? variant.stockQty > 0
                              ? t("stockLeft", { count: variant.stockQty })
                              : t("outOfStock")
                            : variant.sku}
                      </span>
                    </span>
                    {product.isRoll ? null : (
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCurrency(variant.price, props.locale)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Sizes of one roll and a custom cut (FR-ROL-04). */
function RollOptions(
  props: VariantPickerProps & {
    product: PosProduct;
    roll: PosVariant;
    onBack: (() => void) | null;
    onPicked: () => void;
  },
) {
  const { product, roll, locale } = props;
  const t = useTranslations("Pos");
  const id = useId();
  const [length, setLength] = useState("");
  const [unit, setUnit] = useState<"cm" | "m">("cm");
  const [error, setError] = useState<string | null>(null);
  const pieces = product.variants.filter((variant) => variant.parentId === roll.id);
  const typed = parseDecimal(length, unit === "m" ? 2 : 0);
  const lengthCm = typed === null ? null : Math.round(unit === "m" ? typed * 100 : typed);
  const money = (amount: number) => formatCurrency(amount, locale);

  const addCut = () => {
    if (lengthCm === null || lengthCm <= 0) {
      setError(t("cutInvalid"));
      return;
    }
    if (!props.allowNegativeStock && lengthCm > roll.stockQty) {
      setError(t("cutTooLong", { length: formatMeters(roll.stockQty, locale) }));
      return;
    }
    setError(null);
    setLength("");
    props.onPick(product, roll, lengthCm);
    props.onPicked();
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-2 sm:grid-cols-2">
        {pieces.map((piece) => {
          const selectable = props.isSelectable(product, piece);
          return (
            <li key={piece.id}>
              <button
                type="button"
                disabled={!selectable}
                onClick={() => {
                  props.onPick(product, piece);
                  props.onPicked();
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-control border border-border px-3 py-2 text-left hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-ink">
                    {piece.size ? formatSize(piece.size) : piece.sku}
                    {piece.isDefect ? (
                      <span className="ml-2 rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-ink">
                        {t("defect")}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {piece.stockQty > 0
                      ? t("stockLeft", { count: piece.stockQty })
                      : t("outOfStock")}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{money(piece.price)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <form
        className="flex flex-col gap-2 rounded-card bg-surface-muted p-3"
        onSubmit={(event) => {
          event.preventDefault();
          addCut();
        }}
      >
        <p className="text-sm font-medium text-ink">{t("customCut")}</p>
        <p className="text-xs text-ink-muted tabular-nums">
          {t("customCutHint", {
            price: money(roll.price),
            length: formatMeters(roll.stockQty, locale),
          })}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label htmlFor={`${id}-length`} className="sr-only">
            {t("cutLength")}
          </label>
          <Input
            id={`${id}-length`}
            inputMode="decimal"
            value={length}
            onChange={(event) => {
              setLength(event.target.value.slice(0, 8));
            }}
            placeholder={unit === "cm" ? "90" : "1,5"}
            className="w-28 text-center tabular-nums"
          />
          <div role="group" aria-label={t("cutUnit")} className="flex rounded-full bg-surface p-1">
            {(["cm", "m"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={unit === option}
                onClick={() => {
                  setUnit(option);
                }}
                className={
                  unit === option
                    ? "min-h-9 rounded-full bg-primary px-3 text-sm font-medium text-primary-ink"
                    : "min-h-9 rounded-full px-3 text-sm font-medium text-ink-muted"
                }
              >
                {option}
              </button>
            ))}
          </div>
          <Button type="submit" variant="secondary">
            {lengthCm !== null && lengthCm > 0
              ? t("addCutPriced", { price: money(cutPrice(roll.price, lengthCm)) })
              : t("addCut")}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-danger-ink">
            {error}
          </p>
        ) : null}
      </form>

      {props.onBack ? (
        <Button variant="ghost" className="self-start" onClick={props.onBack}>
          {t("otherColor")}
        </Button>
      ) : null}
    </div>
  );
}
