"use client";

import { ActionForm } from "@/components/form/action-form";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import type { RevealLabels } from "@/components/ui/password-input";
import type { Locale } from "@/config/locales";

import { recoverPasswordAction } from "../actions";

interface RecoverFormProps {
  locale: Locale;
  username: string;
  labels: {
    username: string;
    code: string;
    codeHint: string;
    password: string;
    passwordHint: string;
    confirmPassword: string;
    submit: string;
    reveal: RevealLabels;
  };
}

/** Recovery code plus a new password; success leads back to sign-in (FR-AUTH-12, ADR-0037). */
export function RecoverForm({ locale, username, labels }: RecoverFormProps) {
  return (
    <ActionForm action={recoverPasswordAction} locale={locale}>
      <FormField
        name="username"
        label={labels.username}
        defaultValue={username}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={32}
      />
      <FormField
        name="code"
        label={labels.code}
        hint={labels.codeHint}
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={40}
      />
      <FormField
        name="password"
        label={labels.password}
        hint={labels.passwordHint}
        reveal={labels.reveal}
        autoComplete="new-password"
        maxLength={128}
      />
      <FormField
        name="confirmPassword"
        label={labels.confirmPassword}
        reveal={labels.reveal}
        autoComplete="new-password"
        maxLength={128}
      />
      <SubmitButton size="lg">{labels.submit}</SubmitButton>
    </ActionForm>
  );
}
