"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import { Input } from "@/components/ui/input";
import type { Locale } from "@/config/locales";
import { normalizeIndonesianPhone } from "@/lib/format/phone";

import { type CustomerSuggestion, searchCustomersAction } from "../actions";

export interface CustomerDraft {
  name: string;
  phone: string;
}

export const emptyCustomerDraft: CustomerDraft = { name: "", phone: "" };

/**
 * Whether the buyer can be submitted (FR-POS-11): a name always, a phone
 * when it is given or the sale goes on store credit (BR-11). The server
 * validates again.
 */
export function customerDraftErrors(draft: CustomerDraft, phoneRequired: boolean) {
  const phone = draft.phone.trim();
  return {
    name: draft.name.trim() === "",
    phone: phone === "" ? phoneRequired : normalizeIndonesianPhone(phone) === null,
  };
}

interface CustomerFieldsProps {
  locale: Locale;
  draft: CustomerDraft;
  onChange: (draft: CustomerDraft) => void;
  phoneRequired: boolean;
  showErrors: boolean;
  errors: ReturnType<typeof customerDraftErrors>;
}

/**
 * Buyer name (required) and phone (optional, required for store credit)
 * asked on every sale (FR-POS-11). Typing either suggests earlier store
 * credit customers so they are re-used rather than duplicated (FR-KSB-01).
 */
export function CustomerFields({
  locale,
  draft,
  onChange,
  phoneRequired,
  showErrors,
  errors,
}: CustomerFieldsProps) {
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

  const set = (field: "name" | "phone", value: string) => {
    onChange({ ...draft, [field]: value });
    setTerm(value);
  };
  const visible = term.trim().length >= 2 ? suggestions : [];
  const describedBy = (field: "name" | "phone") =>
    showErrors && errors[field] ? `${id}-${field}-error` : undefined;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium text-ink">{t("customer")}</legend>
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
          aria-required="true"
          aria-invalid={showErrors && errors.name ? true : undefined}
          aria-describedby={describedBy("name")}
        />
        {showErrors && errors.name ? (
          <p id={`${id}-name-error`} className="text-sm text-danger-ink">
            {t("customerNameRequired")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-phone`} className="text-sm font-medium text-ink">
          {phoneRequired ? t("customerPhone") : t("customerPhoneOptional")}
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
            {draft.phone.trim() === "" ? t("customerPhoneRequired") : t("customerPhoneInvalid")}
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
                  onChange({ name: customer.name, phone: customer.phone });
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
    </fieldset>
  );
}
