"use client";

import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";

import { useActionFormState } from "./action-form";

interface FormComboboxProps {
  name: string;
  label: string;
  hint?: string | undefined;
  defaultValue?: string | undefined;
  options: readonly ComboboxOption[];
  placeholder?: string | undefined;
  searchPlaceholder: string;
  emptyText: string;
}

/** Searchable dropdown wired to the enclosing `ActionForm`, keyed by its value like `FormSelect`. */
export function FormCombobox({ name, label, hint, defaultValue, ...combobox }: FormComboboxProps) {
  const state = useActionFormState();
  const echoed = state.values?.[name];
  const value = typeof echoed === "string" ? echoed : defaultValue;
  const error = state.errors?.[name];
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <Combobox {...combobox} {...control} key={value} name={name} defaultValue={value} />
      )}
    </Field>
  );
}
