"use client";

import { CalendarDays, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { DayPicker, type Matcher } from "react-day-picker";
import { enUS, id as idLocale } from "react-day-picker/locale";

import { cn } from "@/lib/utils/cn";

interface DatePickerProps {
  id?: string | undefined;
  /** Posts `YYYY-MM-DD` (or "" when empty) through a hidden input. */
  name?: string | undefined;
  /** Controlled `YYYY-MM-DD`; omit to let the picker keep its own state. */
  value?: string | undefined;
  defaultValue?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  /** Earliest and latest selectable days, `YYYY-MM-DD`. */
  min?: string | undefined;
  max?: string | undefined;
  /** Shows a clear button for optional dates. */
  clearable?: boolean | undefined;
  placeholder?: string | undefined;
  className?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | "true" | "false" | undefined;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local calendar date for a `YYYY-MM-DD` string, or undefined. */
function parseIso(value: string | undefined): Date | undefined {
  const match = value ? ISO.exec(value) : null;
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toIso(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Date field in the design system's style (FR-UI-01): a button showing the
 * date in the user's language that opens a keyboard-navigable calendar grid.
 * The value is a plain `YYYY-MM-DD`, so servers parse it as before; a pick
 * fires a bubbling `input` event on the hidden input like a native control
 * (ADR-0018).
 */
export function DatePicker({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  clearable,
  placeholder,
  className,
  ...aria
}: DatePickerProps) {
  const locale = useLocale();
  const t = useTranslations("Picker");
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const selected = parseIso(current);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const picked = useRef(false);
  const minDate = parseIso(min);
  const maxDate = parseIso(max);
  const initialMonth = selected ?? maxDate;

  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [current]);

  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form || value !== undefined) return;
    const reset = () => {
      setInner(defaultValue ?? "");
    };
    form.addEventListener("reset", reset);
    return () => {
      form.removeEventListener("reset", reset);
    };
  }, [defaultValue, value]);

  const change = (next: string) => {
    if (next !== current) picked.current = true;
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };
  const disabled: Matcher[] = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];
  const label = selected
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(selected)
    : (placeholder ?? t("chooseDate"));

  return (
    <div className={cn("relative", className)}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          id={id}
          type="button"
          {...aria}
          className={cn(
            "flex min-h-11 w-full items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 text-left text-sm",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-invalid:border-danger-ink",
            selected ? "text-ink" : "text-ink-muted",
            clearable && selected ? "pr-12" : "",
          )}
        >
          <span className="truncate">{label}</span>
          <CalendarDays className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-50 rounded-card border border-border bg-surface p-3 text-ink shadow-card"
          >
            <DayPicker
              mode="single"
              autoFocus
              locale={locale.startsWith("en") ? enUS : idLocale}
              selected={selected}
              {...(initialMonth ? { defaultMonth: initialMonth } : {})}
              disabled={disabled}
              {...(minDate ? { startMonth: minDate } : {})}
              {...(maxDate ? { endMonth: maxDate } : {})}
              onSelect={(date) => {
                change(date ? toIso(date) : "");
                setOpen(false);
              }}
              classNames={{
                root: "text-sm",
                months: "relative",
                month_caption: "flex h-9 items-center px-1 font-semibold",
                caption_label: "capitalize",
                nav: "absolute top-0 right-0 flex gap-1",
                button_previous:
                  "inline-flex size-9 items-center justify-center rounded-control hover:bg-surface-muted aria-disabled:opacity-40",
                button_next:
                  "inline-flex size-9 items-center justify-center rounded-control hover:bg-surface-muted aria-disabled:opacity-40",
                chevron: "size-4 fill-current",
                month_grid: "mt-2 border-collapse",
                weekdays: "",
                weekday: "size-10 text-xs font-medium text-ink-muted",
                week: "",
                day: "p-0 text-center",
                day_button:
                  "inline-flex size-10 items-center justify-center rounded-control tabular-nums hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary",
                selected:
                  "[&>button]:bg-primary [&>button]:text-primary-ink [&>button]:hover:bg-primary",
                today: "font-semibold text-primary",
                outside: "text-ink-muted opacity-60",
                disabled:
                  "opacity-40 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent",
                hidden: "invisible",
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {clearable && selected ? (
        <button
          type="button"
          aria-label={t("clear")}
          onClick={() => {
            change("");
          }}
          className="absolute inset-y-1 right-1 flex w-9 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
      {name ? <input ref={hiddenRef} type="hidden" name={name} value={current} /> : null}
    </div>
  );
}
