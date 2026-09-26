"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useState, useSyncExternalStore } from "react";

import { type ActionResult, ResultDialog } from "@/components/feedback/result-dialog";
import { useShowResult } from "@/components/feedback/result-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Locale } from "@/config/locales";
import type { FormAction } from "@/lib/validation/form-state";

import { ActionForm } from "./action-form";
import { SubmitButton } from "./submit-button";

interface ConfirmActionProps {
  action: FormAction;
  locale: Locale;
  variant?: "danger" | "secondary" | "primary";
  /** Extra fields posted with the confirmation, e.g. a reason. */
  children?: ReactNode;
  labels: {
    trigger: string;
    title: string;
    description: string;
    confirm: string;
    cancel: string;
    close: string;
  };
}

const subscribeNever = () => () => undefined;

/**
 * Confirmation dialog in front of a destructive Server Action (FR-UX-04).
 * Errors open over the confirmation; on success it closes, the result opens
 * on its own and the page refreshes, so actions whose target leaves the page
 * (an approved request) still show their outcome.
 * The dialog needs JavaScript, so the trigger stays disabled until hydration
 * instead of silently ignoring early clicks.
 */
export function ConfirmAction({
  action,
  locale,
  variant = "danger",
  children,
  labels,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const [result, setResult] = useState<ActionResult | null>(null);
  const showShared = useShowResult();
  const router = useRouter();
  const succeeded = useCallback(
    (message: string | undefined) => {
      setOpen(false);
      if (message) {
        if (showShared) showShared({ status: "success", message });
        else setResult({ status: "success", message });
      }
      router.refresh();
    },
    [showShared, router],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant={variant} disabled={!hydrated}>
            {labels.trigger}
          </Button>
        </DialogTrigger>
        <DialogContent closeLabel={labels.close}>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
          <ActionForm action={action} locale={locale} onSuccess={succeeded} successDialog={false}>
            {children}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">{labels.cancel}</Button>
              </DialogClose>
              <SubmitButton variant={variant}>{labels.confirm}</SubmitButton>
            </DialogFooter>
          </ActionForm>
        </DialogContent>
      </Dialog>
      <ResultDialog
        result={result}
        onClose={() => {
          setResult(null);
        }}
      />
    </>
  );
}
