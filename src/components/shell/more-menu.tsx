"use client";

import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";

interface MoreMenuProps {
  label: string;
  closeLabel: string;
  triggerClassName?: string;
  children: ReactNode;
}

/**
 * Mobile drawer holding secondary navigation. Closes itself when a link
 * inside it is followed so the next page is not hidden behind the sheet.
 */
export function MoreMenu({ label, closeLabel, triggerClassName, children }: MoreMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(triggerClassName)}>
        <Menu className="size-5" aria-hidden="true" />
        <span>{label}</span>
      </DialogTrigger>
      <DialogContent side="bottom" closeLabel={closeLabel} aria-describedby={undefined}>
        <DialogTitle>{label}</DialogTitle>
        <div
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
