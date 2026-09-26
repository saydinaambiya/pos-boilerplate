"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import type { Locale } from "@/config/locales";
import { formatCurrency } from "@/lib/format/currency";
import { normalizeIndonesianPhone } from "@/lib/format/phone";

import { type CustomerSuggestion, searchCustomersAction } from "../actions";

export interface KasbonDraft {
  name: string;
  phone: string;
  note: string;
  dueDate: string;
  downPayment: string;
}

export const emptyKasbonDraft: KasbonDraft = {
  name: "",
  phone: "",
  note: "",
  dueDate: "",
  downPayment: "",
};

/** Whether the draft can be submitted; the server validates again (BR-11). */
export function kasbonDraftErrors(draft: KasbonDraft, downPayment: number | null, total: number) {
  return {
    name: draft.name.trim() === "",
    phone: normalizeIndonesianPhone(draft.phone) === null,
    downPayment: downPayment === null || downPayment >= total,
  };
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
 * Customer and terms for putting the remainder on store credit (FR-PAY-05,
 * FR-KSB-01). Typing a name or phone suggests earlier customers so they are
 * re-used rather than duplicated.
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
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [term, setTerm] = useState("");

  useEffect(() => {
    if (term.trim().length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void searchCustomersAction(locale, term).then((rows) => {
        if (active) setSuggestions(rows);
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [term, locale]);

  const set = (field: keyof KasbonDraft, value: string) => {
    onChange({ ...draft, [field]: value });
    if (field === "name" || field === "phone") setTerm(value);
  };
  const visible = term.trim().length >= 2 ? suggestions : [];
  const describedBy = (field: "name" | "phone" | "downPayment") =>
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

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-ink">{t("customer")}</legend>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-phone`} className="text-sm font-medium text-ink">
            {t("customerPhone")}
          </label>
          <Input
            id={`${id}-phone`}
            type="tel"
            autoComplete="off"
            value={draft.phone}
            onChange={(event) => {
              set("phone", event.target.value);
            }}
            placeholder="0812-3456-7890"
            maxLength={20}
            aria-invalid={showErrors && errors.phone ? true : undefined}
            aria-describedby={describedBy("phone")}
          />
          {showErrors && errors.phone ? (
            <p id={`${id}-phone-error`} className="text-sm text-danger-ink">
              {t("customerPhoneInvalid")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium text-ink">
            {t("customerName")}
          </label>
          <Input
            id={`${id}-name`}
            autoComplete="off"
            value={draft.name}
            onChange={(event) => {
              set("name", event.target.value);
            }}
            maxLength={80}
            aria-invalid={showErrors && errors.name ? true : undefined}
            aria-describedby={describedBy("name")}
          />
          {showErrors && errors.name ? (
            <p id={`${id}-name-error`} className="text-sm text-danger-ink">
              {t("customerNameRequired")}
            </p>
          ) : null}
        </div>
        {visible.length > 0 ? (
          <ul aria-label={t("customerSuggestions")} className="flex flex-col gap-1">
            {visible.map((customer) => (
              <li key={customer.phone}>
                <button
                  type="button"
                  className="flex min-h-11 w-full flex-col items-start rounded-control px-3 py-1.5 text-left text-sm hover:bg-surface-muted focus-visible:bg-surface-muted"
                  onClick={() => {
                    onChange({
                      ...draft,
                      name: customer.name,
                      phone: customer.phone,
                      note: customer.note,
                    });
                    setTerm("");
                  }}
                >
                  <span className="font-medium text-ink">{customer.name}</span>
                  <span className="text-xs text-ink-muted tabular-nums">{customer.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
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
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-due`} className="text-sm font-medium text-ink">
          {t("dueDate")}
        </label>
        <Input
          id={`${id}-due`}
          type="date"
          min={today}
          value={draft.dueDate}
          onChange={(event) => {
            set("dueDate", event.target.value);
          }}
        />
      </div>
    </div>
  );
}
