"use client";

import { useLocale } from "next-intl";
import { type ComponentProps, useEffect, useLayoutEffect, useRef, useState } from "react";

import { caretAfterDigits, formatRupiahDigits } from "@/lib/format/rupiah-input";

import { Input } from "./input";

type MoneyInputProps = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange"> & {
  /** Controlled text; formatted on display. Omit to let the input keep its own state. */
  value?: string;
  defaultValue?: string | undefined;
  onValueChange?: (formatted: string) => void;
};

/**
 * Rupiah amount input that groups thousands while typing ("1.500.000") and
 * keeps the caret next to the digit being edited. Posts the formatted text,
 * which `parseRupiah` accepts (PRD §5). A form reset restores the default.
 */
export function MoneyInput({ value, defaultValue, onValueChange, ref, ...props }: MoneyInputProps) {
  const locale = useLocale();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const [inner, setInner] = useState(() => formatRupiahDigits(defaultValue ?? "", locale));
  const shown = value === undefined ? inner : formatRupiahDigits(value, locale);

  useLayoutEffect(() => {
    if (caret.current === null || document.activeElement !== inputRef.current) return;
    inputRef.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || value !== undefined) return;
    const reset = () => {
      setInner(formatRupiahDigits(defaultValue ?? "", locale));
    };
    form.addEventListener("reset", reset);
    return () => {
      form.removeEventListener("reset", reset);
    };
  }, [defaultValue, locale, value]);

  return (
    <Input
      {...props}
      ref={(node) => {
        inputRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      inputMode="numeric"
      autoComplete="off"
      value={shown}
      onChange={(event) => {
        const raw = event.target.value;
        const digitsBefore = raw
          .slice(0, event.target.selectionStart ?? raw.length)
          .replace(/\D/g, "").length;
        const formatted = formatRupiahDigits(raw, locale);
        caret.current = caretAfterDigits(formatted, digitsBefore);
        if (value === undefined) setInner(formatted);
        onValueChange?.(formatted);
      }}
    />
  );
}
