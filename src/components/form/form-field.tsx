"use client";

import type { ComponentProps } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { PasswordInput, type RevealLabels } from "@/components/ui/password-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, type SelectOption } from "@/components/ui/select";

import { useActionFormState } from "./action-form";

function useFieldState(name: string, defaultValue: string | undefined) {
  const state = useActionFormState();
  const echoed = state.values?.[name];
  return {
    error: state.errors?.[name],
    value: typeof echoed === "string" ? echoed : defaultValue,
  };
}

type FormFieldProps = Omit<ComponentProps<"input">, "name" | "id" | "defaultValue" | "value"> & {
  name: string;
  label: string;
  hint?: string | undefined;
  defaultValue?: string | undefined;
  /** Renders a password/PIN input with a show/hide toggle. */
  reveal?: RevealLabels | undefined;
  /** Renders a rupiah input grouped by thousands while typing. */
  money?: boolean | undefined;
};

/** Text input wired to the enclosing `ActionForm`'s errors and echoed values. */
export function FormField({
  name,
  label,
  hint,
  defaultValue,
  reveal,
  money,
  ...input
}: FormFieldProps) {
  const { error, value } = useFieldState(name, defaultValue);
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) =>
        money ? (
          <MoneyInput {...input} {...control} key={value ?? ""} name={name} defaultValue={value} />
        ) : reveal ? (
          <PasswordInput {...input} {...control} labels={reveal} name={name} defaultValue={value} />
        ) : (
          <Input {...input} {...control} name={name} defaultValue={value} />
        )
      }
    </Field>
  );
}

interface FormSelectProps {
  name: string;
  label: string;
  hint?: string | undefined;
  defaultValue?: string | undefined;
  options: readonly SelectOption[];
  placeholder?: string | undefined;
}

/**
 * Design-system dropdown wired to the enclosing `ActionForm`. It is keyed by
 * its value so an echoed value after a failed submit is shown again.
 */
export function FormSelect({
  name,
  label,
  hint,
  defaultValue,
  options,
  placeholder,
}: FormSelectProps) {
  const { error, value } = useFieldState(name, defaultValue);
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <Select
          {...control}
          key={value}
          name={name}
          defaultValue={value}
          options={options}
          placeholder={placeholder}
        />
      )}
    </Field>
  );
}

interface FormDateFieldProps {
  name: string;
  label: string;
  hint?: string | undefined;
  defaultValue?: string | undefined;
  min?: string | undefined;
  max?: string | undefined;
  clearable?: boolean | undefined;
}

/** Date picker wired to the enclosing `ActionForm`; posts `YYYY-MM-DD`. */
export function FormDateField({ name, label, hint, defaultValue, ...picker }: FormDateFieldProps) {
  const { error, value } = useFieldState(name, defaultValue);
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <DatePicker {...picker} {...control} key={value} name={name} defaultValue={value} />
      )}
    </Field>
  );
}

type FormCheckboxProps = Omit<
  ComponentProps<"input">,
  "name" | "id" | "type" | "defaultChecked"
> & {
  name: string;
  label: string;
  hint?: string | undefined;
  defaultChecked?: boolean | undefined;
};

/** Checkbox that keeps its submitted state after a failed save; posts `on` when checked. */
export function FormCheckbox({ name, label, hint, defaultChecked, ...input }: FormCheckboxProps) {
  const state = useActionFormState();
  const checked = state.values === undefined ? defaultChecked : state.values[name] === "on";
  const hintId = `${name}-hint`;
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-ink">
      <input
        {...input}
        type="checkbox"
        name={name}
        defaultChecked={checked}
        aria-describedby={hint ? hintId : undefined}
        className="mt-0.5 size-5 shrink-0 accent-primary"
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        {hint ? (
          <span id={hintId} className="text-xs text-ink-muted">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}
