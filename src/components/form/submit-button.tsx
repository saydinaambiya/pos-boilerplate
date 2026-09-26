"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";

/** Submit button that disables itself while its form is pending. */
export function SubmitButton({ disabled, ...props }: Omit<ButtonProps, "type" | "asChild">) {
  const { pending } = useFormStatus();
  return <Button {...props} type="submit" disabled={pending || disabled} aria-busy={pending} />;
}
