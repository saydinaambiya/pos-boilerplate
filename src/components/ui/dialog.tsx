"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const sideClasses = {
  center:
    "top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-card",
  right: "inset-y-0 right-0 w-full max-w-md",
} as const;

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  /** `bottom` and `right` render the dialog as a sheet. */
  side?: keyof typeof sideClasses;
  closeLabel: string;
  /** Hide the corner close button when the dialog has its own dismiss button. */
  showClose?: boolean;
};

export function DialogContent({
  side = "center",
  closeLabel,
  showClose = true,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col gap-4 overflow-y-auto bg-surface p-6 text-ink shadow-card",
          sideClasses[side],
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn("pr-10 text-lg font-semibold", className)} {...props} />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn("text-sm text-ink-muted", className)} {...props} />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

/** A titled block below a dialog's main content, e.g. a record's status. */
export function DialogSection({
  title,
  description,
  className,
  children,
}: Omit<ComponentProps<"section">, "title"> & { title: ReactNode; description?: ReactNode }) {
  return (
    <section className={cn("flex flex-col gap-3 border-t border-border pt-4", className)}>
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-ink">{title}</h3>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
