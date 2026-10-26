"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FormDateField, FormField, FormSelect } from "@/components/form/form-field";
import { cn } from "@/lib/utils/cn";

import { purchasePaymentMethods, purchaseTerms, type PurchaseTerm } from "../schemas";

/**
 * Fields of a new supplier bill (FR-PRB-01/02): a lunas/cicil choice decides
 * whether the amount paid and the due date are asked for. A "Lunas" bill is
 * settled for its full total, so those fields stay hidden.
 */
export function NewPurchaseFields() {
  const t = useTranslations("Purchases");
  const [term, setTerm] = useState<PurchaseTerm>("CASH");
  const methodOptions = purchasePaymentMethods.map((method) => ({
    value: method,
    label: t(`methods.${method}`),
  }));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="companyName" label={t("companyName")} maxLength={80} autoComplete="off" />
        <FormField name="invoiceNo" label={t("invoiceNo")} maxLength={40} autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="total" label={t("total")} money maxLength={20} />
        <FormDateField name="orderDate" label={t("orderDate")} hint={t("orderDateHint")} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">{t("term")}</legend>
        <div className="grid grid-cols-2 gap-1 rounded-card bg-surface-muted p-1">
          {purchaseTerms.map((option) => (
            <label
              key={option}
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center rounded-control px-2 text-center text-sm font-medium text-ink-muted",
                term === option && "bg-surface text-ink shadow-sm",
              )}
            >
              <input
                type="radio"
                name="term"
                value={option}
                checked={term === option}
                onChange={() => {
                  setTerm(option);
                }}
                className="sr-only"
              />
              {t(`terms.${option}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {term === "CREDIT" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="paidNow"
            label={t("paidNow")}
            hint={t("paidNowHint")}
            money
            maxLength={20}
            defaultValue="0"
          />
          <FormDateField name="dueDate" label={t("dueDate")} hint={t("dueDateHint")} />
        </div>
      ) : null}
      <FormSelect name="method" label={t("method")} options={methodOptions} />
      <FormField name="note" label={t("note")} hint={t("optionalHint")} maxLength={200} />
    </>
  );
}
