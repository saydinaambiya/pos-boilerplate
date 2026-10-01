"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { useGlobalPending } from "@/components/feedback/loading-indicator";
import type { ActionLink } from "@/components/feedback/result-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { toneClasses } from "@/components/ui/tone";
import type { Locale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/format/currency";
import { parseRupiah } from "@/lib/format/rupiah-input";
import type { ItemDiscount } from "@/lib/money/calculate";
import { cn } from "@/lib/utils/cn";

import { checkoutAction } from "../actions";
import {
  CustomerFields,
  customerDraftErrors,
  emptyCustomerDraft,
  type CustomerDraft,
} from "./customer-fields";
import {
  emptySourceBank,
  SourceBankField,
  type SourceBankDraft,
  sourceBankOf,
} from "./source-bank-field";
import {
  emptyKasbonDraft,
  KasbonFields,
  kasbonDraftErrors,
  type KasbonDraft,
} from "./kasbon-fields";

type Mode = "cash" | "transfer" | "qris" | "split" | "kasbon";

/** How the non-cash part of a split is paid. */
type NonCash = "TRANSFER" | "QRIS";

export interface CheckoutLinePayload {
  variantId: string;
  qty: number;
  /** Custom cut length in cm (FR-ROL-04). */
  lengthCm?: number;
  discount: ItemDiscount | null;
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  grandTotal: number;
  lines: () => CheckoutLinePayload[];
  voucherCode: string | null;
  bankAccounts: readonly { id: string; label: string }[];
  /** The store's QRIS account, filled in automatically; null hides QRIS (FR-PAY-07). */
  qrisAccount: { label: string } | null;
  /** The cashier may put a remainder on store credit (FR-PAY-05). */
  canKasbon: boolean;
  /** Store-local date, the earliest due date. */
  today: string;
  onSuccess: (result: {
    saleId: string;
    invoiceNo: string;
    change: number | null;
    tendered: number | null;
    kasbonTotal: number;
  }) => void;
}

const QUICK_CASH = [50_000, 100_000] as const;

/**
 * Buyer (FR-POS-11) and cash, transfer, QRIS, split or store-credit payment
 * (FR-PAY-01..05, FR-PAY-07). QRIS goes to the store's QRIS account and asks
 * which bank or e-wallet the buyer paid from. Cash tendered and change
 * are only shown here; the server receives the amount allocated to the bill
 * (BR-22). The idempotency key is minted when the dialog opens and reused on
 * retry, so a double submit or a lost response never creates two sales
 * (FR-POS-08).
 */
export function PaymentDialog(props: PaymentDialogProps) {
  const { open, grandTotal, locale, bankAccounts } = props;
  const t = useTranslations("Pos");
  const id = useId();
  const [mode, setMode] = useState<Mode>("cash");
  const [cashText, setCashText] = useState("");
  const [transferText, setTransferText] = useState("");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [nonCash, setNonCash] = useState<NonCash>("TRANSFER");
  const [source, setSource] = useState<SourceBankDraft>(emptySourceBank);
  const [customer, setCustomer] = useState<CustomerDraft>(emptyCustomerDraft);
  const [kasbon, setKasbon] = useState<KasbonDraft>(emptyKasbonDraft);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<ActionLink | null>(null);
  const [pending, startTransition] = useTransition();
  useGlobalPending(pending);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    if (open) idempotencyKey.current = crypto.randomUUID();
  }, [open]);

  const money = (amount: number) => formatCurrency(amount, locale);
  const transfer =
    mode === "transfer" || mode === "qris"
      ? grandTotal
      : mode === "split"
        ? Math.min(parseRupiah(transferText) ?? 0, grandTotal)
        : 0;
  const nonCashMethod: NonCash = mode === "qris" ? "QRIS" : mode === "split" ? nonCash : "TRANSFER";
  const cashDue = grandTotal - transfer;
  const received = parseRupiah(cashText);
  const change = cashDue > 0 && received !== null ? received - cashDue : null;
  const needsBank = transfer > 0 && nonCashMethod === "TRANSFER";
  const needsQris = transfer > 0 && nonCashMethod === "QRIS";
  const sourceBank = sourceBankOf(source);
  const downPayment = kasbon.downPayment.trim() === "" ? 0 : parseRupiah(kasbon.downPayment);
  const kasbonErrors = kasbonDraftErrors(downPayment, grandTotal);
  const customerErrors = customerDraftErrors(customer, mode === "kasbon");
  const valid =
    mode === "kasbon"
      ? true
      : (!needsBank || bankAccountId !== "") &&
        (!needsQris || props.qrisAccount !== null) &&
        (cashDue === 0 || (received !== null && received >= cashDue));

  const submit = () => {
    if (!valid || pending) return;
    if (
      Object.values(customerErrors).some(Boolean) ||
      (mode === "kasbon" && Object.values(kasbonErrors).some(Boolean)) ||
      (needsQris && sourceBank === "")
    ) {
      setShowErrors(true);
      return;
    }
    setError(null);
    setErrorAction(null);
    const payments =
      mode === "kasbon"
        ? downPayment
          ? [{ method: "CASH" as const, amount: downPayment }]
          : []
        : [
            ...(needsBank
              ? [{ method: "TRANSFER" as const, amount: transfer, bankAccountId }]
              : []),
            ...(needsQris ? [{ method: "QRIS" as const, amount: transfer, sourceBank }] : []),
            ...(cashDue > 0 ? [{ method: "CASH" as const, amount: cashDue }] : []),
          ];
    startTransition(async () => {
      try {
        const result = await checkoutAction(locale, {
          idempotencyKey: idempotencyKey.current ?? crypto.randomUUID(),
          lines: props.lines(),
          payments,
          customer: { name: customer.name, phone: customer.phone },
          ...(props.voucherCode ? { voucherCode: props.voucherCode } : {}),
          ...(mode === "kasbon"
            ? {
                kasbon: {
                  note: kasbon.note,
                  dueDate: kasbon.dueDate === "" ? null : kasbon.dueDate,
                },
              }
            : {}),
        });
        if (!result.ok) {
          setError(result.message);
          setErrorAction(result.action ?? null);
          return;
        }
        setCashText("");
        setTransferText("");
        setSource(emptySourceBank);
        setNonCash("TRANSFER");
        setCustomer(emptyCustomerDraft);
        setKasbon(emptyKasbonDraft);
        setShowErrors(false);
        setMode("cash");
        const paidCash = mode !== "kasbon" && cashDue > 0;
        props.onSuccess({
          saleId: result.saleId,
          invoiceNo: result.invoiceNo,
          change: paidCash && received !== null ? received - cashDue : null,
          tendered: paidCash ? received : null,
          kasbonTotal: result.kasbonTotal,
        });
      } catch {
        setError(t("errors.network"));
      }
    });
  };

  const modes: readonly { value: Mode; label: string }[] = [
    { value: "cash", label: t("cash") },
    { value: "transfer", label: t("transfer") },
    ...(props.qrisAccount ? [{ value: "qris" as const, label: t("qris") }] : []),
    { value: "split", label: t("split") },
    ...(props.canKasbon ? [{ value: "kasbon" as const, label: t("kasbon") }] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent closeLabel={t("close")} side="right" className="max-w-md">
        <DialogTitle>{t("payTitle")}</DialogTitle>
        <div className="rounded-card bg-surface-muted p-4">
          <p className="text-sm text-ink-muted">{t("amountDue")}</p>
          <p className="text-3xl font-semibold text-ink tabular-nums">{money(grandTotal)}</p>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <CustomerFields
            locale={locale}
            draft={customer}
            onChange={setCustomer}
            phoneRequired={mode === "kasbon"}
            showErrors={showErrors}
            errors={customerErrors}
          />

          {grandTotal > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-ink">{t("methodLabel")}</legend>
              <div
                className={cn(
                  "grid gap-1 rounded-card bg-surface-muted p-1",
                  modes.length === 4 ? "grid-cols-2" : "grid-cols-3",
                )}
              >
                {modes.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-center rounded-full px-2 text-center text-sm font-medium text-ink-muted",
                      mode === option.value && "bg-surface text-ink shadow-sm",
                    )}
                  >
                    <input
                      type="radio"
                      name="mode"
                      value={option.value}
                      checked={mode === option.value}
                      onChange={() => {
                        setMode(option.value);
                      }}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {mode === "kasbon" ? (
            <KasbonFields
              locale={locale}
              draft={kasbon}
              onChange={setKasbon}
              remainder={grandTotal - (downPayment ?? 0)}
              today={props.today}
              showErrors={showErrors}
              errors={kasbonErrors}
            />
          ) : null}

          {needsBank || needsQris || mode === "split" ? (
            <div className="flex flex-col gap-3">
              {mode === "split" && props.qrisAccount ? (
                <div role="group" aria-label={t("nonCashLabel")} className="flex gap-2">
                  {(["TRANSFER", "QRIS"] as const).map((option) => (
                    <Button
                      key={option}
                      size="sm"
                      variant={nonCash === option ? "primary" : "secondary"}
                      aria-pressed={nonCash === option}
                      onClick={() => {
                        setNonCash(option);
                      }}
                    >
                      {option === "QRIS" ? t("qris") : t("transfer")}
                    </Button>
                  ))}
                </div>
              ) : null}
              {mode === "split" ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-transfer`} className="text-sm font-medium text-ink">
                    {nonCash === "QRIS" && props.qrisAccount
                      ? t("qrisAmount")
                      : t("transferAmount")}
                  </label>
                  <MoneyInput
                    id={`${id}-transfer`}
                    value={transferText}
                    onValueChange={setTransferText}

                    maxLength={20}
                  />
                </div>
              ) : null}
              {needsQris && props.qrisAccount ? (
                <>
                  <p className="rounded-control bg-surface-muted px-3 py-2 text-sm text-ink">
                    {t("qrisAccount", { account: props.qrisAccount.label })}
                  </p>
                  <SourceBankField draft={source} onChange={setSource} showError={showErrors} />
                </>
              ) : mode === "split" && nonCash === "QRIS" ? null : bankAccounts.length === 0 ? (
                <p className={cn("rounded-control px-3 py-2 text-sm", toneClasses.warning)}>
                  {t("noBankAccounts")}
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-bank`} className="text-sm font-medium text-ink">
                    {t("bankAccount")}
                  </label>
                  <Select
                    id={`${id}-bank`}
                    value={bankAccountId}
                    onValueChange={setBankAccountId}
                    options={bankAccounts.map((account) => ({
                      value: account.id,
                      label: account.label,
                    }))}
                  />
                </div>
              )}
            </div>
          ) : null}

          {cashDue > 0 && mode !== "kasbon" ? (
            <div className="flex flex-col gap-2">
              {mode === "split" ? (
                <p className="text-sm text-ink-muted">{`${t("cashPortion")}: ${money(cashDue)}`}</p>
              ) : null}
              <label htmlFor={`${id}-cash`} className="text-sm font-medium text-ink">
                {t("cashReceived")}
              </label>
              <MoneyInput
                id={`${id}-cash`}
                value={cashText}
                onValueChange={setCashText}

                maxLength={20}
                className="text-lg tabular-nums"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setCashText(String(cashDue));
                  }}
                >
                  {t("exact")}
                </Button>
                {QUICK_CASH.filter((amount) => amount >= cashDue).map((amount) => (
                  <Button
                    key={amount}
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setCashText(String(amount));
                    }}
                  >
                    {money(amount)}
                  </Button>
                ))}
              </div>
              {change !== null ? (
                <p
                  aria-live="polite"
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    change < 0 ? "text-danger-ink" : "text-ink",
                  )}
                >
                  {change < 0
                    ? t("shortfall", { amount: money(-change) })
                    : `${t("change")}: ${money(change)}`}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className={cn("rounded-control px-3 py-2 text-sm", toneClasses.danger)}>
              {error}
            </p>
          ) : null}
          {errorAction ? (
            <Button asChild variant="secondary" className="w-full">
              <Link href={errorAction.href} scroll={false}>
                {errorAction.label}
              </Link>
            </Button>
          ) : null}

          <DialogFooter>
            <Button
              type="submit"
              size="lg"
              disabled={!valid || pending}
              aria-busy={pending}
              className="w-full"
            >
              {pending ? t("processing") : t("confirmPay")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
