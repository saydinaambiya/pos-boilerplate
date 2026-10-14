"use client";

import { Tag, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";

import { useGlobalPending } from "@/components/feedback/loading-indicator";
import { useShowResult } from "@/components/feedback/result-provider";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { toneClasses } from "@/components/ui/tone";
import type { Locale } from "@/config/locales";
import {
  CustomerFields,
  customerDraftErrors,
  emptyCustomerDraft,
  type CustomerDraft,
} from "@/features/checkout/components/customer-fields";
import {
  type AppliedVoucher,
  DiscountEditor,
  SaleTotalsList,
  VoucherField,
} from "@/features/checkout/components/cart-panel";
import {
  emptySourceBank,
  SourceBankField,
  type SourceBankDraft,
  sourceBankOf,
} from "@/features/checkout/components/source-bank-field";
import { useRouter } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/format/currency";
import { formatMeters, parseMetersToCm } from "@/lib/format/length";
import { parseRupiah } from "@/lib/format/rupiah-input";
import { calculateSale, type ItemDiscount, type TaxRules } from "@/lib/money/calculate";
import { cutPrice } from "@/lib/money/cut";
import { cn } from "@/lib/utils/cn";

import { checkVoucherAction } from "@/features/checkout/actions";

import { reduceGoodsAction, settleGoodsAction } from "../actions";

type Method = "CASH" | "TRANSFER" | "QRIS" | "SPLIT" | "KASBON";

export interface OutstandingItem {
  variantId: string;
  label: string;
  /** Per piece, or on a roll per meter (FR-CSG-09). */
  price: number;
  /** Pieces, or on a roll centimetres. */
  outstanding: number;
  isRoll: boolean;
}

interface SettleFormProps {
  locale: Locale;
  consignmentId: string;
  /**
   * Sales record what they sold, the shop floor what came back (ADR-0024),
   * and pickup staff take off goods entered by mistake (FR-CSG-07).
   */
  mode: "sell" | "return" | "reduce";
  items: readonly OutstandingItem[];
  tax: TaxRules;
  bankAccounts: readonly { id: string; label: string }[];
  /** The store's QRIS account; null hides QRIS (FR-PAY-07). */
  qrisAccount: { label: string } | null;
  canKasbon: boolean;
  /** Line discounts need `pos:item-discount`, as at the cashier (FR-POS-02). */
  canDiscount: boolean;
  /** Store-local date, the earliest due date. */
  today: string;
}

/** Typed amount in stored units: whole pieces, or a roll's meters as cm; 0 when invalid. */
const toQty = (item: OutstandingItem, text: string) => {
  if (item.isRoll) return parseMetersToCm(text) ?? 0;
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const messagesOf = {
  sell: {
    label: "sold",
    nothing: "nothingSold",
    tooMany: "tooManySold",
    itemOf: "soldOf",
    save: "saveSold",
  },
  return: {
    label: "returned",
    nothing: "nothingReturned",
    tooMany: "tooManyReturned",
    itemOf: "returnedOf",
    save: "saveReturned",
  },
  reduce: {
    label: "reducedField",
    nothing: "nothingReduced",
    tooMany: "tooManyReduced",
    itemOf: "reducedOf",
    save: "saveReduced",
  },
} as const;

/**
 * Settlement form (FR-CSG-03/04/07/09), laid out for phones: the user
 * searches the goods still out, picks one and then enters its amount, in
 * meters for a roll. In `sell` mode the salesperson also enters the buyer
 * (FR-POS-11) and how it is paid, also part cash with the rest by transfer
 * or QRIS (ADR-0033). Line discounts and one voucher work as at the cashier
 * (FR-CSG-04, FR-POS-02/03); the total is a preview and the server prices the
 * sale, a roll per meter like a custom cut at the POS. In `return` mode the
 * shop floor enters how many came back, and in `reduce` mode pickup staff
 * enter how many were recorded by mistake.
 */
export function SettleForm(props: SettleFormProps) {
  const { locale, items, mode } = props;
  const messages = messagesOf[mode];
  const t = useTranslations("Consignments");
  const tPos = useTranslations("Pos");
  const id = useId();
  const router = useRouter();
  const showResult = useShowResult();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [discounts, setDiscounts] = useState<Record<string, ItemDiscount | null>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  const [customer, setCustomer] = useState<CustomerDraft>(emptyCustomerDraft);
  const [method, setMethod] = useState<Method>("CASH");
  const [bankAccountId, setBankAccountId] = useState(props.bankAccounts[0]?.id ?? "");
  const [source, setSource] = useState<SourceBankDraft>(emptySourceBank);
  const [cashPart, setCashPart] = useState("");
  const [restMethod, setRestMethod] = useState<"TRANSFER" | "QRIS">("TRANSFER");
  const [kasbonNote, setKasbonNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  useGlobalPending(pending);

  const money = (amount: number) => formatCurrency(amount, locale);
  const lines = picked.flatMap((variantId) => {
    const item = items.find((entry) => entry.variantId === variantId);
    return item ? [{ item, qty: toQty(item, quantities[variantId] ?? "") }] : [];
  });
  const soldLines = mode === "sell" ? lines.filter((line) => line.qty > 0) : [];
  const discountOf = (variantId: string) =>
    props.canDiscount ? (discounts[variantId] ?? null) : null;
  const totals = calculateSale(
    soldLines.map((line) =>
      line.item.isRoll
        ? {
            unitPrice: cutPrice(line.item.price, line.qty),
            qty: 1,
            discount: discountOf(line.item.variantId),
          }
        : { unitPrice: line.item.price, qty: line.qty, discount: discountOf(line.item.variantId) },
    ),
    props.tax,
    voucher?.rule,
  );
  const total = totals.grandTotal;
  const lineDiscounts = new Map(
    soldLines.map((line, index) => [line.item.variantId, totals.lines[index]?.discount ?? 0]),
  );
  const hasSale = soldLines.length > 0;
  const cash = parseRupiah(cashPart) ?? 0;
  const splitError = method === "SPLIT" && (cash <= 0 || cash >= total);
  const paysQris = method === "QRIS" || (method === "SPLIT" && restMethod === "QRIS");
  const customerErrors = customerDraftErrors(customer);
  const amount = (item: OutstandingItem, qty: number) =>
    item.isRoll ? formatMeters(qty, locale) : String(qty);
  const qtyId = (variantId: string) => `${id}-${variantId}-qty`;
  const set = (item: OutstandingItem, value: string) => {
    setQuantities((current) => ({
      ...current,
      [item.variantId]: item.isRoll
        ? value.replace(/[^\d.,]/g, "").slice(0, 9)
        : value.replace(/\D/g, "").slice(0, 6),
    }));
  };
  const options = items
    .filter((item) => !picked.includes(item.variantId))
    .map((item) => ({ value: item.variantId, label: item.label }));

  const methods: readonly { value: Method; label: string }[] = [
    { value: "CASH", label: t("methodCash") },
    { value: "TRANSFER", label: t("methodTransfer") },
    ...(props.qrisAccount ? [{ value: "QRIS" as const, label: t("methodQris") }] : []),
    { value: "SPLIT", label: props.qrisAccount ? t("methodSplit") : t("methodSplitTransfer") },
    ...(props.canKasbon ? [{ value: "KASBON" as const, label: t("methodKasbon") }] : []),
  ];

  const submit = () => {
    if (pending) return;
    if (lines.length === 0) {
      setError(t(messages.nothing));
      return;
    }
    const missing = lines.find((line) => line.qty === 0);
    if (missing) {
      setError(t("missingQty", { name: missing.item.label }));
      return;
    }
    const over = lines.find((line) => line.qty > line.item.outstanding);
    if (over) {
      setError(
        t(messages.tooMany, {
          name: over.item.label,
          count: amount(over.item, over.item.outstanding),
        }),
      );
      return;
    }
    if (
      hasSale &&
      (Object.values(customerErrors).some(Boolean) ||
        splitError ||
        (paysQris && sourceBankOf(source) === ""))
    ) {
      setShowErrors(true);
      setError(null);
      return;
    }
    setError(null);
    const payment =
      method === "SPLIT"
        ? {
            method,
            cash,
            rest:
              restMethod === "QRIS"
                ? { method: restMethod, sourceBank: sourceBankOf(source) }
                : { method: restMethod, bankAccountId },
          }
        : method === "TRANSFER"
          ? { method, bankAccountId }
          : method === "QRIS"
            ? { method, sourceBank: sourceBankOf(source) }
            : method === "KASBON"
              ? { method, note: kasbonNote, dueDate: dueDate === "" ? null : dueDate }
              : { method };
    startTransition(async () => {
      try {
        const result =
          mode === "reduce"
            ? await reduceGoodsAction(locale, props.consignmentId, {
                idempotencyKey: idempotencyKey.current,
                lines: lines.map((line) => ({ variantId: line.item.variantId, qty: line.qty })),
                note,
              })
            : await settleGoodsAction(locale, props.consignmentId, {
                idempotencyKey: idempotencyKey.current,
                lines: lines.map((line) => {
                  const discount = mode === "sell" ? discountOf(line.item.variantId) : null;
                  return {
                    variantId: line.item.variantId,
                    sold: mode === "sell" ? line.qty : 0,
                    returned: mode === "return" ? line.qty : 0,
                    ...(discount ? { discount } : {}),
                  };
                }),
                customer: hasSale ? { name: customer.name, phone: customer.phone } : null,
                payment: hasSale ? payment : { method: "CASH" },
                ...(hasSale && voucher ? { voucherCode: voucher.code } : {}),
                note,
              });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        showResult?.({ status: "success", message: result.message });
        router.replace(`/consignments/${props.consignmentId}`, { scroll: false });
        router.refresh();
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-pick`} className="text-sm font-medium text-ink">
          {t("pickItem")}
        </label>
        <Combobox
          id={`${id}-pick`}
          value=""
          onValueChange={(variantId) => {
            setPicked((current) =>
              current.includes(variantId) ? current : [...current, variantId],
            );
            setError(null);
          }}
          focusAfterPick={(variantId) => document.getElementById(qtyId(variantId))}
          options={options}
          placeholder={t("pickItemPlaceholder")}
          searchPlaceholder={t("searchChoice")}
          emptyText={t("noMatch")}
          aria-describedby={`${id}-pick-hint`}
        />
        <p id={`${id}-pick-hint`} className="text-xs text-ink-muted">
          {t("pickItemHint", { count: items.length })}
        </p>
      </div>

      {lines.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {lines.map(({ item }) => (
            <li key={item.variantId} className="flex flex-col py-3">
              <div className="flex items-end gap-3">
                <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere] text-ink">
                  {item.label}
                  <span className="block text-xs text-ink-muted tabular-nums">
                    {[
                      mode === "sell"
                        ? item.isRoll
                          ? t("perMeter", { price: money(item.price) })
                          : money(item.price)
                        : null,
                      t("outstandingOf", { count: amount(item, item.outstanding) }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {(lineDiscounts.get(item.variantId) ?? 0) > 0 ? (
                    <span className="block text-xs font-medium text-success-ink">
                      {tPos("discountApplied", {
                        amount: money(lineDiscounts.get(item.variantId) ?? 0),
                      })}
                    </span>
                  ) : null}
                </span>
                <div className="flex w-24 shrink-0 flex-col gap-1">
                  <label
                    htmlFor={qtyId(item.variantId)}
                    className="text-xs font-medium text-ink-muted"
                  >
                    <span aria-hidden="true">
                      {item.isRoll
                        ? t("inMeters", { label: t(messages.label) })
                        : t(messages.label)}
                    </span>
                    <span className="sr-only">{t(messages.itemOf, { name: item.label })}</span>
                  </label>
                  <Input
                    id={qtyId(item.variantId)}
                    inputMode={item.isRoll ? "decimal" : "numeric"}
                    value={quantities[item.variantId] ?? ""}
                    onChange={(event) => {
                      set(item, event.target.value);
                    }}
                    placeholder={item.isRoll ? "0,0" : "0"}
                    className="text-center tabular-nums"
                  />
                </div>
                {mode === "sell" && props.canDiscount ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={tPos("discountFor", { name: item.label })}
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
                  aria-label={t("removeItem", { name: item.label })}
                  onClick={() => {
                    setPicked((current) => current.filter((entry) => entry !== item.variantId));
                    setDiscounts((current) => ({ ...current, [item.variantId]: null }));
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              {mode === "sell" && editing === item.variantId ? (
                <DiscountEditor
                  name={item.label}
                  discount={discountOf(item.variantId)}
                  onApply={(discount) => {
                    setDiscounts((current) => ({ ...current, [item.variantId]: discount }));
                  }}
                  onDone={() => {
                    setEditing(null);
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">{t("nothingPicked")}</p>
      )}

      {hasSale ? (
        <>
          <VoucherField
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
            subtotal={totals.subtotal}
            locale={locale}
          />
          <SaleTotalsList totals={totals} tax={props.tax} voucher={voucher} locale={locale} />
          <CustomerFields
            locale={locale}
            draft={customer}
            onChange={setCustomer}
            showErrors={showErrors}
            errors={customerErrors}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-ink">{t("payment")}</legend>
            <div
              className={cn(
                "grid gap-1 rounded-card bg-surface-muted p-1",
                methods.length === 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3",
              )}
            >
              {methods.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-center rounded-full px-2 text-center text-sm font-medium text-ink-muted",
                    method === option.value && "bg-surface text-ink shadow-sm",
                  )}
                >
                  <input
                    type="radio"
                    name="method"
                    value={option.value}
                    checked={method === option.value}
                    onChange={() => {
                      setMethod(option.value);
                    }}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          {method === "SPLIT" ? (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-cash`} className="text-sm font-medium text-ink">
                    {t("splitCash")}
                  </label>
                  <MoneyInput
                    id={`${id}-cash`}
                    value={cashPart}
                    onValueChange={setCashPart}
                    aria-invalid={showErrors && splitError}
                    aria-describedby={`${id}-cash-hint`}
                  />
                  <p
                    id={`${id}-cash-hint`}
                    className={cn(
                      "text-xs",
                      showErrors && splitError ? "text-danger-ink" : "text-ink-muted",
                    )}
                  >
                    {showErrors && splitError
                      ? t("errors.splitInvalid")
                      : t("splitRest", { amount: money(Math.max(total - cash, 0)) })}
                  </p>
                </div>
                {props.qrisAccount ? (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`${id}-rest`} className="text-sm font-medium text-ink">
                      {t("splitRestMethod")}
                    </label>
                    <Select
                      id={`${id}-rest`}
                      value={restMethod}
                      onValueChange={(value) => {
                        setRestMethod(value === "QRIS" ? "QRIS" : "TRANSFER");
                      }}
                      options={[
                        { value: "TRANSFER", label: t("methodTransfer") },
                        { value: "QRIS", label: t("methodQris") },
                      ]}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {method === "TRANSFER" || (method === "SPLIT" && restMethod === "TRANSFER") ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-bank`} className="text-sm font-medium text-ink">
                  {t("methodTransfer")}
                </label>
                <Select
                  id={`${id}-bank`}
                  value={bankAccountId}
                  onValueChange={setBankAccountId}
                  options={props.bankAccounts.map((account) => ({
                    value: account.id,
                    label: account.label,
                  }))}
                />
              </div>
            </div>
          ) : null}
          {paysQris && props.qrisAccount ? (
            <div className="flex flex-col gap-3">
              <p className="rounded-control bg-surface-muted px-3 py-2 text-sm text-ink">
                {tPos("qrisAccount", { account: props.qrisAccount.label })}
              </p>
              <SourceBankField draft={source} onChange={setSource} showError={showErrors} />
            </div>
          ) : null}
          {method === "KASBON" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-kasbon-note`} className="text-sm font-medium text-ink">
                  {t("note")}
                </label>
                <Input
                  id={`${id}-kasbon-note`}
                  value={kasbonNote}
                  onChange={(event) => {
                    setKasbonNote(event.target.value);
                  }}
                  maxLength={200}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-due`} className="text-sm font-medium text-ink">
                  {t("dueDate")}
                </label>
                <DatePicker
                  id={`${id}-due`}
                  min={props.today}
                  value={dueDate}
                  onValueChange={setDueDate}
                  clearable
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}

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
        {t(messages.save)}
      </Button>
    </form>
  );
}
