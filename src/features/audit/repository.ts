import "server-only";

import { and, asc, desc, eq, gte, lt, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLogs, users } from "@/db/schema";

export interface AuditQuery {
  actorId?: string;
  action?: string;
  from?: Date;
  until?: Date;
  /** Id of the last entry of the previous page; UUIDv7 ids sort by time. */
  before?: string;
  limit: number;
}

/**
 * One page of audit entries, newest first, with the actor's name joined in
 * (no N+1). Filters use the `(actor_id|action, created_at)` indexes.
 */
export async function queryAuditLogs(query: AuditQuery) {
  const conditions: SQL[] = [];
  if (query.actorId) conditions.push(eq(auditLogs.actorId, query.actorId));
  if (query.action) conditions.push(eq(auditLogs.action, query.action));
  if (query.from) conditions.push(gte(auditLogs.createdAt, query.from));
  if (query.until) conditions.push(lt(auditLogs.createdAt, query.until));
  if (query.before) conditions.push(lt(auditLogs.id, query.before));

  return db
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      diff: auditLogs.diff,
      ip: auditLogs.ip,
      userAgent: auditLogs.userAgent,
      requestId: auditLogs.requestId,
      actorId: auditLogs.actorId,
      actorName: users.name,
      actorUsername: users.username,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.id))
    .limit(query.limit);
}

/** Accounts that can appear as actors, for the filter menu. */
export async function listActors() {
  return db
    .select({ id: users.id, name: users.name, username: users.username })
    .from(users)
    .orderBy(asc(users.name));
}
