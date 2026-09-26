import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

import { toneClasses, type Tone } from "./tone";

type ChipProps = ComponentProps<"span"> & {
  tone?: Tone;
  /** Icon rendered before the label so status never relies on color alone. */
  icon?: ReactNode;
};

export function Chip({ tone = "neutral", icon, className, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium [&_svg]:size-3.5",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

type CountBadgeProps = ComponentProps<"span"> & { tone?: Tone; count: number };

/** Round counter used by status tabs, e.g. "5 New" in the reference design. */
export function CountBadge({ tone = "neutral", count, className, ...props }: CountBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
