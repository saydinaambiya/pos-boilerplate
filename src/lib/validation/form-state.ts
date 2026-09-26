import type { z } from "zod";

/**
 * State shared by every `useActionState` form (FR-UX-05). Messages are
 * translated on the server; `values` echoes the submission so inputs keep
 * what the user typed after a failed attempt.
 */
export interface FormState {
  status?: "error" | "success";
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string | string[]>;
}

export type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;

export type ValidationMessage =
  "required" | "tooShort" | "tooLong" | "tooSmall" | "tooBig" | "invalid" | "phone";

type Translate = (message: ValidationMessage, values?: { min?: number; max?: number }) => string;

function messageFor(issue: z.core.$ZodIssue, translate: Translate): string {
  if (issue.code === "too_small") {
    const min = Number(issue.minimum);
    if (issue.origin !== "string") return translate("tooSmall", { min });
    return min <= 1 ? translate("required") : translate("tooShort", { min });
  }
  if (issue.code === "too_big") {
    const max = Number(issue.maximum);
    return translate(issue.origin === "string" ? "tooLong" : "tooBig", { max });
  }
  if (issue.code === "custom" && (issue.message === "required" || issue.message === "phone"))
    return translate(issue.message);
  return translate("invalid");
}

/** Maps Zod issues to one translated message per top-level field. */
export function fieldErrors(error: z.ZodError, translate: Translate): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= messageFor(issue, translate);
  }
  return errors;
}

/** Text values of a submission, for echoing back into the form. */
export function submittedValues(
  formData: FormData,
  names: readonly string[],
): Record<string, string | string[]> {
  return Object.fromEntries(
    names.map((name) => {
      const all = formData
        .getAll(name)
        .filter((value): value is string => typeof value === "string");
      return [name, all.length > 1 ? all : (all[0] ?? "")];
    }),
  );
}
