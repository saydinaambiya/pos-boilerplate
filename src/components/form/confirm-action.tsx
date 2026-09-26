"use client";

import { useCallback, useState } from "react";

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
  variant?: "danger" | "secondary";
  labels: {
    trigger: string;
    title: string;
    description: string;
    confirm: string;
    cancel: string;
    close: string;
  };
}

/** Confirmation dialog in front of a destructive Server Action (FR-UX-04). */
export function ConfirmAction({ action, locale, variant = "danger", labels }: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>{labels.trigger}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={labels.close}>
        <DialogTitle>{labels.title}</DialogTitle>
        <DialogDescription>{labels.description}</DialogDescription>
        <ActionForm action={action} locale={locale} onSuccess={close}>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{labels.cancel}</Button>
            </DialogClose>
            <SubmitButton variant={variant}>{labels.confirm}</SubmitButton>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
