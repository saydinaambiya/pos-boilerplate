import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/** Native select: accessible and usable before hydration. */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-ink",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-ink",
        className,
      )}
      {...props}
    />
  );
}
