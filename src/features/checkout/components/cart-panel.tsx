"use client";

import { Minus, Plus, Tag, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Locale } from "@/config/locales";
import { formatCurrency } from "@/lib/format/currency";
import { parseRupiah } from "@/lib/format/rupiah-input";
import type { ItemDiscount, SaleTotals, TaxRules, VoucherRule } from "@/lib/money/calculate";
import { basisPointsToPercent, percentToBasisPoints } from "@/lib/settings/rates";

import type { CartItem } from "./use-cart";

interface CartPanelProps {
  items: CartItem[];
  totals: SaleTotals;
  tax: TaxRules;
  locale: Locale;
  canDiscount: boolean;
  maxQty: (variantId: string) => number | null;
  onQty: (variantId: string, qty: number) => void;
  onRemove: (variantId: string) => void;
  onDiscount: (variantId: string, discount: ItemDiscount | null) => void;
  onClear: () => void;
  onPay: () => void;
  voucher: { code: string; name: string; rule: VoucherRule } | null;
  /** Resolves to an error message, or null when the voucher was applied. */
  onApplyVoucher: (code: string) => Promise<string | null>;
  onRemoveVoucher: () => void;
}

/** "Voucher HEMAT (10%)" for percentage vouchers, "Voucher HEMAT" otherwise. */
function voucherLabel(
  t: ReturnType<typeof useTranslations<"Pos">>,
  voucher: { code: string; rule: VoucherRule },
) {
  return voucher.rule.type === "percent"
    ? t("voucherAppliedPercent", {
        code: voucher.code,
        percent: basisPointsToPercent(voucher.rule.value),
      })
    : t("voucherApplied", { code: voucher.code });
}

