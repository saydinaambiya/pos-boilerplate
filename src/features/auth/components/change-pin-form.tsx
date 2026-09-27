"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordInput, type RevealLabels } from "@/components/ui/password-input";
import type { Locale } from "@/config/locales";
import { LOCALE_FIELD } from "@/i18n/form-locale";

import { changePinAction, type ChangePinState } from "../actions";

interface ChangePinFormProps {
  locale: Locale;
  labels: {
    newPin: string;
    newPinHint: string;
    confirmPin: string;
    submit: string;
    reveal: RevealLabels;
  };
}

const initialState: ChangePinState = {};

/** Forced PIN change (FR-AUTH-06); focuses the first invalid field (FR-UX-05). */
export function ChangePinForm({ locale, labels }: ChangePinFormProps) {
  const [state, action, pending] = useActionState(changePinAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>("[aria-invalid=true]")?.focus();
  }, [state]);

  const pinProps = {
    inputMode: "numeric",
    pattern: "[0-9]{6}",
    minLength: 6,
    maxLength: 6,
    autoComplete: "new-password",
    required: true,
  } as const;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <input type="hidden" name={LOCALE_FIELD} value={locale} />
      <Field label={labels.newPin} hint={labels.newPinHint} error={state.errors?.pin}>
        {(control) => (
          <PasswordInput {...control} {...pinProps} labels={labels.reveal} name="pin" />
        )}
      </Field>
      <Field label={labels.confirmPin} error={state.errors?.confirmPin}>
        {(control) => (
          <PasswordInput {...control} {...pinProps} labels={labels.reveal} name="confirmPin" />
        )}
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {labels.submit}
      </Button>
    </form>
  );
}
