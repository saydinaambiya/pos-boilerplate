"use client";

import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { cn } from "@/lib/utils/cn";

import { Input } from "./input";

export interface RevealLabels {
  show: string;
  hide: string;
}

/**
 * Password or PIN input with a toggle that shows what was typed. The toggle
 * is a real button with a changing label and `aria-pressed`, so screen
 * readers announce the state.
 */
export function PasswordInput({
  labels,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { labels: RevealLabels }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-12", className)} />
      <button
        type="button"
        onClick={() => {
          setVisible((current) => !current);
        }}
        aria-pressed={visible}
        aria-label={visible ? labels.hide : labels.show}
        {...(props.id ? { "aria-controls": props.id } : {})}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-control text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
      >
        {visible ? (
          <EyeOff className="size-5" aria-hidden="true" />
        ) : (
          <Eye className="size-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
