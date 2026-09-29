"use client";

import { Check, ChevronDown } from "lucide-react";
import { getNonce } from "get-nonce";
import { Select as SelectPrimitive } from "radix-ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils/cn";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  options: readonly SelectOption[];
  id?: string | undefined;
  /** Posts the value through a hidden input, for server actions and GET filters. */
  name?: string | undefined;
  /** Controlled value; omit to let the select keep its own state. */
  value?: string | undefined;
  defaultValue?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | "true" | "false" | undefined;
}

const subscribeNever = () => () => undefined;

/** The CSP nonce for the viewport's injected `<style>`, see `StyleNonce`. */
function nonceProps() {
  const nonce = getNonce();
  return nonce ? { nonce } : {};
}

/** Radix reserves "" for "no value", so empty option values are mapped to a sentinel. */
const EMPTY = "\u0000";
const toItem = (value: string) => (value === "" ? EMPTY : value);
const fromItem = (value: string) => (value === EMPTY ? "" : value);

/**
 * Dropdown in the design system's style (FR-UI-01): a labelled combobox
 * with a listbox of options, full keyboard support from Radix, and the
 * value posted through a hidden input. Until hydration a static button with
 * the same look is rendered: Radix emits inline `style` attributes during
 * server rendering, which the nonce CSP blocks (ADR-0003). A form reset
 * restores the default; a pick fires a bubbling `input` event on the hidden
 * input so forms can react like to a native control (ADR-0018).
 */
export function Select({
  options,
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled,
  className,
  ...aria
}: SelectProps) {
  const initial = defaultValue ?? options[0]?.value ?? "";
  const [inner, setInner] = useState(initial);
  const current = value ?? inner;
  const selected = options.find((option) => option.value === current);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const picked = useRef(false);
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const triggerClass = cn(
    "flex min-h-11 w-full items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 text-left text-sm text-ink",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-ink",
    selected ? "" : "text-ink-muted",
    className,
  );
  const display = (
    <>
      <span className="pointer-events-none truncate">{selected?.label ?? placeholder}</span>
      <ChevronDown className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
    </>
  );

  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [current]);

  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form || value !== undefined) return;
    const reset = () => {
      setInner(initial);
    };
    form.addEventListener("reset", reset);
    return () => {
      form.removeEventListener("reset", reset);
    };
  }, [initial, value]);

  const hidden = name ? <input ref={hiddenRef} type="hidden" name={name} value={current} /> : null;

  if (!hydrated) {
    return (
      <>
        <button type="button" id={id} {...aria} disabled className={triggerClass}>
          {display}
        </button>
        {hidden}
      </>
    );
  }

  return (
    <>
      <SelectPrimitive.Root
        value={toItem(current)}
        onValueChange={(next) => {
          const real = fromItem(next);
          if (real !== current) picked.current = true;
          if (value === undefined) setInner(real);
          onValueChange?.(real);
        }}
        {...(disabled === undefined ? {} : { disabled })}
      >
        <SelectPrimitive.Trigger id={id} {...aria} className={triggerClass}>
          {display}
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-control border border-border bg-surface text-ink shadow-card"
          >
            <SelectPrimitive.Viewport className="scrollbar-none p-1" {...nonceProps()}>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={toItem(option.value)}
                  {...(option.disabled ? { disabled: true } : {})}
                  className="relative flex min-h-11 cursor-pointer items-center rounded-control py-2 pr-3 pl-9 text-sm outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted"
                >
                  <SelectPrimitive.ItemIndicator className="absolute left-3 inline-flex">
                    <Check className="size-4 text-primary" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {hidden}
    </>
  );
}
