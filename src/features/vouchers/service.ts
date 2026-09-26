import "server-only";

import { db, type Executor } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import {
  type ApplyApproval,
  ApprovalConflict,
  type SettleApproval,
  submitApproval,
} from "@/features/approvals/engine";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { startOfNextZonedDay, startOfZonedDay } from "@/lib/format/zoned-time";
import type { RequestContext } from "@/lib/http/request-context";
import type { VoucherRule } from "@/lib/money/calculate";
import { readSetting } from "@/lib/settings/store";

import {
  changeUsage,
  findRevisions,
  findVoucher,
  insertRevision,
  insertVoucher,
  listVouchers,
  lockVoucher,
  lockVoucherByCode,
  type RevisionTerms,
  setRevisionStatus,
  updateVoucherRow,
  voucherUsage,
} from "./repository";
import {
  type CreateVoucherInput,
  voucherApprovalPayload,
  voucherCode,
  type VoucherTermsInput,
} from "./schemas";
import { type DisplayStatus, displayStatusFor } from "./status";

export type { DisplayStatus };

export type VoucherResult =
  | { ok: true; id: string; status: "PENDING" | "APPROVED" }
  | { ok: false; reason: "not-found" | "code-taken" | "not-editable" | "already-pending" };

/** Voucher terms as the calculation expects them (PRD §5, BR-09). */
export function voucherRule(terms: RevisionTerms): VoucherRule {
  return terms.type === "PERCENT"
    ? {
        type: "percent",
        value: terms.value,
        minPurchase: terms.minPurchase,
        maxDiscount: terms.maxDiscount,
      }
    : { type: "amount", value: terms.value, minPurchase: terms.minPurchase };
}

async function toTerms(input: VoucherTermsInput): Promise<RevisionTerms> {
  const { timeZone } = await readSetting("operations");
  return {
    name: input.name,
    type: input.type,
    value: input.type === "PERCENT" ? input.value * 100 : input.value,
    minPurchase: input.minPurchase,
    maxDiscount: input.type === "PERCENT" ? input.maxDiscount : null,
    startsAt: input.startDate ? startOfZonedDay(input.startDate, timeZone) : null,
    endsAt: input.endDate ? startOfNextZonedDay(input.endDate, timeZone) : null,
    quota: input.quota,
  };
}

function snapshot(terms: RevisionTerms) {
  return { name: terms.name, type: terms.type, value: terms.value };
}

/**
 * Applies an approved voucher request (FR-VCH-02..04): a new voucher or
 * revision becomes the active terms, a reactivation turns the voucher back
 * on. Runs inside the approval's transaction.
 */
export const applyVoucherApproval: ApplyApproval = async (tx, approval, actor, context) => {
  const payload = voucherApprovalPayload.parse(approval.payload);
  const voucher = await lockVoucher(tx, approval.targetId);
  if (!voucher) throw new ApprovalConflict("not-found");

  if (payload.kind === "reactivate") {
    if (voucher.status !== "INACTIVE") throw new ApprovalConflict("not-inactive");
    await updateVoucherRow(tx, voucher.id, { status: "ACTIVE" });
  } else {
    await setRevisionStatus(tx, payload.revisionId, "APPROVED");
    await updateVoucherRow(tx, voucher.id, {
      activeRevisionId: payload.revisionId,
      ...(payload.kind === "create" ? { status: "ACTIVE" as const } : {}),
    });
  }
  await recordAudit(
    tx,
    {
      actorId: actor.id,
      action: payload.kind === "reactivate" ? "voucher.activated" : "voucher.revision-approved",
      entity: "voucher",
      entityId: voucher.id,
      diff: { code: voucher.code, kind: payload.kind },
    },
    context,
  );
};

/** Closes the draft of a rejected or withdrawn request; a rejected new voucher never goes live. */
export const settleVoucherApproval: SettleApproval = async (tx, approval, outcome) => {
  const payload = voucherApprovalPayload.parse(approval.payload);
  if (payload.kind === "reactivate") return;
  await setRevisionStatus(tx, payload.revisionId, outcome);
  if (payload.kind === "create")
    await updateVoucherRow(tx, approval.targetId, { status: "REJECTED" });
};

