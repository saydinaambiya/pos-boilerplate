"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { useGlobalPending } from "@/components/feedback/loading-indicator";
import { useShowResult } from "@/components/feedback/result-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toneClasses } from "@/components/ui/tone";
import type { Locale } from "@/config/locales";
import { ColorSwatch } from "@/features/catalog/components/color-swatch";
import type { PosProduct, PosVariant } from "@/features/catalog/pos-types";
import { defectWord, formatSize, productDetailsLine } from "@/features/catalog/sizes";
import { useRouter } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/format/currency";
import { cn } from "@/lib/utils/cn";

import { searchConsignmentCatalogAction, takeGoodsAction } from "../actions";

interface Line {
  variantId: string;
  label: string;
  price: number;
  qty: number;
}

interface TakeFormProps {
  locale: Locale;
  /** Who the goods can be recorded for; one entry hides the choice. */
  salespeople: readonly { id: string; name: string }[];
  defaultSalespersonId: string;
}

/** Colour and, for a piece cut from a roll, its size and defect flag (ADR-0023, FR-ROL-05). */
function variantName(variant: PosVariant, locale: string): string | null {
  return (
    [
      variant.colorName,
      variant.size ? formatSize(variant.size) : null,
      variant.isDefect ? defectWord(locale) : null,
    ]
      .filter(Boolean)
      .join(" · ") || null
  );
}

/** Product name, then its motif and the variant, so lookalike goods stay apart (FR-CSG-08). */
function variantLabel(product: PosProduct, variant: PosVariant, locale: string) {
  const name = [product.motif, variantName(variant, locale)].filter(Boolean).join(" · ");
  return name ? `${product.name} — ${name}` : product.name;
}

/**
 * Pickup form (FR-CSG-02): who takes the goods, items per variant from a
 * server-side search with quantities, and a note. The idempotency key is
 * kept across retries so a double submit records one pickup.
 */
export function TakeForm({ locale, salespeople, defaultSalespersonId }: TakeFormProps) {
  const t = useTranslations("Consignments");
  const id = useId();
  const router = useRouter();
  const showResult = useShowResult();
  const [salespersonId, setSalespersonId] = useState(defaultSalespersonId);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  useGlobalPending(pending);

  useEffect(() => {
    if (term.trim().length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void searchConsignmentCatalogAction(locale, term).then((rows) => {
        if (active) setResults(rows);
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [term, locale]);

  const money = (amount: number) => formatCurrency(amount, locale);
  const visible = term.trim().length >= 2 ? results : [];

  const add = (product: PosProduct, variant: PosVariant) => {
    setLines((current) =>
      current.some((line) => line.variantId === variant.id)
        ? current.map((line) =>
            line.variantId === variant.id ? { ...line, qty: Math.min(line.qty + 1, 9999) } : line,
          )
        : [
            ...current,
            {
              variantId: variant.id,
              label: variantLabel(product, variant, locale),
              price: variant.price,
              qty: 1,
            },
          ],
    );
  };
  const setQty = (variantId: string, qty: number) => {
    setLines((current) =>
      current.map((line) =>
        line.variantId === variantId ? { ...line, qty: Math.max(1, Math.min(qty, 9999)) } : line,
      ),
    );
  };

  const submit = () => {
    if (pending) return;
    if (lines.length === 0) {
      setError(t("errors.noItems"));
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await takeGoodsAction(locale, {
          idempotencyKey: idempotencyKey.current,
          salespersonId,
          lines: lines.map((line) => ({ variantId: line.variantId, qty: line.qty })),
          note,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        showResult?.({ status: "success", message: result.message });
        router.push(`/consignments/${result.id}`);
      } catch {
        setError(t("errors.network"));
      }
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {salespeople.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-salesperson`} className="text-sm font-medium text-ink">
            {t("salesperson")}
          </label>
          <Select
            id={`${id}-salesperson`}
            value={salespersonId}
            onValueChange={setSalespersonId}
            options={salespeople.map((person) => ({ value: person.id, label: person.name }))}
          />
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">{t("lines")}</legend>
        <label htmlFor={`${id}-search`} className="sr-only">
          {t("searchProduct")}
        </label>
        <Input
          id={`${id}-search`}
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
          }}
          placeholder={t("searchProductPlaceholder")}
          maxLength={60}
        />
        {visible.length > 0 ? (
          <ul
            aria-label={t("searchResults")}
            className="flex max-h-60 flex-col gap-2 overflow-y-auto"
          >
            {visible.map((product) => (
              <li key={product.id} className="rounded-control border border-border p-2">
                <p className="mb-1 text-sm font-medium text-ink">
                  {product.name}
                  {productDetailsLine(product, locale) ? (
                    <span className="block text-xs font-normal text-ink-muted">
                      {productDetailsLine(product, locale)}
                    </span>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((variant) => (
                    <Button
                      key={variant.id}
                      size="sm"
                      variant="secondary"
                      aria-label={t("addItem", { name: variantLabel(product, variant, locale) })}
                      onClick={() => {
                        add(product, variant);
                      }}
                    >
                      {variant.colorName ? (
                        <ColorSwatch
                          color={{
                            name: variant.colorName,
                            ...(variant.hex ? { hex: variant.hex } : {}),
                          }}
                          className="size-4"
                        />
                      ) : null}
                      {variantName(variant, locale) ?? t("addPlain")}
                      {product.trackStock ? (
                        <span className="text-ink-muted tabular-nums">
                          {t("inStock", { count: variant.stockQty })}
                        </span>
                      ) : null}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {lines.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border">
            {lines.map((line) => (
              <li key={line.variantId} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere] text-ink">
                  {line.label}
                  <span className="block text-xs text-ink-muted tabular-nums">
                    {money(line.price)}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("decrease", { name: line.label })}
                    onClick={() => {
                      setQty(line.variantId, line.qty - 1);
                    }}
                  >
                    <Minus aria-hidden="true" />
                  </Button>
                  <Input
                    aria-label={t("quantityOf", { name: line.label })}
                    value={String(line.qty)}
                    onChange={(event) => {
                      const qty = Number.parseInt(event.target.value, 10);
                      if (Number.isFinite(qty)) setQty(line.variantId, qty);
                    }}
                    inputMode="numeric"
                    className="w-16 text-center tabular-nums"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("increase", { name: line.label })}
                    onClick={() => {
                      setQty(line.variantId, line.qty + 1);
                    }}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("removeItem", { name: line.label })}
                  onClick={() => {
                    setLines((current) =>
                      current.filter((entry) => entry.variantId !== line.variantId),
                    );
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">{t("noItemsYet")}</p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="text-sm font-medium text-ink">
          {t("note")}
        </label>
        <Input
          id={`${id}-note`}
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
          }}
          maxLength={200}
        />
      </div>

      {error ? (
        <p role="alert" className={cn("rounded-control px-3 py-2 text-sm", toneClasses.danger)}>
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} aria-busy={pending} className="self-start">
        {t("saveTake")}
      </Button>
    </form>
  );
}
