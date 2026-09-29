"use client";

import { createContext, type ReactNode, use, useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

type Href = Parameters<ReturnType<typeof useRouter>["replace"]>[0];

const CloseContext = createContext<(() => void) | null>(null);

/** Closes the enclosing `RouteDialog`; null outside one. */
export function useCloseRouteDialog() {
  return use(CloseContext);
}

/** Stops nested forms (a confirmation) from closing the enclosing `RouteDialog`. */
export function RouteDialogBoundary({ children }: { children: ReactNode }) {
  return <CloseContext value={null}>{children}</CloseContext>;
}

const sizeClasses = {
  md: "",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

interface RouteDialogProps {
  /**
   * Where closing goes: the host page without the dialog's search
   * parameter. Omitted for an intercepted route (ADR-0030), which closes by
   * going back to the page it opened over.
   */
  closeHref?: Href | undefined;
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  size?: keyof typeof sizeClasses;
  children: ReactNode;
}

/**
 * Dialog opened by a search parameter on its host page (ADR-0018), in place
 * of a page that would only hold one form or a short detail. The server
 * renders it when the parameter is present, so it can be linked to and its
 * data is loaded like a page. Closing, or a successful `ActionForm` inside,
 * replaces the URL with `closeHref`, which also refreshes the host page.
 */
export function RouteDialog({
  closeHref,
  title,
  description,
  closeLabel,
  size = "md",
  children,
}: RouteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    if (closeHref === undefined) router.back();
    else router.replace(closeHref, { scroll: false });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        closeLabel={closeLabel}
        className={cn("max-h-[90dvh]", sizeClasses[size])}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
        <CloseContext value={close}>{children}</CloseContext>
      </DialogContent>
    </Dialog>
  );
}
