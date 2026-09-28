"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import type { Locale } from "@/config/locales";
import { formatCurrency } from "@/lib/format/currency";

export interface KasbonDraft {
  note: string;
  dueDate: string;
  downPayment: string;
}

export const emptyKasbonDraft: KasbonDraft = {
  note: "",
  dueDate: "",
  downPayment: "",
};

/** Whether the draft can be submitted; the server validates again (BR-11). */
export function kasbonDraftErrors(downPayment: number | null, total: number) {
  return { downPayment: downPayment === null || downPayment >= total };
}

interface KasbonFieldsProps {
  locale: Locale;
  draft: KasbonDraft;
  onChange: (draft: KasbonDraft) => void;
  remainder: number;
  today: string;
  showErrors: boolean;
  errors: ReturnType<typeof kasbonDraftErrors>;
}

/**
 * Down payment, note and terms for putting the remainder on store credit
 * (FR-PAY-05, FR-KSB-01). The customer comes from the sale's buyer fields.
 */
export function KasbonFields({
  locale,
  draft,
  onChange,
  remainder,
  today,
  showErrors,
  errors,
}: KasbonFieldsProps) {
  const t = useTranslations("Pos");
  const id = useId();
  const set = (field: keyof KasbonDraft, value: string) => {
    onChange({ ...draft, [field]: value });
  };
  const describedBy = (field: "downPayment") =>
    showErrors && errors[field] ? `${id}-${field}-error` : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-dp`} className="text-sm font-medium text-ink">
          {t("downPayment")}
        </label>
        <MoneyInput
          id={`${id}-dp`}
          value={draft.downPayment}
          onValueChange={(text) => {
            set("downPayment", text);
          }}
          maxLength={20}
          aria-invalid={showErrors && errors.downPayment ? true : undefined}
          aria-describedby={describedBy("downPayment")}
        />
        {showErrors && errors.downPayment ? (
          <p id={`${id}-downPayment-error`} className="text-sm text-danger-ink">
            {t("downPaymentTooHigh")}
          </p>
        ) : null}
      </div>
      <p className="rounded-control bg-surface-muted px-3 py-2 text-sm font-medium text-ink tabular-nums">
        {t("kasbonRemainder", { amount: formatCurrency(Math.max(remainder, 0), locale) })}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="text-sm font-medium text-ink">
          {t("customerNote")}
        </label>
        <Input
          id={`${id}-note`}
          value={draft.note}
          onChange={(event) => {
            set("note", event.target.value);
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
          min={today}
          value={draft.dueDate}
          onValueChange={(value) => {
            set("dueDate", value);
          }}
          clearable
        />
      </div>
    </div>
  );
}
