"use client";

import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/config/locales";
import type { PosProduct, PosVariant } from "@/features/catalog/pos-types";
import { Link } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/format/currency";
import { calculateSale, type TaxRules, type VoucherRule } from "@/lib/money/calculate";
import { cn } from "@/lib/utils/cn";

import { checkVoucherAction, searchPosCatalogAction } from "../actions";
import { CartPanel } from "./cart-panel";
import { PaymentDialog } from "./payment-dialog";
import { useCart } from "./use-cart";
import { VariantPicker } from "./variant-picker";

interface PosTerminalProps {
  locale: Locale;
  storageKey: string;
  catalog: PosProduct[];
  /** The preload was capped; search runs on the server (NFR-PERF-07). */
  truncated: boolean;
  categories: readonly { id: string; name: string }[];
  tax: TaxRules;
  allowNegativeStock: boolean;
  canDiscount: boolean;
  bankAccounts: readonly { id: string; label: string }[];
}

interface Completed {
  saleId: string;
  invoiceNo: string;
  change: number | null;
  tendered: number | null;
}

function matches(product: PosProduct, term: string) {
  const needle = term.toLowerCase();
  return (
    product.name.toLowerCase().includes(needle) ||
    product.variants.some(
      (variant) =>
        variant.sku.toLowerCase().includes(needle) ||
        (variant.colorName?.toLowerCase().includes(needle) ?? false),
    )
  );
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
  );
}

/**
 * The POS screen (FR-POS-01..05, FR-POS-10): product grid with search and
 * category filter, colour picker, cart and payment. The preview uses the
 * same `calculateSale` as the server, which recomputes on checkout.
 */
