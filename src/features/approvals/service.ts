import "server-only";

import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { approvals, users } from "@/db/schema";
import { recordAudit } from "@/lib/audit/audit";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

import {
  type ApprovalRecord,
  ApprovalConflict,
  type ApprovalType,
  decidePermission,
} from "./engine";
import { approvalHandlers } from "./registry";

export type DecisionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not-found" | "forbidden" | "self-decision" | "stale" | "target-changed";
    };

/** Types the viewer may decide (FR-APR-02). */
export function decidableTypes(session: Session): ApprovalType[] {
  return (Object.keys(decidePermission) as ApprovalType[]).filter((type) =>
    session.permissions.has(decidePermission[type]),
  );
}

const columns = {
  id: approvals.id,
  type: approvals.type,
  targetType: approvals.targetType,
  targetId: approvals.targetId,
  payload: approvals.payload,
  status: approvals.status,
  version: approvals.version,
  note: approvals.note,
  createdAt: approvals.createdAt,
  decidedAt: approvals.decidedAt,
  requestedBy: approvals.requestedBy,
  requesterName: users.name,
  deciderName: sql<
    string | null
  >`(select d.name from ${users} d where d.id = ${approvals.decidedBy})`,
};

export type ApprovalRow = Awaited<ReturnType<typeof getMyRequests>>[number];

/** Pending requests the viewer can decide, oldest first; own requests excluded (FR-APR-03). */
export async function getInbox(session: Session): Promise<ApprovalRow[]> {
  const types = decidableTypes(session);
  if (types.length === 0) return [];
  return db
    .select(columns)
    .from(approvals)
    .innerJoin(users, eq(users.id, approvals.requestedBy))
    .where(
      and(
        eq(approvals.status, "PENDING"),
        inArray(approvals.type, types),
        ne(approvals.requestedBy, session.user.id),
      ),
    )
    .orderBy(asc(approvals.createdAt))
    .limit(200);
}

/** The viewer's own recent requests with their outcome. */
export async function getMyRequests(session: Session) {
  return db
    .select(columns)
    .from(approvals)
    .innerJoin(users, eq(users.id, approvals.requestedBy))
    .where(eq(approvals.requestedBy, session.user.id))
    .orderBy(desc(approvals.createdAt))
    .limit(50);
}

/** Badge count for navigation and dashboard (FR-APR-02). */
export async function countPendingForViewer(session: Session): Promise<number> {
  const types = decidableTypes(session);
  if (types.length === 0) return 0;
  const [row] = await db
    .select({ total: count() })
    .from(approvals)
    .where(
      and(
        eq(approvals.status, "PENDING"),
        inArray(approvals.type, types),
        ne(approvals.requestedBy, session.user.id),
      ),
    );
  return row?.total ?? 0;
}

/**
 * Approves or rejects a pending request (FR-APR-01..05). The update is
 * conditional on the version the decider saw, so two approvers cannot both
 * decide; the domain change is applied in the same transaction.
 */
export async function decideApproval(
  session: Session,
  approvalId: string,
  input: { decision: "approve" | "reject"; note: string; version: number },
  context: RequestContext,
): Promise<DecisionResult> {
  const [current] = await db.select().from(approvals).where(eq(approvals.id, approvalId)).limit(1);
  if (!current) return { ok: false, reason: "not-found" };
  if (!session.permissions.has(decidePermission[current.type]))
    return { ok: false, reason: "forbidden" };
  if (current.requestedBy === session.user.id) return { ok: false, reason: "self-decision" };
  if (current.status !== "PENDING") return { ok: false, reason: "stale" };

  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(approvals)
        .set({
          status: input.decision === "approve" ? "APPROVED" : "REJECTED",
          decidedBy: session.user.id,
          decidedAt: new Date(),
          note: input.note === "" ? null : input.note,
          version: sql`${approvals.version} + 1`,
        })
        .where(
          and(
            eq(approvals.id, approvalId),
            eq(approvals.status, "PENDING"),
            eq(approvals.version, input.version),
          ),
        )
        .returning({ id: approvals.id });
      if (!updated) return { ok: false, reason: "stale" } as const;

      const handler = approvalHandlers[current.type];
      if (!handler) throw new Error(`No handler registered for ${current.type}`);
      const record: ApprovalRecord = { ...current };
      if (input.decision === "approve")
        await handler.apply(tx, record, { id: session.user.id }, context);
      else await handler.settle?.(tx, record, "REJECTED");
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: input.decision === "approve" ? "approval.approved" : "approval.rejected",
          entity: "approval",
          entityId: approvalId,
          diff: { type: current.type, targetId: current.targetId, note: input.note },
        },
        context,
      );
      return { ok: true } as const;
    });
  } catch (error) {
    if (error instanceof ApprovalConflict) return { ok: false, reason: "target-changed" };
    throw error;
  }
}

/** The requester withdraws a pending request (FR-APR-04). */
export async function cancelApproval(
  session: Session,
  approvalId: string,
  version: number,
  context: RequestContext,
): Promise<DecisionResult> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(approvals)
      .set({ status: "CANCELLED", version: sql`${approvals.version} + 1` })
      .where(
        and(
          eq(approvals.id, approvalId),
          eq(approvals.requestedBy, session.user.id),
          eq(approvals.status, "PENDING"),
          eq(approvals.version, version),
        ),
      )
      .returning();
    if (!updated) return { ok: false, reason: "stale" } as const;
    await approvalHandlers[updated.type]?.settle?.(tx, updated, "CANCELLED");
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "approval.cancelled",
        entity: "approval",
        entityId: approvalId,
        diff: { type: updated.type },
      },
      context,
    );
    return { ok: true } as const;
  });
}
