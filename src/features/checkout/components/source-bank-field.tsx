"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { QRIS_SOURCE_BANKS } from "../source-banks";

const OTHER = "__other";

export interface SourceBankDraft {
  choice: string;
  other: string;
}

export const emptySourceBank: SourceBankDraft = { choice: "", other: "" };

/** The bank or e-wallet named by a draft, or "" while none is chosen (FR-PAY-07). */
export function sourceBankOf(draft: SourceBankDraft): string {
  return (draft.choice === OTHER ? draft.other : draft.choice).trim();
}

/**
 * Required bank or e-wallet a QRIS payment came from: a common one from the
 * list, or "other" and typed in (FR-PAY-07).
 */
export function SourceBankField(props: {
  draft: SourceBankDraft;
  onChange: (draft: SourceBankDraft) => void;
  showError: boolean;
}) {
  const t = useTranslations("Pos");
  const id = useId();
  const missing = props.showError && sourceBankOf(props.draft) === "";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-source`} className="text-sm font-medium text-ink">
        {t("sourceBank")}
      </label>
      <Select
        id={`${id}-source`}
        value={props.draft.choice}
        placeholder={t("sourceBankPlaceholder")}
        onValueChange={(choice) => {
          props.onChange({ ...props.draft, choice });
        }}
        options={[
          ...QRIS_SOURCE_BANKS.map((bank) => ({ value: bank, label: bank })),
          { value: OTHER, label: t("sourceBankOther") },
        ]}
        aria-invalid={missing || undefined}
      />
      {props.draft.choice === OTHER ? (
        <>
          <label htmlFor={`${id}-other`} className="sr-only">
            {t("sourceBankOtherName")}
          </label>
          <Input
            id={`${id}-other`}
            value={props.draft.other}
            placeholder={t("sourceBankOtherName")}
            onChange={(event) => {
              props.onChange({ ...props.draft, other: event.target.value });
            }}
            maxLength={40}
            aria-invalid={missing || undefined}
          />
        </>
      ) : null}
      {missing ? <p className="text-xs text-danger-ink">{t("sourceBankRequired")}</p> : null}
    </div>
  );
}
