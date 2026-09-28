"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { useGlobalPending } from "@/components/feedback/loading-indicator";
import { type ActionResult, ResultDialog } from "@/components/feedback/result-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { toneClasses } from "@/components/ui/tone";
import type { Locale } from "@/config/locales";
import { useRouter } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/format/currency";
import { parseRupiah } from "@/lib/format/rupiah-input";
import { cn } from "@/lib/utils/cn";

import { recordKasbonPaymentAction } from "../actions";

type Mode = "cash" | "transfer" | "split";

interface KasbonPaymentFormProps {
  locale: Locale;
  kasbonId: string;
  /** Balance minus pending payments: the most that can be requested (FR-KSB-05). */
  available: number;
  bankAccounts: readonly { id: string; label: string }[];
}

const amountOf = (text: string) => (text.trim() === "" ? 0 : (parseRupiah(text) ?? Number.NaN));

/**
 * Installment entry laid out like the POS payment (FR-KSB-03): cash,
 * transfer, or both. Cash received and change are only shown here; the
 * server gets the amounts applied to the credit (BR-22). The outcome opens
 * in a dialog.
 */
export function KasbonPaymentForm({
  locale,
  kasbonId,
  available,
  bankAccounts,
}: KasbonPaymentFormProps) {
  const t = useTranslations("Kasbon");
  const id = useId();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("cash");
  const [amountText, setAmountText] = useState("");
  const [transferText, setTransferText] = useState("");
  const [receivedText, setReceivedText] = useState("");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [reference, setReference] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  useGlobalPending(pending);

  const money = (value: number) => formatCurrency(value, locale);
  const amount = amountOf(amountText);
  const transfer =
    mode === "transfer" ? amount : mode === "split" ? Math.min(amountOf(transferText), amount) : 0;
  const cash =
    Number.isFinite(amount) && Number.isFinite(transfer) ? amount - transfer : Number.NaN;
  const received = amountOf(receivedText);
  const change = cash > 0 && receivedText.trim() !== "" ? received - cash : null;
  const valid =
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= available &&
    Number.isFinite(cash) &&
    (mode !== "split" || (transfer > 0 && cash > 0)) &&
    (transfer === 0 || bankAccountId !== "") &&
    (change === null || change >= 0);

  const modes: readonly { value: Mode; label: string }[] = [
    { value: "cash", label: t("methods.CASH") },
    { value: "transfer", label: t("methods.TRANSFER") },
    { value: "split", label: t("methods.SPLIT") },
  ];

  const submit = () => {
    if (!valid || pending) return;
    startTransition(async () => {
      try {
        const response = await recordKasbonPaymentAction(locale, kasbonId, {
          cash,
          transfer:
            transfer > 0 ? { amount: transfer, bankAccountId, reference: reference.trim() } : null,
        });
        setResult({ status: response.ok ? "success" : "error", message: response.message });
        if (response.ok) {
          setAmountText("");
          setTransferText("");
          setReceivedText("");
          setReference("");
          router.refresh();
        }
      } catch {
        setResult({ status: "error", message: t("errorNetwork") });
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
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-ink">{t("method")}</legend>
        <div className={cn("grid gap-1 rounded-card bg-surface-muted p-1", "grid-cols-3")}>
          {modes.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center rounded-control px-2 text-center text-sm font-medium text-ink-muted",
                mode === option.value && "bg-surface text-ink shadow-sm",
              )}
            >
              <input
                type="radio"
                name="method"
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-amount`} className="text-sm font-medium text-ink">
          {t("amount")}
        </label>
        <MoneyInput
          id={`${id}-amount`}
          value={amountText}
          onValueChange={setAmountText}
          maxLength={20}
          aria-describedby={`${id}-amount-hint`}
          aria-invalid={Number.isFinite(amount) && amount > available ? true : undefined}
        />
        <p id={`${id}-amount-hint`} className="text-xs text-ink-muted">
          {t("recordPaymentDescription", { amount: money(available) })}
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() => {
            setAmountText(String(available));
          }}
        >
          {t("payOff", { amount: money(available) })}
        </Button>
      </div>

      {mode !== "cash" ? (
        <div className="flex flex-col gap-3">
          {mode === "split" ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-transfer`} className="text-sm font-medium text-ink">
                {t("transferAmount")}
              </label>
              <MoneyInput
                id={`${id}-transfer`}
                value={transferText}
                onValueChange={setTransferText}
                maxLength={20}
              />
            </div>
          ) : null}
          {bankAccounts.length === 0 ? (
            <p
              role="status"
              className={cn("rounded-control px-3 py-2 text-sm", toneClasses.warning)}
            >
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

      {cash > 0 ? (
        <div className="flex flex-col gap-1.5">
          {mode === "split" ? (
            <p className="text-sm text-ink-muted">{t("cashPortion", { amount: money(cash) })}</p>
          ) : null}
          <label htmlFor={`${id}-received`} className="text-sm font-medium text-ink">
            {t("cashReceived")}
          </label>
          <MoneyInput
            id={`${id}-received`}
            value={receivedText}
            onValueChange={setReceivedText}
            maxLength={20}
          />
          {change !== null ? (
            <p
              aria-live="polite"
              className={cn(
                "font-semibold tabular-nums",
                change < 0 ? "text-danger-ink" : "text-ink",
              )}
            >
              {change < 0
                ? t("shortfall", { amount: money(-change) })
                : t("change", { amount: money(change) })}
            </p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={!valid || pending} aria-busy={pending} className="self-start">
        {pending ? t("saving") : t("submitPayment")}
      </Button>
      <ResultDialog
        result={result}
        onClose={() => {
          setResult(null);
        }}
      />
    </form>
  );
}