function conflictResult(error: unknown): VoucherResult | null {
  if (error instanceof ApprovalConflict) {
    return {
      ok: false,
      reason: error.reason === "already-pending" ? "already-pending" : "not-editable",
    };
  }
  if (isUniqueViolation(error)) return { ok: false, reason: "code-taken" };
  return null;
}

/** Proposes a new voucher; it goes live once approved (FR-VCH-02, BR-10). */
export async function createVoucher(
  session: Session,
  input: CreateVoucherInput,
  context: RequestContext,
): Promise<VoucherResult> {
  assertPermission(session, "voucher:request");
  const terms = await toTerms(input);
  const code = input.code.trim().toUpperCase();
  try {
    return await db.transaction(async (tx) => {
      const voucherId = await insertVoucher(tx, code);
      const revisionId = await insertRevision(tx, voucherId, session.user.id, terms);
      const submitted = await submitApproval(
        tx,
        session,
        {
          type: "VOUCHER",
          targetType: "voucher",
          targetId: voucherId,
          payload: { kind: "create", revisionId, code, ...snapshot(terms) },
        },
        context,
        applyVoucherApproval,
      );
      return { ok: true, id: voucherId, status: submitted.status } as const;
    });
  } catch (error) {
    const result = conflictResult(error);
    if (result) return result;
    throw error;
  }
}

/**
 * Proposes new terms; the active revision keeps applying until this one is
 * approved (FR-VCH-03).
 */
export async function reviseVoucher(
  session: Session,
  voucherId: string,
  input: VoucherTermsInput,
  context: RequestContext,
): Promise<VoucherResult> {
  assertPermission(session, "voucher:request");
  const voucher = await findVoucher(db, voucherId);
  if (!voucher) return { ok: false, reason: "not-found" };
  if (voucher.status !== "ACTIVE" && voucher.status !== "INACTIVE")
    return { ok: false, reason: "not-editable" };
  const terms = await toTerms(input);
  try {
    return await db.transaction(async (tx) => {
      const revisionId = await insertRevision(tx, voucherId, session.user.id, terms);
      const submitted = await submitApproval(
        tx,
        session,
        {
          type: "VOUCHER",
          targetType: "voucher",
          targetId: voucherId,
          payload: { kind: "revise", revisionId, code: voucher.code, ...snapshot(terms) },
        },
        context,
        applyVoucherApproval,
      );
      return { ok: true, id: voucherId, status: submitted.status } as const;
    });
  } catch (error) {
    const result = conflictResult(error);
    if (result) return result;
    throw error;
  }
}

/** Deactivation takes effect immediately (FR-VCH-04, BR-10). */
export async function deactivateVoucher(
  session: Session,
  voucherId: string,
  context: RequestContext,
): Promise<VoucherResult> {
  assertPermission(session, "voucher:request");
  return db.transaction(async (tx) => {
    const voucher = await lockVoucher(tx, voucherId);
    if (!voucher) return { ok: false, reason: "not-found" } as const;
    if (voucher.status !== "ACTIVE") return { ok: false, reason: "not-editable" } as const;
    await updateVoucherRow(tx, voucherId, { status: "INACTIVE" });
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "voucher.deactivated",
        entity: "voucher",
        entityId: voucherId,
        diff: { code: voucher.code },
      },
      context,
    );
    return { ok: true, id: voucherId, status: "APPROVED" } as const;
  });
}

