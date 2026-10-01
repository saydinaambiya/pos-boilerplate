"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { cn } from "@/lib/utils/cn";

interface TableGroupProps {
  /** Accessible name of the toggle; also its tooltip. */
  toggleLabel: string;
  /** Shown inside the toggle next to the chevron; without it the toggle is icon-only. */
  toggleContent?: ReactNode;
  /** Shown after the toggle in the first cell. */
  lead?: ReactNode;
  /** Columns the first cell spans. */
  leadColSpan?: number;
  /** Remaining cells of the group's own row. */
  cells?: ReactNode;
  /** Whether the grouped rows start expanded; change the `key` with it to reapply it. */
  defaultOpen: boolean;
  className?: string;
  /** The grouped rows; without any the row has no toggle. */
  children?: ReactNode;
}

/**
 * A table row heading a collapsible set of rows, rendered as its own
 * `<tbody>` so a table can hold several groups (FR-PRD-04, FR-STK-08).
 */
export function TableGroup({
  toggleLabel,
  toggleContent,
  lead,
  leadColSpan,
  cells,
  defaultOpen,
  className,
  children,
}: TableGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const grouped = children !== undefined && children !== null && children !== false;
  return (
    <tbody id={id} className="border-b border-border last:border-0">
      <tr className={cn("hover:bg-surface-muted", className)}>
        <td colSpan={leadColSpan} className="px-3 py-2 align-middle text-ink">
          <span className="flex items-center gap-1">
            {grouped ? (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={id}
                aria-label={toggleContent ? undefined : toggleLabel}
                title={toggleLabel}
                onClick={() => {
                  setOpen((value) => !value);
                }}
                className={cn(
                  "-ml-2 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-control px-2 text-left text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  toggleContent ? "font-medium" : "justify-center",
                )}
              >
                <ChevronRight
                  aria-hidden="true"
                  className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")}
                />
                {toggleContent}
              </button>
            ) : (
              <span aria-hidden="true" className="-ml-2 inline-block w-11 shrink-0" />
            )}
            {lead}
          </span>
        </td>
        {cells}
      </tr>
      {grouped && open ? children : null}
    </tbody>
  );
}
