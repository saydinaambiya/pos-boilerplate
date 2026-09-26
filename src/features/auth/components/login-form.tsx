"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput, type RevealLabels } from "@/components/ui/password-input";
import type { Locale } from "@/config/locales";
import { LOCALE_FIELD } from "@/i18n/form-locale";

import { loginAction, type LoginState } from "../actions";

interface LoginFormProps {
  locale: Locale;
  labels: {
    username: string;
    next: string;
    password: string;
    pin: string;
    pinHint: string;
    changeUser: string;
    /** Contains a literal `{username}` placeholder. */
    signingInAs: string;
    submit: string;
    submitting: string;
    reveal: RevealLabels;
  };
}

const initialState: LoginState = {};

/**
 * Two-step sign-in (FR-AUTH-01/02): username first, then a password for the
 * Owner or a 6-digit PIN for everyone else. Focus moves to the field that
 * needs attention after each step (FR-UX-05).
 */
export function LoginForm({ locale, labels }: LoginFormProps) {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [editedState, setEditedState] = useState<LoginState | null>(null);
  const editing = editedState === state;
  const usernameRef = useRef<HTMLInputElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const method = editing ? undefined : state.method;

  useEffect(() => {
    if (state.method) secretRef.current?.focus();
    else if (state.error) usernameRef.current?.focus();
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name={LOCALE_FIELD} value={locale} />
      {state.error ? (
        <p role="alert" className="rounded-control bg-danger px-3 py-2 text-sm text-danger-ink">
          {state.error}
        </p>
      ) : null}

      {method ? (
        <>
          <input type="hidden" name="username" value={state.username ?? ""} />
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-muted px-3 py-2 text-sm">
            <span className="font-medium [overflow-wrap:anywhere] text-ink">
              {labels.signingInAs.replace("{username}", state.username ?? "")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditedState(state);
                requestAnimationFrame(() => usernameRef.current?.focus());
              }}
            >
              {labels.changeUser}
            </Button>
          </div>
          <Field
            label={method === "password" ? labels.password : labels.pin}
            hint={method === "pin" ? labels.pinHint : undefined}
          >
            {(control) => (
              <PasswordInput
                {...control}
                ref={secretRef}
                labels={labels.reveal}
                name="secret"
                required
                autoComplete="current-password"
                {...(method === "pin"
                  ? { inputMode: "numeric", pattern: "[0-9]{6}", maxLength: 6 }
                  : { maxLength: 128 })}
                {...(state.error ? { "aria-invalid": true } : {})}
              />
            )}
          </Field>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? labels.submitting : labels.submit}
          </Button>
        </>
      ) : (
        <>
          <input type="hidden" name="step" value="username" />
          <Field label={labels.username}>
            {(control) => (
              <Input
                {...control}
                ref={usernameRef}
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={32}
                defaultValue={state.username}
                {...(state.error ? { "aria-invalid": true } : {})}
              />
            )}
          </Field>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? labels.submitting : labels.next}
          </Button>
        </>
      )}
    </form>
  );
}
