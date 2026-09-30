"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";

import { useGlobalPending } from "@/components/feedback/loading-indicator";
import { useShowResult } from "@/components/feedback/result-provider";
import { Button } from "@/components/ui/button";
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
  emptySourceBank,
  SourceBankField,
  type SourceBankDraft,
  sourceBankOf,
} from "@/features/checkout/components/source-bank-field";
import { useRouter } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/format/currency";
import { parseRupiah } from "@/lib/format/rupiah-input";
import { calculateSale, type TaxRules } from "@/lib/money/calculate";
import { cn } from "@/lib/utils/cn";

import { settleGoodsAction } from "../actions";

type Method = "CASH" | "TRANSFER" | "QRIS" | "SPLIT" | "KASBON";

export interface OutstandingItem {
  variantId: string;
  label: string;
  price: number;
  outstanding: number;
}

interface SettleFormProps {
  locale: Locale;
  consignmentId: string;
  /** Sales record what they sold; the shop floor records what came back (ADR-0024). */
  mode: "sell" | "return";
  items: readonly OutstandingItem[];
  tax: TaxRules;
  bankAccounts: readonly { id: string; label: string }[];
  /** The store's QRIS account; null hides QRIS (FR-PAY-07). */
  qrisAccount: { label: string } | null;
  canKasbon: boolean;
  /** Store-local date, the earliest due date. */
  today: string;
}

const toQty = (text: string) => {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

/**
 * Settlement form (FR-CSG-03/04). In `sell` mode the salesperson enters
 * how many of each item were sold, the buyer (FR-POS-11) and how it is
 * paid, also part cash with the rest by transfer or QRIS (ADR-0033); the
 * total is a preview and the server prices the sale. In `return`
 * mode the shop floor enters how many came back.
 */
export function SettleForm(props: SettleFormProps) {
  const { locale, items, mode } = props;
  const field = mode === "sell" ? "sold" : "returned";
  const t = useTranslations("Consignments");
  const tPos = useTranslations("Pos");
  const id = useId();
  const router = useRouter();
  const showResult = useShowResult();
  const [quantities, setQuantities] = useState<Record<string, { sold: string; returned: string }>>(
    {},
  );
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
  const lines = items.map((item) => {
    const entry = quantities[item.variantId];
    return {
      item,
      sold: toQty(entry?.sold ?? ""),
      returned: toQty(entry?.returned ?? ""),
    };
  });
  const soldLines = lines.filter((line) => line.sold > 0);
  const total = calculateSale(
    soldLines.map((line) => ({ unitPrice: line.item.price, qty: line.sold, discount: null })),
    props.tax,
  ).grandTotal;
  const hasSale = soldLines.length > 0;
  const cash = parseRupiah(cashPart) ?? 0;
  const splitError = method === "SPLIT" && (cash <= 0 || cash >= total);
  const paysQris = method === "QRIS" || (method === "SPLIT" && restMethod === "QRIS");
  const customerErrors = customerDraftErrors(customer, hasSale && method === "KASBON");
  const set = (variantId: string, field: "sold" | "returned", value: string) => {
    setQuantities((current) => ({
      ...current,
      [variantId]: {
        sold: current[variantId]?.sold ?? "",
        returned: current[variantId]?.returned ?? "",
        [field]: value.replace(/\D/g, "").slice(0, 4),
      },
    }));
  };

  const methods: readonly { value: Method; label: string }[] = [
    { value: "CASH", label: t("methodCash") },
    { value: "TRANSFER", label: t("methodTransfer") },
    ...(props.qrisAccount ? [{ value: "QRIS" as const, label: t("methodQris") }] : []),
    { value: "SPLIT", label: props.qrisAccount ? t("methodSplit") : t("methodSplitTransfer") },
    ...(props.canKasbon ? [{ value: "KASBON" as const, label: t("methodKasbon") }] : []),
  ];

  const submit = () => {
    if (pending) return;
    const entered = lines.filter((line) => line[field] > 0);
    if (entered.length === 0) {
      setError(t(mode === "sell" ? "nothingSold" : "nothingReturned"));
      return;
    }
    const over = entered.find((line) => line[field] > line.item.outstanding);
    if (over) {
      setError(
        t(mode === "sell" ? "tooManySold" : "tooManyReturned", {
          name: over.item.label,
          count: over.item.outstanding,
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
        const result = await settleGoodsAction(locale, props.consignmentId, {
          idempotencyKey: idempotencyKey.current,
          lines: entered.map((line) => ({
            variantId: line.item.variantId,
            sold: mode === "sell" ? line.sold : 0,
            returned: mode === "return" ? line.returned : 0,
          })),
          customer: hasSale ? { name: customer.name, phone: customer.phone } : null,
          payment: hasSale ? payment : { method: "CASH" },
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
      <ul className="flex flex-col divide-y divide-border">
        {lines.map(({ item }) => (
          <li key={item.variantId} className="grid gap-2 py-3 sm:grid-cols-[1fr_6rem]">
            <span className="text-sm [overflow-wrap:anywhere] text-ink">
              {item.label}
              <span className="block text-xs text-ink-muted tabular-nums">
                {mode === "sell"
                  ? `${money(item.price)} · ${t("outstandingOf", { count: item.outstanding })}`
                  : t("outstandingOf", { count: item.outstanding })}
              </span>
            </span>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${id}-${item.variantId}-${field}`}
                className="text-xs font-medium text-ink-muted"
              >
                <span aria-hidden="true">{t(field)}</span>
                <span className="sr-only">
                  {t(mode === "sell" ? "soldOf" : "returnedOf", { name: item.label })}
                </span>
              </label>
              <Input
                id={`${id}-${item.variantId}-${field}`}
                inputMode="numeric"
                value={quantities[item.variantId]?.[field] ?? ""}
                onChange={(event) => {
                  set(item.variantId, field, event.target.value);
                }}
                placeholder="0"
                className="text-center tabular-nums"
              />
            </div>
          </li>
        ))}
      </ul>

      {hasSale ? (
        <>
          <div className="rounded-card bg-surface-muted p-4">
            <p className="text-sm text-ink-muted">{t("saleTotal")}</p>
            <p className="text-2xl font-semibold text-ink tabular-nums">{money(total)}</p>
          </div>
          <CustomerFields
            locale={locale}
            draft={customer}
            onChange={setCustomer}
            phoneRequired={method === "KASBON"}
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
        {t(mode === "sell" ? "saveSold" : "saveReturned")}
      </Button>
    </form>
  );
}
