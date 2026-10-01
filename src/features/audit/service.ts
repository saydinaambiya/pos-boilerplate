import "server-only";

import { createHash } from "node:crypto";

import { db } from "@/db/client";
import { csvCell } from "@/features/reports/csv";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission, ForbiddenError } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { startOfNextZonedDay, startOfZonedDay, storeDate } from "@/lib/format/zoned-time";
import type { RequestContext } from "@/lib/http/request-context";
import { readSetting } from "@/lib/settings/store";

import {
  type AuditWindow,
  auditRows,
  countAuditLogs,
  deleteAuditLogs,
  findOpenExport,
  insertAuditPurge,
  listActors,
  markPurged,
  queryAuditLogs,
} from "./repository";
import type { AuditFilters } from "./schemas";

export const AUDIT_PAGE_SIZE = 50;

/**
 * Audit trail with filters (FR-AUD-03). Entries are never updated
 * (FR-AUD-04); the only delete is the purge below (FR-AUD-05). Dates are
 * calendar days in the store's time zone.
 */
export async function listAuditLogs(session: Session, filters: AuditFilters) {
  assertPermission(session, "audit:view");
  const { timeZone } = await readSetting("operations");
  const from = filters.from ? startOfZonedDay(filters.from, timeZone) : null;
  const until = filters.to ? startOfNextZonedDay(filters.to, timeZone) : null;
  const rows = await queryAuditLogs({
    ...(filters.actor ? { actorId: filters.actor } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(from ? { from } : {}),
    ...(until ? { until } : {}),
    ...(filters.cursor ? { before: filters.cursor } : {}),
    limit: AUDIT_PAGE_SIZE + 1,
  });
  const entries = rows.slice(0, AUDIT_PAGE_SIZE);
  const last = entries.at(-1);
  return {
    entries,
    nextCursor: rows.length > AUDIT_PAGE_SIZE && last ? last.id : null,
  };
}

export async function getAuditActors(session: Session) {
  assertPermission(session, "audit:view");
  return listActors();
}

/** Only the Owner exports and deletes audit entries (FR-AUD-05). */
function assertOwner(session: Session): void {
  assertPermission(session, "audit:view");
  if (!session.role.isSystem) throw new ForbiddenError("audit:view");
}

export interface PurgeRange {
  from: string;
  to: string;
  window: AuditWindow;
}

/**
 * A range of whole store-local days that ended before today: today's
 * entries can never be deleted (FR-AUD-05). Returns null otherwise.
 */
export async function purgeRange(from: string, to: string, now = new Date()) {
  const { timeZone } = await readSetting("operations");
  const start = startOfZonedDay(from, timeZone);
  const end = startOfNextZonedDay(to, timeZone);
  if (!start || !end || from > to || to >= storeDate(now, timeZone)) return null;
  return { from, to, window: { start, end } } satisfies PurgeRange;
}

/** Yesterday in the store's time zone: the last day that can be purged. */
export async function lastPurgeableDay(now = new Date()) {
  const { timeZone } = await readSetting("operations");
  const today = storeDate(now, timeZone);
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

/**
 * How many entries a range holds and whether its current contents were
 * exported, which unlocks the delete (FR-AUD-05).
 */
export async function getPurgeStatus(session: Session, range: PurgeRange) {
  assertOwner(session);
  const [count, exported] = await Promise.all([
    countAuditLogs(db, range.window),
    findOpenExport(db, range.from, range.to),
  ]);
  return {
    count,
    exportedAt: exported?.exportedAt ?? null,
    ready: exported?.rowCount === count && count > 0,
  };
}

const CSV_COLUMNS = [
  "id",
  "created_at",
  "actor_username",
  "actor_name",
  "action",
  "entity",
  "entity_id",
  "diff",
  "ip",
  "user_agent",
  "request_id",
] as const;

/**
 * Streams a range of the audit log as CSV without storing it. The SHA-256
 * and row count are computed while streaming; once the last row is sent the
 * export is recorded, so the range can then be deleted (FR-AUD-05).
 */
export function exportAuditRange(
  session: Session,
  range: PurgeRange,
  context: RequestContext,
): ReadableStream<Uint8Array> {
  assertOwner(session);
  const encoder = new TextEncoder();
  const hash = createHash("sha256");
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => {
        const bytes = encoder.encode(text);
        hash.update(bytes);
        controller.enqueue(bytes);
      };
      try {
        write(`${CSV_COLUMNS.join(",")}\r\n`);
        let rowCount = 0;
        for await (const row of auditRows(range.window)) {
          const cells = [
            row.id,
            row.createdAt.toISOString(),
            row.actorUsername,
            row.actorName,
            row.action,
            row.entity,
            row.entityId,
            row.diff === null ? null : JSON.stringify(row.diff),
            row.ip,
            row.userAgent,
            row.requestId,
          ];
          write(`${cells.map((cell) => csvCell(cell)).join(",")}\r\n`);
          rowCount += 1;
        }
        const checksum = hash.digest("hex");
        const exportId = await insertAuditPurge({
          fromDate: range.from,
          toDate: range.to,
          rowCount,
          checksum,
          exportedAt: new Date(),
          exportedBy: session.user.id,
        });
        await recordAudit(
          db,
          {
            actorId: session.user.id,
            action: "audit.exported",
            entity: "audit-purge",
            entityId: exportId,
            diff: { from: range.from, to: range.to, rowCount, checksum },
          },
          context,
        );
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

export type PurgeResult =
  { ok: true; deleted: number } | { ok: false; reason: "not-exported" | "changed" | "empty" };

/**
 * Deletes a past range of the audit log once its current contents were
 * exported (FR-AUD-05). The rows are counted again under the export's lock
 * and must match it; the purge itself is audited, on today's log.
 */
export async function purgeAuditRange(
  session: Session,
  range: PurgeRange,
  context: RequestContext,
): Promise<PurgeResult> {
  assertOwner(session);
  return db.transaction(async (tx) => {
    const exported = await findOpenExport(tx, range.from, range.to, true);
    if (!exported) return { ok: false, reason: "not-exported" } as const;
    const count = await countAuditLogs(tx, range.window);
    if (count === 0) return { ok: false, reason: "empty" } as const;
    if (count !== exported.rowCount) return { ok: false, reason: "changed" } as const;
    await deleteAuditLogs(tx, range.window);
    await markPurged(tx, exported.id, session.user.id, new Date());
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "audit.purged",
        entity: "audit-purge",
        entityId: exported.id,
        diff: {
          from: range.from,
          to: range.to,
          rowCount: count,
          checksum: exported.checksum,
        },
      },
      context,
    );
    return { ok: true, deleted: count } as const;
  });
}
