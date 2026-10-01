import "server-only";

import { and, asc, desc, eq, gt, gte, isNull, lt, type SQL, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { auditLogs, auditPurges, users } from "@/db/schema";

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

/** A half-open time window `[start, end)` of store-local days. */
export interface AuditWindow {
  start: Date;
  end: Date;
}

const inWindow = (window: AuditWindow) =>
  and(gte(auditLogs.createdAt, window.start), lt(auditLogs.createdAt, window.end));

export async function countAuditLogs(executor: Executor, window: AuditWindow) {
  const [row] = await executor
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(auditLogs)
    .where(inWindow(window));
  return row?.count ?? 0;
}

/** Entries of the window in id order, read in batches so exports stay bounded in memory. */
export async function* auditRows(window: AuditWindow, batchSize = 1000) {
  let after: string | null = null;
  for (;;) {
    const rows = await db
      .select({
        id: auditLogs.id,
        createdAt: auditLogs.createdAt,
        actorUsername: users.username,
        actorName: users.name,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        diff: auditLogs.diff,
        ip: auditLogs.ip,
        userAgent: auditLogs.userAgent,
        requestId: auditLogs.requestId,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(and(inWindow(window), after ? gt(auditLogs.id, after) : undefined))
      .orderBy(asc(auditLogs.id))
      .limit(batchSize);
    yield* rows;
    const last = rows.at(-1);
    if (rows.length < batchSize || !last) return;
    after = last.id;
  }
}

export async function insertAuditPurge(values: typeof auditPurges.$inferInsert) {
  const [row] = await db.insert(auditPurges).values(values).returning({ id: auditPurges.id });
  if (!row) throw new Error("Audit export insert returned no row");
  return row.id;
}

/** The latest export of exactly this range that has not been deleted yet, locked when in a transaction. */
export async function findOpenExport(
  executor: Executor,
  fromDate: string,
  toDate: string,
  lock = false,
) {
  const query = executor
    .select()
    .from(auditPurges)
    .where(
      and(
        eq(auditPurges.fromDate, fromDate),
        eq(auditPurges.toDate, toDate),
        isNull(auditPurges.purgedAt),
      ),
    )
    .orderBy(desc(auditPurges.exportedAt))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  return row;
}

/** Deletes the window's entries (FR-AUD-05). */
export async function deleteAuditLogs(executor: Executor, window: AuditWindow) {
  await executor.delete(auditLogs).where(inWindow(window));
}

export async function markPurged(executor: Executor, id: string, by: string, at: Date) {
  await executor
    .update(auditPurges)
    .set({ purgedAt: at, purgedBy: by })
    .where(eq(auditPurges.id, id));
}
