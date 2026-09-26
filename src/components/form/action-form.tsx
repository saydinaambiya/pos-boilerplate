"use client";

import { createContext, use, useActionState, useEffect, useRef, type ReactNode } from "react";

import { toneClasses } from "@/components/ui/tone";
import type { Locale } from "@/config/locales";
import { LOCALE_FIELD } from "@/i18n/form-locale";
import { cn } from "@/lib/utils/cn";
import type { FormAction, FormState } from "@/lib/validation/form-state";

const FormStateContext = createContext<FormState>({});

/** Latest server response of the enclosing `ActionForm`. */
export function useActionFormState(): FormState {
  return use(FormStateContext);
}

interface ActionFormProps {
  action: FormAction;
  locale: Locale;
  className?: string;
  /** Called once per successful submission, e.g. to close a dialog. */
  onSuccess?: () => void;
  children: ReactNode;
}

/**
 * Form bound to a Server Action through `useActionState` (FR-UX-05): shows
 * the translated server message, exposes field errors to `FormField`s and
 * moves focus to the first invalid field. Posts normally before hydration.
 */
export function ActionForm({ action, locale, className, onSuccess, children }: ActionFormProps) {
  const [state, dispatch] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<FormState | null>(null);

  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.status === "error") {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
    }
    if (state.status === "success") onSuccess?.();
  }, [state, onSuccess]);

  return (
    <FormStateContext value={state}>
      <form
        ref={formRef}
        action={dispatch}
        noValidate
        className={cn("flex flex-col gap-4", className)}
      >
        <input type="hidden" name={LOCALE_FIELD} value={locale} />
        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={cn(
              "rounded-control px-3 py-2 text-sm",
              state.status === "error" ? toneClasses.danger : toneClasses.success,
            )}
          >
            {state.message}
          </p>
        ) : null}
        {children}
      </form>
    </FormStateContext>
  );
}
