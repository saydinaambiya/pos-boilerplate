"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";

export interface ActionResult {
  status: "success" | "error";
  message: string;
}

/**
 * Outcome of an action in a dialog with an "Oke" button, so it is seen even
 * when the form is scrolled out of view (FR-UX-05). Focus returns to the
 * element that was focused before, per the dialog primitive.
 */
export function ResultDialog({
  result,
  onClose,
}: {
  result: ActionResult | null;
  onClose: () => void;
}) {
  const t = useTranslations("Feedback");
  const success = result?.status === "success";
  const Icon = success ? CircleCheck : CircleX;
  return (
    <Dialog
      open={result !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent closeLabel={t("close")} className="max-w-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <Icon
            className={cn("size-12", success ? "text-success-ink" : "text-danger-ink")}
            aria-hidden="true"
          />
          <DialogTitle>{success ? t("successTitle") : t("errorTitle")}</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {result?.message}
          </DialogDescription>
        </div>
        <DialogFooter>
          <Button autoFocus className="w-full" onClick={onClose}>
            {t("ok")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
