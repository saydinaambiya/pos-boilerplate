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

export type ValidationMessage = "required" | "tooLong" | "invalid";

/** Maps Zod issues to one translated message per top-level field. */
export function fieldErrors(
  error: z.ZodError,
  translate: (message: ValidationMessage, values?: { max: number }) => string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (field in errors) continue;
    if (issue.code === "too_small") errors[field] = translate("required");
    else if (issue.code === "too_big")
      errors[field] = translate("tooLong", { max: Number(issue.maximum) });
    else errors[field] = translate("invalid");
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
