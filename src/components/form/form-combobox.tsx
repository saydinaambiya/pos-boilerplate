"use client";

import { useRef, useState } from "react";

import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { useActionFormState } from "./action-form";

/** Value of the "Other" option; it never posts, the typed text does. */
const OTHER = "\u0000other";

interface OtherChoice {
  /** Label of the "Other" option. */
  label: string;
  /** Accessible label and placeholder of the text box. */
  inputLabel: string;
  maxLength: number;
}

interface FormComboboxProps {
  name: string;
  label: string;
  hint?: string | undefined;
  defaultValue?: string | undefined;
  options: readonly ComboboxOption[];
  placeholder?: string | undefined;
  searchPlaceholder: string;
  emptyText: string;
  /** Adds an "Other" option with a text box; a value outside the list opens it prefilled. */
  other?: OtherChoice | undefined;
}

/** Searchable dropdown wired to the enclosing `ActionForm`, keyed by its value like `FormSelect`. */
export function FormCombobox({
  name,
  label,
  hint,
  defaultValue,
  other,
  ...combobox
}: FormComboboxProps) {
  const state = useActionFormState();
  const echoed = state.values?.[name];
  const value = typeof echoed === "string" ? echoed : defaultValue;
  const error = state.errors?.[name];
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) =>
        other ? (
          <ComboboxWithOther
            {...combobox}
            {...control}
            key={value}
            name={name}
            defaultValue={value ?? ""}
            other={other}
          />
        ) : (
          <Combobox {...combobox} {...control} key={value} name={name} defaultValue={value} />
        )
      }
    </Field>
  );
}

type ComboboxWithOtherProps = Omit<FormComboboxProps, "label" | "hint" | "other"> & {
  id: string;
  defaultValue: string;
  other: OtherChoice;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * The list plus "Other": picking it shows a text box that posts under the
 * field's name instead of the list's hidden input. The server validates the
 * typed text like any free text (NFR-SEC-04).
 */
function ComboboxWithOther({
  options,
  name,
  defaultValue,
  other,
  ...combobox
}: ComboboxWithOtherProps) {
  const listed = defaultValue === "" || options.some((option) => option.value === defaultValue);
  const [choice, setChoice] = useState(listed ? defaultValue : OTHER);
  const input = useRef<HTMLInputElement>(null);
  const isOther = choice === OTHER;
  return (
    <div className="flex flex-col gap-2">
      <Combobox
        {...combobox}
        options={[...options, { value: OTHER, label: other.label, pinned: true }]}
        value={choice}
        onValueChange={setChoice}
        focusAfterPick={(next) => (next === OTHER ? input.current : null)}
      />
      {isOther ? (
        <Input
          name={name}
          aria-label={other.inputLabel}
          placeholder={other.inputLabel}
          defaultValue={listed ? "" : defaultValue}
          maxLength={other.maxLength}
          autoComplete="off"
          ref={input}
          aria-invalid={combobox["aria-invalid"]}
        />
      ) : (
        <input type="hidden" name={name} value={choice} />
      )}
    </div>
  );
}
