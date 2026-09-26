"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";

import { ResultDialog } from "@/components/feedback/result-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import type { Locale } from "@/config/locales";
import { ColorSwatch } from "@/features/catalog/components/color-swatch";
import type { PosProduct, PosVariant } from "@/features/catalog/pos-types";
import { useRouter } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/format/currency";
import { parseRupiah } from "@/lib/format/rupiah-input";

import { createOnlineOrderAction, searchOrderCatalogAction } from "../actions";

interface Line {
  variantId: string;
  label: string;
  price: number;
  qty: number;
}

interface OrderEntryFormProps {
  locale: Locale;
  marketplaces: readonly { id: string; name: string }[];
}

function variantLabel(product: PosProduct, variant: PosVariant) {
  return variant.colorName ? `${product.name} — ${variant.colorName}` : product.name;
}

/**
 * Entry form for a marketplace order (FR-ONL-01): marketplace, order code,
 * items picked per variant from a server-side search, shipping fee and
 * note. The total shown is a preview; the server prices the order.
 */
export function OrderEntryForm({ locale, marketplaces }: OrderEntryFormProps) {
  const t = useTranslations("OnlineOrders");
  const id = useId();
  const router = useRouter();
  const [marketplaceId, setMarketplaceId] = useState(marketplaces[0]?.id ?? "");
  const [orderCode, setOrderCode] = useState("");
  const [shippingText, setShippingText] = useState("");
  const [note, setNote] = useState("");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (term.trim().length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void searchOrderCatalogAction(locale, term).then((rows) => {
        if (active) setResults(rows);
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [term, locale]);

  const money = (amount: number) => formatCurrency(amount, locale);
  const shippingFee = shippingText.trim() === "" ? 0 : parseRupiah(shippingText);
  const itemsTotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const visible = term.trim().length >= 2 ? results : [];

  const add = (product: PosProduct, variant: PosVariant) => {
    setLines((current) => {
      const existing = current.find((line) => line.variantId === variant.id);
      if (existing) {
        return current.map((line) =>
          line.variantId === variant.id ? { ...line, qty: Math.min(line.qty + 1, 9999) } : line,
        );
      }
      return [
        ...current,
        {
          variantId: variant.id,
          label: variantLabel(product, variant),
          price: variant.price,
          qty: 1,
        },
      ];
    });
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
    if (orderCode.trim() === "") {
      setError({ message: t("errorOrderCodeRequired"), field: "orderCode" });
      return;
    }
    if (lines.length === 0) {
      setError({ message: t("errorNoItems"), field: "lines" });
      return;
    }
    if (shippingFee === null) {
      setError({ message: t("errorShippingFee"), field: "shippingFee" });
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createOnlineOrderAction(locale, {
          marketplaceId,
          orderCode,
          lines: lines.map((line) => ({ variantId: line.variantId, qty: line.qty })),
          shippingFee,
          note,
        });
        if (result.ok) {
          router.push(`/online-orders/${result.id}`);
          return;
        }
        setError(
          result.field
            ? { message: result.message, field: result.field }
            : { message: result.message },
        );
      } catch {
        setError({ message: t("errorNetwork") });
      }
    });
  };

  const fieldError = (field: string) =>
    error?.field === field ? (
      <p id={`${id}-${field}-error`} className="text-sm text-danger-ink">
        {error.message}
      </p>
    ) : null;
  const describedBy = (field: string) =>
    error?.field === field ? `${id}-${field}-error` : undefined;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-marketplace`} className="text-sm font-medium text-ink">
            {t("marketplace")}
          </label>
          <Select
            id={`${id}-marketplace`}
            value={marketplaceId}
            onChange={(event) => {
              setMarketplaceId(event.target.value);
            }}
          >
            {marketplaces.map((marketplace) => (
              <option key={marketplace.id} value={marketplace.id}>
                {marketplace.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-code`} className="text-sm font-medium text-ink">
            {t("orderCode")}
          </label>
          <Input
            id={`${id}-code`}
            value={orderCode}
            onChange={(event) => {
              setOrderCode(event.target.value);
            }}
            maxLength={40}
            autoCapitalize="characters"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error?.field === "orderCode" ? true : undefined}
            aria-describedby={describedBy("orderCode")}
          />
          {fieldError("orderCode")}
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">{t("items")}</legend>
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
          aria-describedby={describedBy("lines")}
        />
        {visible.length > 0 ? (
          <ul
            aria-label={t("searchResults")}
            className="flex max-h-72 flex-col gap-2 overflow-y-auto"
          >
            {visible.map((product) => (
              <li key={product.id} className="rounded-control border border-border p-2">
                <p className="mb-1 text-sm font-medium text-ink">{product.name}</p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((variant) => (
                    <Button
                      key={variant.id}
                      size="sm"
                      variant="secondary"
                      aria-label={t("addItem", { name: variantLabel(product, variant) })}
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
                      {variant.colorName ?? t("addPlain")}
                      <span className="text-ink-muted tabular-nums">{money(variant.price)}</span>
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {fieldError("lines")}
        {lines.length > 0 ? (
          <ul aria-label={t("orderLines")} className="flex flex-col divide-y divide-border">
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
                <span className="w-28 text-right text-sm font-medium tabular-nums">
                  {money(line.price * line.qty)}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-shipping`} className="text-sm font-medium text-ink">
            {t("shippingFee")}
          </label>
          <MoneyInput
            id={`${id}-shipping`}
            value={shippingText}
            onValueChange={setShippingText}

            maxLength={20}
            aria-invalid={error?.field === "shippingFee" ? true : undefined}
            aria-describedby={describedBy("shippingFee")}
          />
          {fieldError("shippingFee")}
        </div>
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
            maxLength={300}
          />
        </div>
      </div>

      <dl className="flex max-w-sm flex-col gap-1 self-end text-sm">
        <div className="flex justify-between gap-6">
          <dt className="text-ink-muted">{t("itemsTotal")}</dt>
          <dd className="tabular-nums">{money(itemsTotal)}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-ink-muted">{t("shippingFee")}</dt>
          <dd className="tabular-nums">{money(shippingFee ?? 0)}</dd>
        </div>
      </dl>

      <ResultDialog
        result={error && !error.field ? { status: "error", message: error.message } : null}
        onClose={() => {
          setError(null);
        }}
      />
      <Button type="submit" disabled={pending} aria-busy={pending} className="self-start">
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
