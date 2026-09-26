import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-ink placeholder:text-ink-muted",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-ink",
        className,
      )}
      {...props}
    />
  );
}
