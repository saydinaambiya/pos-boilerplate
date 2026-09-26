import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Horizontally scrollable on small screens so wide tables never overflow the
 * page. The scroll container takes keyboard focus so it can be scrolled
 * without a pointer (WCAG 2.1.1, axe `scrollable-region-focusable`).
 */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div
      tabIndex={0}
      className="w-full overflow-x-auto rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />
    </div>
  );
}

export function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return <caption className={cn("sr-only", className)} {...props} />;
}

export function TableHeader(props: ComponentProps<"thead">) {
  return <thead {...props} />;
}

export function TableBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn("border-b border-border last:border-0 hover:bg-surface-muted", className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("px-3 py-2.5 text-xs font-medium whitespace-nowrap text-ink-muted", className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-3 py-3 align-middle text-ink", className)} {...props} />;
}