export function PosTerminal(props: PosTerminalProps) {
  const { locale, tax, allowNegativeStock } = props;
  const t = useTranslations("Pos");
  const cart = useCart(props.storageKey);
  const searchRef = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [remote, setRemote] = useState<PosProduct[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [picking, setPicking] = useState<PosProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [voucher, setVoucher] = useState<{ code: string; name: string; rule: VoucherRule } | null>(
    null,
  );

  const variantIndex = useMemo(() => {
    const index = new Map<string, { product: PosProduct; variant: PosVariant }>();
    for (const product of [...props.catalog, ...(remote ?? [])]) {
      for (const variant of product.variants) index.set(variant.id, { product, variant });
    }
    return index;
  }, [props.catalog, remote]);

  const items = useMemo(
    () =>
      cart.items.map((item) => {
        const known = variantIndex.get(item.variantId);
        return known ? { ...item, unitPrice: known.variant.price } : item;
      }),
    [cart.items, variantIndex],
  );
  const totals = useMemo(
    () =>
      calculateSale(
        items.map((item) => ({
          unitPrice: item.unitPrice,
          qty: item.qty,
          discount: item.discount,
        })),
        tax,
        voucher?.rule,
      ),
    [items, tax, voucher],
  );
  const itemCount = items.reduce((sum, item) => sum + item.qty, 0);

  useEffect(() => {
    if (!props.truncated) return;
    const search = term.trim();
    const timer = setTimeout(() => {
      startSearch(async () => {
        setRemote(search === "" ? null : await searchPosCatalogAction(locale, search));
      });
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [term, props.truncated, locale]);

  const visible = useMemo(() => {
    const source = props.truncated && remote ? remote : props.catalog;
    return source.filter(
      (product) =>
        (category === null || product.categoryId === category) &&
        (props.truncated || term.trim() === "" || matches(product, term.trim())),
    );
  }, [props.catalog, props.truncated, remote, category, term]);

  const maxQty = useCallback(
    (variantId: string) => {
      const known = variantIndex.get(variantId);
      if (!known?.product.trackStock || allowNegativeStock) return null;
      return Math.max(known.variant.stockQty, 0);
    },
    [variantIndex, allowNegativeStock],
  );

  const isSelectable = useCallback(
    (product: PosProduct, variant: PosVariant) =>
      !product.trackStock || allowNegativeStock || variant.stockQty > 0,
    [allowNegativeStock],
  );

  const addVariant = useCallback(
    (product: PosProduct, variant: PosVariant) => {
      cart.add(
        {
          variantId: variant.id,
          name: product.name,
          colorName: variant.colorName,
          unitPrice: variant.price,
        },
        maxQty(variant.id),
      );
      setPicking(null);
    },
    [cart, maxQty],
  );

  const pick = (product: PosProduct) => {
    const [only] = product.variants;
    if (!product.hasVariants && only) addVariant(product, only);
    else setPicking(product);
  };

  const openPayment = useCallback(() => {
    if (items.length === 0) return;
    setCartOpen(false);
    setPaying(true);
  }, [items.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && !isTyping(event.target)) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "F2") {
        event.preventDefault();
        openPayment();
      } else if (
        event.key === "Escape" &&
        !isTyping(event.target) &&
        items.length > 0 &&
        !paying &&
        picking === null
      ) {
        setConfirmClear(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [openPayment, items.length, paying, picking]);

  const money = (amount: number) => formatCurrency(amount, locale);
  const panel = (
    <CartPanel
      items={items}
      totals={totals}
      tax={tax}
      locale={locale}
      canDiscount={props.canDiscount}
      maxQty={maxQty}
      onQty={cart.setQty}
      onRemove={cart.remove}
      onDiscount={cart.setDiscount}
      onClear={() => {
        setConfirmClear(true);
      }}
      onPay={openPayment}
      voucher={voucher}
      onApplyVoucher={async (code) => {
        const result = await checkVoucherAction(locale, code);
        if (!result.ok) return result.message;
        setVoucher({ code: result.code, name: result.name, rule: result.rule });
        return null;
      }}
      onRemoveVoucher={() => {
        setVoucher(null);
      }}
    />
  );

  return (
    <>
      <div className="grid gap-6 pb-20 lg:grid-cols-[minmax(0,1fr)_24rem] lg:pb-0">
        <section aria-label={t("search")} className="flex min-w-0 flex-col gap-4">
          <Input
            ref={searchRef}
            type="search"
            aria-label={t("search")}
            placeholder={t("searchPlaceholder")}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
            }}
            maxLength={60}
          />
          <div
            role="group"
            aria-label={t("categoriesLabel")}
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {[{ id: null, name: t("allCategories") }, ...props.categories].map((entry) => (
              <button
                key={entry.id ?? "all"}
                type="button"
                aria-pressed={category === entry.id}
                onClick={() => {
                  setCategory(entry.id);
                }}
                className={cn(
                  "min-h-11 shrink-0 rounded-full border border-border px-4 text-sm font-medium whitespace-nowrap text-ink-muted",
                  category === entry.id && "border-primary bg-primary text-primary-ink",
                )}
              >
                {entry.name}
              </button>
            ))}
          </div>
          {searching ? <p className="text-sm text-ink-muted">{t("searching")}</p> : null}
          {props.truncated && remote === null && term.trim() === "" ? (
            <p className="text-sm text-ink-muted">{t("searchHint")}</p>
          ) : null}
          {visible.length === 0 && (!props.truncated || remote !== null) ? (
            <p className="py-10 text-center text-sm text-ink-muted">{t("noProducts")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visible.map((product) => {
                const prices = product.variants.map((variant) => variant.price);
                const low = Math.min(...prices);
                const high = Math.max(...prices);
                const selectable = product.variants.some((variant) =>
                  isSelectable(product, variant),
                );
                const stock = product.variants.reduce((sum, variant) => sum + variant.stockQty, 0);
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      disabled={!selectable}
                      onClick={() => {
                        pick(product);
                      }}
                      className="flex h-full min-h-24 w-full flex-col gap-1 rounded-card bg-surface p-3 text-left shadow-card hover:ring-2 hover:ring-primary focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="line-clamp-2 font-medium [overflow-wrap:anywhere] text-ink">
                        {product.name}
                      </span>
                      <span className="text-sm font-semibold tabular-nums">
                        {low === high ? money(low) : `${money(low)} – ${money(high)}`}
                      </span>
                      <span className="mt-auto text-xs text-ink-muted">
                        {product.hasVariants
                          ? t("colorCount", { count: product.variants.length })
                          : product.trackStock
                            ? stock > 0
                              ? t("stockLeft", { count: stock })
                              : t("outOfStock")
                            : product.unit}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <aside aria-label={t("cart")} className="hidden lg:block">
          <Card className="sticky top-6">{panel}</Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface p-3 md:bottom-0 lg:hidden">
        <Button
          size="lg"
          className="w-full"
          onClick={() => {
            setCartOpen(true);
          }}
        >
          <ShoppingBag aria-hidden="true" />
          {t("openCart", { count: itemCount, total: money(totals.grandTotal) })}
        </Button>
      </div>
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent side="bottom" closeLabel={t("close")}>
          <DialogTitle className="sr-only">{t("cart")}</DialogTitle>
          <DialogDescription className="sr-only">{t("emptyCartHint")}</DialogDescription>
          {panel}
        </DialogContent>
      </Dialog>

      <VariantPicker
        product={picking}
        locale={locale}
        isSelectable={isSelectable}
        onPick={addVariant}
        onClose={() => {
          setPicking(null);
        }}
      />

      <PaymentDialog
        open={paying}
        onOpenChange={setPaying}
        locale={locale}
        grandTotal={totals.grandTotal}
        lines={() =>
          items.map((item) => ({
            variantId: item.variantId,
            qty: item.qty,
            discount: item.discount,
          }))
        }
        bankAccounts={props.bankAccounts}
        voucherCode={voucher?.code ?? null}
        onSuccess={(result) => {
          cart.clear();
          setVoucher(null);
          setPaying(false);
          setCompleted(result);
        }}
      />

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent closeLabel={t("close")}>
          <DialogTitle>{t("clearTitle")}</DialogTitle>
          <DialogDescription>{t("clearDescription")}</DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{t("cancel")}</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                cart.clear();
                setVoucher(null);
                setConfirmClear(false);
              }}
            >
              {t("clear")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={completed !== null}
        onOpenChange={(open) => {
          if (!open) setCompleted(null);
        }}
      >
        <DialogContent closeLabel={t("close")}>
          <DialogTitle>{t("successTitle")}</DialogTitle>
          <DialogDescription>
            {completed ? t("successInvoice", { invoiceNo: completed.invoiceNo }) : null}
          </DialogDescription>
          {completed?.change != null ? (
            <p className="text-2xl font-semibold text-ink tabular-nums">{`${t("change")}: ${money(completed.change)}`}</p>
          ) : null}
          <DialogFooter>
            {completed ? (
              <>
                <Button asChild variant="ghost">
                  <Link href={`/pos/sales/${completed.saleId}`}>{t("viewReceipt")}</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link
                    href={{
                      pathname: `/print/invoices/${completed.saleId}`,
                      query: {
                        print: "1",
                        ...(completed.tendered === null
                          ? {}
                          : { tendered: String(completed.tendered) }),
                      },
                    }}
                  >
                    {t("printReceipt")}
                  </Link>
                </Button>
              </>
            ) : null}
            <Button
              onClick={() => {
                setCompleted(null);
                searchRef.current?.focus();
              }}
            >
              {t("newSale")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