/** One voucher per sale (FR-POS-03); the server validates it again at checkout. */
function VoucherField(
  props: Pick<
    CartPanelProps,
    "voucher" | "onApplyVoucher" | "onRemoveVoucher" | "totals" | "locale"
  >,
) {
  const t = useTranslations("Pos");
  const id = useId();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { voucher } = props;

  if (voucher) {
    const minPurchase = voucher.rule.minPurchase;
    return (
      <div className="flex flex-col gap-1 rounded-control bg-surface-muted px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{`${voucherLabel(t, voucher)} · ${voucher.name}`}</span>
          <Button size="sm" variant="ghost" onClick={props.onRemoveVoucher}>
            {t("removeVoucher")}
          </Button>
        </div>
        {voucher.rule.type === "percent" && voucher.rule.maxDiscount != null ? (
          <p className="text-xs text-ink-muted">
            {t("voucherMaxDiscount", {
              amount: formatCurrency(voucher.rule.maxDiscount, props.locale),
            })}
          </p>
        ) : null}
        {minPurchase != null && props.totals.subtotal < minPurchase ? (
          <p className="text-xs text-danger-ink">
            {t("voucherMinPurchase", { amount: formatCurrency(minPurchase, props.locale) })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {t("voucherCode")}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setMessage(null);
          }}
          maxLength={20}
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={message ? true : undefined}
        />
        <Button
          variant="secondary"
          disabled={code.trim() === "" || pending}
          onClick={() => {
            startTransition(async () => {
              const error = await props.onApplyVoucher(code.trim());
              setMessage(error);
              if (!error) setCode("");
            });
          }}
        >
          {pending ? t("checkingVoucher") : t("applyVoucher")}
        </Button>
      </div>
      {message ? (
        <p role="alert" className="text-xs text-danger-ink">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function itemName(item: CartItem) {
  return item.colorName ? `${item.name} · ${item.colorName}` : item.name;
}

/** Per-line discount editor (FR-POS-02); shown only with `pos:item-discount`. */
function DiscountEditor({
  item,
  onApply,
  onDone,
}: {
  item: CartItem;
  onApply: (discount: ItemDiscount | null) => void;
  onDone: () => void;
}) {
  const t = useTranslations("Pos");
  const id = useId();
  const [type, setType] = useState<ItemDiscount["type"]>(item.discount?.type ?? "percent");
  const [value, setValue] = useState(
    item.discount?.type === "percent"
      ? basisPointsToPercent(item.discount.bps)
      : item.discount?.type === "amount"
        ? String(item.discount.value)
        : "",
  );
  const parsed = type === "percent" ? percentToBasisPoints(value) : parseRupiah(value);
  const valid = parsed !== null && parsed > 0;

  return (
    <div
      role="group"
      aria-label={t("discountFor", { name: itemName(item) })}
      className="mt-2 flex flex-wrap items-end gap-2 rounded-control bg-surface-muted p-2"
    >
      <label className="sr-only" htmlFor={`${id}-type`}>
        {t("discount")}
      </label>
      <Select
        id={`${id}-type`}
        value={type}
        onChange={(event) => {
          setType(event.target.value === "amount" ? "amount" : "percent");
        }}
        className="w-32"
      >
        <option value="percent">{t("discountPercent")}</option>
        <option value="amount">{t("discountAmount")}</option>
      </Select>
      <label className="sr-only" htmlFor={`${id}-value`}>
        {t("discountValue")}
      </label>
      <Input
        id={`${id}-value`}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        inputMode="decimal"
        maxLength={16}
        className="w-28"
      />
      <Button
        size="sm"
        disabled={!valid}
        onClick={() => {
          if (parsed === null) return;
          onApply(type === "percent" ? { type, bps: parsed } : { type, value: parsed });
          onDone();
        }}
      >
        {t("applyDiscount")}
      </Button>
      {item.discount ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onApply(null);
            onDone();
          }}
        >
          {t("removeDiscount")}
        </Button>
      ) : null}
    </div>
  );
}

/** Cart with quantities, discounts and live totals per PRD §5 (FR-POS-02/04). */
export function CartPanel(props: CartPanelProps) {
  const { items, totals, tax, locale, canDiscount } = props;
  const t = useTranslations("Pos");
  const [editing, setEditing] = useState<string | null>(null);
  const money = (amount: number) => formatCurrency(amount, locale);
  const rate = (bps: number) => `${basisPointsToPercent(bps)}%`;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-10 text-center">
        <p className="font-semibold text-ink">{t("emptyCart")}</p>
        <p className="text-sm text-ink-muted">{t("emptyCartHint")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">{t("cart")}</h2>
        <Button variant="ghost" size="sm" onClick={props.onClear}>
          {t("clear")}
        </Button>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((item, index) => {
          const line = totals.lines[index];
          const name = itemName(item);
          const max = props.maxQty(item.variantId);
          return (
            <li key={item.variantId} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium [overflow-wrap:anywhere] text-ink">{name}</p>
                  <p className="text-xs text-ink-muted tabular-nums">{`${money(item.unitPrice)} × ${String(item.qty)}`}</p>
                  {line && line.discount > 0 ? (
                    <p className="text-xs font-medium text-success-ink">
                      {t("discountApplied", { amount: money(line.discount) })}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{money(line?.total ?? 0)}</p>
              </div>
              <div className="mt-2 flex items-center gap-1">
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label={t("decrease", { name })}
                  onClick={() => {
                    props.onQty(item.variantId, item.qty - 1);
                  }}
                >
                  <Minus aria-hidden="true" />
                </Button>
                <Input
                  aria-label={t("quantityOf", { name })}
                  value={String(item.qty)}
                  inputMode="numeric"
                  onChange={(event) => {
                    const qty = Number(event.target.value.replace(/\D/g, "") || "0");
                    props.onQty(
                      item.variantId,
                      max === null ? Math.min(qty, 9999) : Math.min(qty, max),
                    );
                  }}
                  className="w-16 text-center tabular-nums"
                />
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label={t("increase", { name })}
                  disabled={max !== null && item.qty >= max}
                  onClick={() => {
                    props.onQty(item.variantId, item.qty + 1);
                  }}
                >
                  <Plus aria-hidden="true" />
                </Button>
                <span className="flex-1" />
                {canDiscount ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("discountFor", { name })}
                    aria-expanded={editing === item.variantId}
                    onClick={() => {
                      setEditing(editing === item.variantId ? null : item.variantId);
                    }}
                  >
                    <Tag aria-hidden="true" />
                  </Button>
                ) : null}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("remove", { name })}
                  onClick={() => {
                    props.onRemove(item.variantId);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              {editing === item.variantId ? (
                <DiscountEditor
                  item={item}
                  onApply={(discount) => {
                    props.onDiscount(item.variantId, discount);
                  }}
                  onDone={() => {
                    setEditing(null);
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <VoucherField
        voucher={props.voucher}
        onApplyVoucher={props.onApplyVoucher}
        onRemoveVoucher={props.onRemoveVoucher}
        totals={totals}
        locale={locale}
      />
      <dl className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t("subtotal")}</dt>
          <dd className="tabular-nums">{money(totals.subtotal)}</dd>
        </div>
        {totals.itemDiscountTotal > 0 ? (
          <div className="flex justify-between">
            <dt className="text-ink-muted">{t("itemDiscounts")}</dt>
            <dd className="tabular-nums">{`−${money(totals.itemDiscountTotal)}`}</dd>
          </div>
        ) : null}
        {totals.voucherDiscount > 0 ? (
          <div className="flex justify-between">
            <dt className="text-ink-muted">
              {props.voucher ? voucherLabel(t, props.voucher) : null}
            </dt>
            <dd className="tabular-nums">{`−${money(totals.voucherDiscount)}`}</dd>
          </div>
        ) : null}
        {totals.serviceAmount > 0 ? (
          <div className="flex justify-between">
            <dt className="text-ink-muted">{t("service", { rate: rate(tax.serviceRateBps) })}</dt>
            <dd className="tabular-nums">{money(totals.serviceAmount)}</dd>
          </div>
        ) : null}
        {tax.ppnEnabled ? (
          <div className="flex justify-between">
            <dt className="text-ink-muted">
              {tax.priceIncludesTax
                ? t("ppnIncluded", { rate: rate(tax.ppnRateBps) })
                : t("ppn", { rate: rate(tax.ppnRateBps) })}
            </dt>
            <dd className="tabular-nums">{money(totals.ppnAmount)}</dd>
          </div>
        ) : null}
        <div className="mt-1 flex justify-between text-lg font-semibold text-ink">
          <dt>{t("total")}</dt>
          <dd className="tabular-nums">{money(totals.grandTotal)}</dd>
        </div>
      </dl>
      <Button size="lg" onClick={props.onPay}>
        {t("pay")}
        <kbd className="hidden rounded bg-primary-ink/15 px-1.5 text-xs font-medium lg:inline">
          {t("payShortcut")}
        </kbd>
      </Button>
    </div>
  );
}
