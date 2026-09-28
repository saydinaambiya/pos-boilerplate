"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ComponentProps,
  Fragment,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { useGlobalPending } from "@/components/feedback/loading-indicator";
import { Button } from "@/components/ui/button";

/** Input types whose every keystroke is debounced instead of applied at once. */
const TYPED = new Set(["text", "search"]);

interface FilterFormProps extends Omit<ComponentProps<"form">, "action" | "method" | "children"> {
  /** Label of the submit button that only renders without JavaScript. */
  applyLabel: string;
  /** Pause after the last keystroke before a search applies, in milliseconds. */
  delay?: number;
  children: ReactNode;
}

/**
 * GET filter form that applies itself (ADR-0018): a choice applies at once,
 * typing applies after a short pause and Enter applies immediately, all
 * without a button. Empty fields and the page number are dropped from the
 * URL, so a new filter starts at page one. The URL stays the source of
 * truth: when it changes from elsewhere (a reset link, the back button) the
 * fields remount with the new values. Without JavaScript it is a plain GET
 * form with a submit button.
 */
export function FilterForm({
  applyLabel,
  delay = 400,
  className,
  children,
  ...props
}: FilterFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pending, startTransition] = useTransition();
  useGlobalPending(pending);
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [fields, setFields] = useState({ search, applied: search, key: 0 });

  if (fields.search !== search) {
    setFields({
      search,
      applied: fields.applied,
      key: search === fields.applied ? fields.key : fields.key + 1,
    });
  }

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const apply = () => {
    clearTimeout(timer.current);
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
      if (typeof value === "string" && value !== "") params.append(name, value);
    }
    const query = params.toString();
    setFields((current) => ({ ...current, applied: query }));
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  return (
    <form
      {...props}
      ref={formRef}
      method="get"
      role="search"
      aria-busy={pending}
      className={className}
      onInput={(event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && TYPED.has(target.type)) {
          clearTimeout(timer.current);
          timer.current = setTimeout(apply, delay);
        } else {
          apply();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <Fragment key={fields.key}>{children}</Fragment>
      <noscript>
        <Button type="submit">{applyLabel}</Button>
      </noscript>
    </form>
  );
}
