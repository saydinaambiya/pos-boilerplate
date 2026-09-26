"use client";

import type { ComponentProps } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { useActionFormState } from "./action-form";

function useFieldState(name: string, defaultValue: string | undefined) {
  const state = useActionFormState();
  const echoed = state.values?.[name];
  return {
    error: state.errors?.[name],
    value: typeof echoed === "string" ? echoed : defaultValue,
  };
}

type FormFieldProps = Omit<ComponentProps<"input">, "name" | "id" | "defaultValue"> & {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
};

/** Text input wired to the enclosing `ActionForm`'s errors and echoed values. */
export function FormField({ name, label, hint, defaultValue, ...input }: FormFieldProps) {
  const { error, value } = useFieldState(name, defaultValue);
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => <Input {...input} {...control} name={name} defaultValue={value} />}
    </Field>
  );
}

type FormSelectProps = Omit<ComponentProps<"select">, "name" | "id" | "defaultValue"> & {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  options: readonly { value: string; label: string }[];
};

export function FormSelect({
  name,
  label,
  hint,
  defaultValue,
  options,
  ...select
}: FormSelectProps) {
  const { error, value } = useFieldState(name, defaultValue);
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <Select {...select} {...control} name={name} defaultValue={value}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
