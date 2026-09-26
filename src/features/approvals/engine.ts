import "server-only";

import { and, eq } from "drizzle-orm";

import type { Permission } from "@/config/permissions";
import type { Executor } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { approvals, type approvalTypes } from "@/db/schema";
import { recordAudit } from "@/lib/audit/audit";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

export type ApprovalType = (typeof approvalTypes)[number];

/** Who may decide each kind of request (BR-21, PRD §2.2). */
export const decidePermission: Record<ApprovalType, Permission> = {
  VOID: "approval.void:decide",
  VOUCHER: "approval.voucher:decide",
  KASBON_PAYMENT: "approval.kasbon:decide",
};

export interface ApprovalRecord {
  id: string;
  type: ApprovalType;
  targetType: string;
  targetId: string;
  payload: unknown;
  requestedBy: string;
}

/**
 * Applies an approved request to its domain inside the decision's
 * transaction. Throw `ApprovalConflict` when the target changed and the
 * approval can no longer take effect; everything is rolled back.
 */
export type ApplyApproval = (
  executor: Executor,
  approval: ApprovalRecord,
  actor: { id: string },
  context: RequestContext,
) => Promise<void>;

/** Lets a domain react when a request is rejected or withdrawn, e.g. to close a draft. */
export type SettleApproval = (
  executor: Executor,
  approval: ApprovalRecord,
  outcome: "REJECTED" | "CANCELLED",
) => Promise<void>;

export interface ApprovalHandler {
  apply: ApplyApproval;
  settle?: SettleApproval;
}

export class ApprovalConflict extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ApprovalConflict";
  }
}

export interface SubmitInput {
  type: ApprovalType;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
}

/**
 * Files a request inside the caller's transaction (FR-APR-01). Requests by
 * the Owner are approved and applied immediately (FR-APR-03, BR-13). A
 * second pending request for the same target raises `ApprovalConflict`
 * with reason `already-pending`.
 */
export async function submitApproval(
  executor: Executor,
  session: Session,
  input: SubmitInput,
  context: RequestContext,
  apply: ApplyApproval,
): Promise<{ id: string; status: "PENDING" | "APPROVED" }> {
  const autoApprove = session.role.isSystem;
  let id: string;
  try {
    const [row] = await executor
      .insert(approvals)
      .values({
        ...input,
        requestedBy: session.user.id,
        status: autoApprove ? "APPROVED" : "PENDING",
        ...(autoApprove ? { decidedBy: session.user.id, decidedAt: new Date() } : {}),
      })
      .returning({ id: approvals.id });
    if (!row) throw new Error("Approval insert returned no row");
    id = row.id;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApprovalConflict("already-pending");
    throw error;
  }

  await recordAudit(
    executor,
    {
      actorId: session.user.id,
      action: autoApprove ? "approval.auto-approved" : "approval.requested",
      entity: "approval",
      entityId: id,
      diff: { type: input.type, targetId: input.targetId, ...input.payload },
    },
    context,
  );
  if (autoApprove) {
    await apply(
      executor,
      { id, ...input, requestedBy: session.user.id },
      { id: session.user.id },
      context,
    );
  }
  return { id, status: autoApprove ? "APPROVED" : "PENDING" };
}

/** The pending request for a target, if any (e.g. to show "void pending"). */
export async function findPendingApproval(
  executor: Executor,
  type: ApprovalType,
  targetId: string,
) {
  const [row] = await executor
    .select({
      id: approvals.id,
      requestedBy: approvals.requestedBy,
      createdAt: approvals.createdAt,
    })
    .from(approvals)
    .where(
      and(
        eq(approvals.type, type),
        eq(approvals.targetId, targetId),
        eq(approvals.status, "PENDING"),
      ),
    )
    .limit(1);
  return row;
}
