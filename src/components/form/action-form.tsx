"use client";

import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  use,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";

import { ResultDialog } from "@/components/feedback/result-dialog";
import { useShowResult } from "@/components/feedback/result-provider";
import { useCloseRouteDialog } from "@/components/ui/route-dialog";
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
  /**
   * Called once per successful submission with the server message, e.g. to
   * close a dialog.
   */
  onSuccess?: (message: string | undefined) => void;
  /** Set to false when the caller shows the success message itself. */
  successDialog?: boolean;
  children: ReactNode;
}

/**
 * Form bound to a Server Action through `useActionState` (FR-UX-05). The
 * outcome opens in a dialog with an OK button so it is seen even on long
 * forms; success goes to the app-wide dialog so it survives the form
 * leaving the page; inside a `RouteDialog` success also closes the dialog.
 * Field errors also stay next to their fields, and
 * closing the error dialog moves focus to the first invalid one. Posts
 * normally before hydration.
 */
export function ActionForm({
  action,
  locale,
  className,
  onSuccess,
  successDialog = true,
  children,
}: ActionFormProps) {
  const t = useTranslations("Feedback");
  const [state, dispatch] = useActionState(action, {});
  const [dismissed, setDismissed] = useState<FormState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<FormState | null>(null);
  const showShared = useShowResult();
  const closeDialog = useCloseRouteDialog();

  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.status !== "success") return;
    onSuccess?.(state.message);
    if (successDialog && state.message && showShared) {
      showShared({ status: "success", message: state.message });
    }
    closeDialog?.();
  }, [state, onSuccess, successDialog, showShared, closeDialog]);

  const showSuccess = state.status === "success" && successDialog && state.message && !showShared;
  const result =
    state === dismissed
      ? null
      : state.status === "error"
        ? {
            status: "error" as const,
            message: state.message ?? t("checkFields"),
            action: state.action,
          }
        : showSuccess
          ? { status: "success" as const, message: state.message ?? "" }
          : null;

  return (
    <FormStateContext value={state}>
      <form
        ref={formRef}
        action={dispatch}
        noValidate
        className={cn("flex flex-col gap-4", className)}
      >
        <input type="hidden" name={LOCALE_FIELD} value={locale} />
        {children}
      </form>
      <ResultDialog
        result={result}
        onClose={() => {
          setDismissed(state);
        }}
        onCloseFocus={
          state.status === "error"
            ? () => {
                formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
              }
            : undefined
        }
      />
    </FormStateContext>
  );
}
