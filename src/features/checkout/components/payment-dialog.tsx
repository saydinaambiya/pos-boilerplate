"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toneClasses } from "@/components/ui/tone";
import type { Locale } from "@/config/locales";
import { formatCurrency } from "@/lib/format/currency";
import { parseRupiah } from "@/lib/format/rupiah-input";
import type { ItemDiscount } from "@/lib/money/calculate";
import { cn } from "@/lib/utils/cn";

import { checkoutAction } from "../actions";
import {
  emptyKasbonDraft,
  KasbonFields,
  kasbonDraftErrors,
  type KasbonDraft,
} from "./kasbon-fields";

type Mode = "cash" | "transfer" | "split" | "kasbon";

export interface CheckoutLinePayload {
  variantId: string;
  qty: number;
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
 * Cash, transfer, split or store-credit payment (FR-PAY-01..05). Cash tendered and change
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
  const [reference, setReference] = useState("");
  const [kasbon, setKasbon] = useState<KasbonDraft>(emptyKasbonDraft);
  const [showKasbonErrors, setShowKasbonErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    if (open) idempotencyKey.current = crypto.randomUUID();
  }, [open]);

  const money = (amount: number) => formatCurrency(amount, locale);
  const transfer =
    mode === "transfer"
      ? grandTotal
      : mode === "split"
        ? Math.min(parseRupiah(transferText) ?? 0, grandTotal)
        : 0;
  const cashDue = grandTotal - transfer;
  const received = parseRupiah(cashText);
  const change = cashDue > 0 && received !== null ? received - cashDue : null;
  const needsBank = transfer > 0;
  const downPayment = kasbon.downPayment.trim() === "" ? 0 : parseRupiah(kasbon.downPayment);
  const kasbonErrors = kasbonDraftErrors(kasbon, downPayment, grandTotal);
  const valid =
    mode === "kasbon"
      ? true
      : (!needsBank || bankAccountId !== "") &&
        (cashDue === 0 || (received !== null && received >= cashDue));

  const submit = () => {
    if (!valid || pending) return;
    if (mode === "kasbon" && Object.values(kasbonErrors).some(Boolean)) {
      setShowKasbonErrors(true);
      return;
    }
    setError(null);
    const payments =
      mode === "kasbon"
        ? downPayment
          ? [{ method: "CASH" as const, amount: downPayment }]
          : []
        : [
            ...(transfer > 0
              ? [
                  {
                    method: "TRANSFER" as const,
                    amount: transfer,
                    bankAccountId,
                    ...(reference.trim() ? { reference: reference.trim() } : {}),
                  },
                ]
              : []),
            ...(cashDue > 0 ? [{ method: "CASH" as const, amount: cashDue }] : []),
          ];
    startTransition(async () => {
      try {
        const result = await checkoutAction(locale, {
          idempotencyKey: idempotencyKey.current ?? crypto.randomUUID(),
          lines: props.lines(),
          payments,
          ...(props.voucherCode ? { voucherCode: props.voucherCode } : {}),
          ...(mode === "kasbon"
            ? {
                kasbon: {
                  customer: { name: kasbon.name, phone: kasbon.phone, note: kasbon.note },
                  dueDate: kasbon.dueDate === "" ? null : kasbon.dueDate,
                },
              }
            : {}),
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setCashText("");
        setTransferText("");
        setReference("");
        setKasbon(emptyKasbonDraft);
        setShowKasbonErrors(false);
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
          {grandTotal > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-ink">{t("methodLabel")}</legend>
              <div
                className={cn(
                  "grid gap-1 rounded-card bg-surface-muted p-1",
                  modes.length > 3 ? "grid-cols-2" : "grid-cols-3",
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
              showErrors={showKasbonErrors}
              errors={kasbonErrors}
            />
          ) : null}

          {needsBank || mode === "split" ? (
            <div className="flex flex-col gap-3">
              {mode === "split" ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${id}-transfer`} className="text-sm font-medium text-ink">
                    {t("transferAmount")}
                  </label>
                  <Input
                    id={`${id}-transfer`}
                    value={transferText}
                    onChange={(event) => {
                      setTransferText(event.target.value);
                    }}
                    inputMode="numeric"
                    maxLength={20}
                  />
                </div>
              ) : null}
              {bankAccounts.length === 0 ? (
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
                    onChange={(event) => {
                      setBankAccountId(event.target.value);
                    }}
                  >
                    {bankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-reference`} className="text-sm font-medium text-ink">
                  {t("reference")}
                </label>
                <Input
                  id={`${id}-reference`}
                  value={reference}
                  onChange={(event) => {
                    setReference(event.target.value);
                  }}
                  maxLength={60}
                />
              </div>
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
              <Input
                id={`${id}-cash`}
                value={cashText}
                onChange={(event) => {
                  setCashText(event.target.value);
                }}
                inputMode="numeric"
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
