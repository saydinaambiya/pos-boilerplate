"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Heading the option is listed under, e.g. a motif family. */
  group?: string | undefined;
  /** Swatch colour, rendered as an SVG `fill` so it stays CSP-safe (FR-VAR-03). */
  hex?: string | undefined;
}

interface ComboboxProps {
  options: readonly ComboboxOption[];
  id?: string | undefined;
  /** Posts the value through a hidden input, for server actions. */
  name?: string | undefined;
  value?: string | undefined;
  defaultValue?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  placeholder?: string | undefined;
  searchPlaceholder: string;
  emptyText: string;
  className?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | "true" | "false" | undefined;
}

function Swatch({ hex }: { hex: string }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill={hex} stroke="currentColor" strokeOpacity="0.25" />
    </svg>
  );
}

/**
 * Searchable dropdown in the design system's style (FR-UI-01): a trigger
 * like `Select`, and a popover with a search box that filters the options
 * by label or group, with arrow keys, Enter and Escape. Options may be
 * grouped under headings. The value posts through a hidden input and a pick
 * fires a bubbling `input` event, like `Select` (ADR-0018). The popover is
 * modal so its list scrolls inside dialogs, which lock scrolling elsewhere.
 */
export function Combobox({
  options,
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  className,
  ...aria
}: ComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const selected = options.find((option) => option.value === current);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const picked = useRef(false);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        (option.group?.toLowerCase().includes(needle) ?? false),
    );
  }, [options, query]);

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

  const choose = (option: ComboboxOption) => {
    if (option.value !== current) picked.current = true;
    if (value === undefined) setInner(option.value);
    onValueChange?.(option.value);
    setOpen(false);
  };

  const optionId = (index: number) => `${listId}-${String(index)}`;

  return (
    <>
      <Popover.Root
        modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setQuery("");
            setActive(
              Math.max(
                0,
                options.findIndex((option) => option.value === current),
              ),
            );
          }
        }}
      >
        <Popover.Trigger
          id={id}
          type="button"
          aria-haspopup="listbox"
          {...aria}
          className={cn(
            "flex min-h-11 w-full items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 text-left text-sm text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-invalid:border-danger-ink",
            selected || current ? "" : "text-ink-muted",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected?.hex ? <Swatch hex={selected.hex} /> : null}
            <span className="truncate">{selected?.label ?? (current || placeholder)}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-50 w-(--radix-popover-trigger-width) min-w-56 rounded-control border border-border bg-surface p-1 text-ink shadow-card"
          >
            <div className="flex items-center gap-2 border-b border-border px-2 pb-1">
              <Search className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <input
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-label={searchPlaceholder}
                aria-activedescendant={matches[active] ? optionId(active) : undefined}
                autoFocus
                value={query}
                placeholder={searchPlaceholder}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActive((index) => Math.min(index + 1, matches.length - 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActive((index) => Math.max(index - 1, 0));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    const option = matches[active];
                    if (option) choose(option);
                  }
                }}
                className="min-h-11 w-full bg-transparent text-sm outline-none placeholder:text-ink-muted"
              />
            </div>
            <ul
              id={listId}
              role="listbox"
              className="scrollbar-none max-h-72 overflow-y-auto overscroll-contain py-1"
            >
              {matches.length === 0 ? (
                <li role="presentation" className="px-3 py-2 text-sm text-ink-muted">
                  {emptyText}
                </li>
              ) : null}
              {matches.map((option, index) => {
                const heading =
                  option.group !== matches[index - 1]?.group ? option.group : undefined;
                return (
                  <li key={option.value} role="presentation">
                    {heading ? (
                      <p
                        role="presentation"
                        className="px-3 pt-2 pb-1 text-xs font-semibold text-ink-muted"
                      >
                        {heading}
                      </p>
                    ) : null}
                    <div
                      id={optionId(index)}
                      role="option"
                      aria-selected={option.value === current}
                      onPointerMove={() => {
                        setActive(index);
                      }}
                      onClick={() => {
                        choose(option);
                      }}
                      className={cn(
                        "relative flex min-h-11 cursor-pointer items-center gap-2 rounded-control py-2 pr-3 pl-9 text-sm select-none",
                        index === active && "bg-surface-muted",
                      )}
                    >
                      {option.value === current ? (
                        <Check className="absolute left-3 size-4 text-primary" aria-hidden="true" />
                      ) : null}
                      {option.hex ? <Swatch hex={option.hex} /> : null}
                      {option.label}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {name ? <input ref={hiddenRef} type="hidden" name={name} value={current} /> : null}
    </>
  );
}
