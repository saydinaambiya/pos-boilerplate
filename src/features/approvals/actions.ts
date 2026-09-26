"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import type { Locale } from "@/config/locales";
import { localeFromForm } from "@/i18n/form-locale";
import { requireSession } from "@/lib/auth/guard";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import type { FormState } from "@/lib/validation/form-state";
import { plainText } from "@/lib/validation/text";

import { cancelApproval, decideApproval, type DecisionResult } from "./service";

/** Bound arguments come back from the client, so they are re-validated. */
const boundArgs = z.object({
  id: z.uuid(),
  version: z.int().min(0),
  decision: z.enum(["approve", "reject"]).optional(),
});
const note = plainText(200, 0);

async function failure(
  result: Extract<DecisionResult, { ok: false }>,
  locale: Locale,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: "Approvals" });
  const messages = {
    stale: t("errors.stale"),
    "self-decision": t("errors.selfDecision"),
    forbidden: t("errors.forbidden"),
    "target-changed": t("errors.targetChanged"),
    "not-found": t("errors.notFound"),
  } as const;
  return { status: "error", message: messages[result.reason] };
}

/**
 * Approves or rejects a request; permission is checked per type in the
 * service (FR-APR-02). The page is refreshed by the client after the result
 * dialog opens, because the decided card leaves the inbox.
 */
export async function decideApprovalAction(
  approvalId: string,
  version: number,
  decision: "approve" | "reject",
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requireSession(locale);
  const args = boundArgs.safeParse({ id: approvalId, version, decision });
  const parsedNote = note.safeParse(formText(formData, "note"));
  if (!args.success || !args.data.decision || !parsedNote.success) {
    return failure({ ok: false, reason: "not-found" }, locale);
  }
  const result = await decideApproval(
    session,
    args.data.id,
    { decision: args.data.decision, note: parsedNote.data, version: args.data.version },
    await currentRequestContext(),
  );
  if (!result.ok) return failure(result, locale);
  const tf = await getTranslations({ locale, namespace: "Feedback" });
  return {
    status: "success",
    message: tf(args.data.decision === "approve" ? "approved" : "rejected"),
  };
}

/** Withdraws the caller's own pending request (FR-APR-04). */
export async function cancelApprovalAction(
  approvalId: string,
  version: number,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requireSession(locale);
  const args = boundArgs.safeParse({ id: approvalId, version });
  if (!args.success) return failure({ ok: false, reason: "not-found" }, locale);
  const result = await cancelApproval(
    session,
    args.data.id,
    args.data.version,
    await currentRequestContext(),
  );
  if (!result.ok) return failure(result, locale);
  const tf = await getTranslations({ locale, namespace: "Feedback" });
  return { status: "success", message: tf("cancelled") };
}
