"use client";

import { Check, Copy, Download } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { useGlobalPending } from "@/components/feedback/loading-indicator";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordInput, type RevealLabels } from "@/components/ui/password-input";
import { toneClasses } from "@/components/ui/tone";
import type { Locale } from "@/config/locales";
import { LOCALE_FIELD } from "@/i18n/form-locale";
import { cn } from "@/lib/utils/cn";

import { generateRecoveryCodesAction, type RecoveryCodesState } from "../actions";

interface RecoveryCodesCardProps {
  locale: Locale;
  /** Whether a set exists already, so creating one replaces it. */
  hasCodes: boolean;
  /** First line of the downloaded file. */
  fileHeader: string;
  labels: {
    currentPassword: string;
    passwordHint: string;
    generate: string;
    regenerate: string;
    regenerateWarning: string;
    shownOnce: string;
    listLabel: string;
    copy: string;
    copied: string;
    download: string;
    saved: string;
    reveal: RevealLabels;
  };
}

const initialState: RecoveryCodesState = {};

/**
 * Creates recovery codes after the current password and shows them once,
 * with copy and a plain-text download (FR-AUTH-12, ADR-0037). The codes
 * live only in this component's state; "saved" clears them.
 */
export function RecoveryCodesCard({
  locale,
  hasCodes,
  fileHeader,
  labels,
}: RecoveryCodesCardProps) {
  const [state, action, pending] = useActionState(generateRecoveryCodesAction, initialState);
  useGlobalPending(pending);
  const [dismissed, setDismissed] = useState<RecoveryCodesState | null>(null);
  const [copied, setCopied] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const codes = state === dismissed ? undefined : state.codes;

  useEffect(() => {
    if (state.codes) listRef.current?.focus();
    else if (state.error) passwordRef.current?.focus();
  }, [state]);

  if (codes) {
    const text = [fileHeader, "", ...codes].join("\n");
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className={cn("rounded-control px-3 py-2 text-sm", toneClasses.warning)}>
          {labels.shownOnce}
        </p>
        <ol
          ref={listRef}
          tabIndex={-1}
          aria-label={labels.listLabel}
          className="grid gap-2 rounded-control bg-surface-muted p-4 font-mono text-sm sm:grid-cols-2"
        >
          {codes.map((code) => (
            <li key={code} className="tracking-wider">
              {code}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
              });
            }}
          >
            {copied ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copied ? labels.copied : labels.copy}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
              const link = document.createElement("a");
              link.href = url;
              link.download = "recovery-codes.txt";
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="size-4" aria-hidden="true" />
            {labels.download}
          </Button>
          <Button
            onClick={() => {
              setDismissed(state);
              setCopied(false);
            }}
          >
            {labels.saved}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name={LOCALE_FIELD} value={locale} />
      {hasCodes ? <p className="text-sm text-ink-muted">{labels.regenerateWarning}</p> : null}
      <Field
        label={labels.currentPassword}
        hint={labels.passwordHint}
        error={state === dismissed ? undefined : state.error}
      >
        {(control) => (
          <PasswordInput
            {...control}
            ref={passwordRef}
            labels={labels.reveal}
            name="currentPassword"
            autoComplete="current-password"
            maxLength={128}
            required
          />
        )}
      </Field>
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {hasCodes ? labels.regenerate : labels.generate}
      </Button>
    </form>
  );
}
