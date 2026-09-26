"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/config/locales";
import { LOCALE_FIELD } from "@/i18n/form-locale";

import { loginAction, type LoginState } from "../actions";

interface LoginFormProps {
  locale: Locale;
  labels: {
    username: string;
    secret: string;
    secretHint: string;
    submit: string;
    submitting: string;
  };
}

const initialState: LoginState = {};

/** Sign-in form (FR-AUTH-01/02); moves focus to the secret after a failure (FR-UX-05). */
export function LoginForm({ locale, labels }: LoginFormProps) {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const secretRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) secretRef.current?.focus();
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name={LOCALE_FIELD} value={locale} />
      {state.error ? (
        <p role="alert" className="rounded-control bg-danger px-3 py-2 text-sm text-danger-ink">
          {state.error}
        </p>
      ) : null}
      <Field label={labels.username}>
        {(control) => (
          <Input
            {...control}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={32}
            defaultValue={state.username}
          />
        )}
      </Field>
      <Field label={labels.secret} hint={labels.secretHint}>
        {(control) => (
          <Input
            {...control}
            ref={secretRef}
            type="password"
            name="secret"
            autoComplete="current-password"
            required
            maxLength={128}
            {...(state.error ? { "aria-invalid": true } : {})}
          />
        )}
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? labels.submitting : labels.submit}
      </Button>
    </form>
  );
}
