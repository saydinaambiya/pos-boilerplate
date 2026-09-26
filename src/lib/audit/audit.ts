import "server-only";

import type { Executor } from "@/db/client";
import { auditLogs } from "@/db/schema";
import type { RequestContext } from "@/lib/http/request-context";

import { maskSensitive } from "./mask";

/** Audit actions; extend as modules land (PRD FR-AUD-02). */
export type AuditAction =
  | "auth.login.succeeded"
  | "auth.login.failed"
  | "auth.login.locked"
  | "auth.logout"
  | "auth.pin.changed";

export interface AuditEntry {
  actorId: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  diff?: Record<string, unknown>;
}

/**
 * Appends one audit entry. Pass the surrounding transaction so the entry
 * commits or rolls back with the change it describes (NFR-REL-01).
 */
export async function recordAudit(
  executor: Executor,
  entry: AuditEntry,
  context: RequestContext,
): Promise<void> {
  await executor.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    diff: entry.diff === undefined ? null : maskSensitive(entry.diff),
    ip: context.ip,
    userAgent: context.userAgent,
    requestId: context.requestId,
  });
}