/** Reactivation needs approval (FR-VCH-04, BR-10). */
export async function reactivateVoucher(
  session: Session,
  voucherId: string,
  context: RequestContext,
): Promise<VoucherResult> {
  assertPermission(session, "voucher:request");
  const voucher = await findVoucher(db, voucherId);
  if (!voucher) return { ok: false, reason: "not-found" };
  if (voucher.status !== "INACTIVE") return { ok: false, reason: "not-editable" };
  try {
    return await db.transaction(async (tx) => {
      const submitted = await submitApproval(
        tx,
        session,
        {
          type: "VOUCHER",
          targetType: "voucher",
          targetId: voucherId,
          payload: { kind: "reactivate", code: voucher.code },
        },
        context,
        applyVoucherApproval,
      );
      return { ok: true, id: voucherId, status: submitted.status } as const;
    });
  } catch (error) {
    const result = conflictResult(error);
    if (result) return result;
    throw error;
  }
}

export async function getVouchers(session: Session) {
  assertPermission(session, "page:vouchers");
  const now = new Date();
  return (await listVouchers()).map((row) => ({
    ...row,
    displayStatus: displayStatusFor(row.status, row.revisionId ? row : null, now),
  }));
}

export async function getVoucher(session: Session, voucherId: string) {
  assertPermission(session, "page:vouchers");
  const voucher = await findVoucher(db, voucherId);
  if (!voucher) return undefined;
  const [revisions, usage] = await Promise.all([findRevisions(voucherId), voucherUsage(voucherId)]);
  const active =
    revisions.find((revision) => revision.revisionId === voucher.activeRevisionId) ?? null;
  return {
    ...voucher,
    active,
    pending: revisions.find((revision) => revision.status === "PENDING_APPROVAL") ?? null,
    revisions,
    usage,
    displayStatus: displayStatusFor(voucher.status, active),
  };
}

export type VoucherCheck =
  | { ok: true; voucherId: string; code: string; name: string; rule: VoucherRule }
  | { ok: false; reason: "invalid" | "not-started" | "expired" | "quota" };

/**
 * Validates a code for a sale (FR-POS-03): active, inside its period and
 * under quota. With `lock`, the voucher row stays locked until the checkout
 * commits so the quota cannot be overrun concurrently.
 */
export async function resolveVoucher(
  executor: Executor,
  rawCode: string,
  now = new Date(),
): Promise<VoucherCheck> {
  const code = voucherCode.safeParse(rawCode);
  if (!code.success) return { ok: false, reason: "invalid" };
  const voucher = await lockVoucherByCode(executor, code.data);
  if (
    voucher?.status !== "ACTIVE" ||
    !voucher.revisionId ||
    !voucher.type ||
    voucher.value === null ||
    !voucher.name
  ) {
    return { ok: false, reason: "invalid" };
  }
  const terms: RevisionTerms = {
    name: voucher.name,
    type: voucher.type,
    value: voucher.value,
    minPurchase: voucher.minPurchase,
    maxDiscount: voucher.maxDiscount,
    startsAt: voucher.startsAt,
    endsAt: voucher.endsAt,
    quota: voucher.quota,
  };
  const status = displayStatusFor("ACTIVE", terms, now);
  if (status === "EXPIRED") return { ok: false, reason: "expired" };
  if (status === "SCHEDULED") return { ok: false, reason: "not-started" };
  if (terms.quota !== null && voucher.usageCount >= terms.quota)
    return { ok: false, reason: "quota" };
  return {
    ok: true,
    voucherId: voucher.id,
    code: voucher.code,
    name: terms.name,
    rule: voucherRule(terms),
  };
}

/** Preview for the POS terminal; the checkout re-validates under lock. */
export async function previewVoucher(session: Session, rawCode: string): Promise<VoucherCheck> {
  assertPermission(session, "page:pos");
  return db.transaction((tx) => resolveVoucher(tx, rawCode));
}

/** Counts one use, inside the checkout transaction. */
export async function consumeVoucher(executor: Executor, voucherId: string): Promise<void> {
  await changeUsage(executor, voucherId, 1);
}

/** Gives the use back when a sale is voided. */
export async function releaseVoucher(executor: Executor, voucherId: string): Promise<void> {
  await changeUsage(executor, voucherId, -1);
}
