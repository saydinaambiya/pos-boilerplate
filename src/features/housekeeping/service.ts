import "server-only";

import { createHash } from "node:crypto";

import { Zip, ZipDeflate } from "fflate";

import { db } from "@/db/client";
import { csvCell } from "@/features/reports/csv";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { startOfZonedDay, storeDate } from "@/lib/format/zoned-time";
import type { RequestContext } from "@/lib/http/request-context";
import { readSetting } from "@/lib/settings/store";

import { addMonths, archivableMonths, isMonth, latestArchivableMonth } from "./months";
import {
  archiveEntities,
  columnKeys,
  countEntity,
  earliestDataMonth,
  entityRows,
  listBatches,
  lockBatch,
  markEntity,
  type MonthWindow,
  monthlyCounts,
  setBatchArchived,
  upsertExportedBatch,
} from "./repository";

/** Months listed on the page; older ones stay reachable by URL. */
const LISTED_MONTHS = 36;

export type ArchiveResult =
  | { ok: true }
  | { ok: false; reason: "not-archivable" | "not-exported" | "changed" | "already-archived" };

async function monthContext(now: Date) {
  const operations = await readSetting("operations");
  const today = storeDate(now, operations.timeZone);
  return {
    timeZone: operations.timeZone,
    retentionMonths: operations.housekeepingRetentionMonths,
    latest: latestArchivableMonth(today, operations.housekeepingRetentionMonths),
  };
}

function windowOf(month: string, timeZone: string): MonthWindow {
  const start = startOfZonedDay(`${month}-01`, timeZone);
  const end = startOfZonedDay(`${addMonths(month, 1)}-01`, timeZone);
  if (!start || !end) throw new Error(`Invalid month ${month}`);
  return { start, end };
}

/** Whether `month` is a valid month old enough to archive (FR-HK-01). */
export async function isArchivableMonth(month: string, now = new Date()) {
  if (!isMonth(month)) return false;
  return month <= (await monthContext(now)).latest;
}

/**
 * Archivable months with their volume and batch state (FR-HK-01, FR-HK-06):
 * not exported, exported (downloadable, can be marked) or archived.
 */
export async function getHousekeeping(session: Session, now = new Date()) {
  assertPermission(session, "page:housekeeping");
  const context = await monthContext(now);
  const months = archivableMonths(
    await earliestDataMonth(context.timeZone),
    context.latest,
    LISTED_MONTHS,
  );
  if (months.length === 0) return { ...context, months: [] };

  const oldest = months[months.length - 1] ?? context.latest;
  const [counts, batches] = await Promise.all([
    monthlyCounts(
      context.timeZone,
      windowOf(oldest, context.timeZone).start,
      windowOf(context.latest, context.timeZone).end,
    ),
    listBatches(),
  ]);
  const byMonth = new Map(batches.map((batch) => [batch.month, batch]));
  return {
    ...context,
    months: months.map((month) => {
      const batch = byMonth.get(month);
      return {
        month,
        sales: counts.salesByMonth.get(month) ?? 0,
        orders: counts.ordersByMonth.get(month) ?? 0,
        movements: counts.movementsByMonth.get(month) ?? 0,
        exportedAt: batch?.exportedAt ?? null,
        archivedAt: batch?.archivedAt ?? null,
        rowCounts: batch?.rowCounts ?? null,
      };
    }),
  };
}

function cellValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

const snakeCase = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/**
 * Streams a month's archive as a ZIP with one CSV per entity and a
 * `manifest.json`, never storing it (FR-HK-02, FR-HK-07). Each CSV's
 * SHA-256 and row count are computed while streaming; once the last byte is
 * sent, the batch is recorded so the month can be marked (FR-HK-03).
 * Already archived months can be downloaded again (FR-HK-06).
 */
export async function exportMonthArchive(
  session: Session,
  month: string,
  requestContext: RequestContext,
  now = new Date(),
): Promise<ReadableStream<Uint8Array> | null> {
  assertPermission(session, "page:housekeeping");
  if (!(await isArchivableMonth(month, now))) return null;
  const { timeZone } = await monthContext(now);
  const window = windowOf(month, timeZone);
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error) {
          controller.error(error);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        const rowCounts: Record<string, number> = {};
        const checksums: Record<string, string> = {};
        for (const entity of archiveEntities) {
          const file = new ZipDeflate(entity.file, { level: 6 });
          zip.add(file);
          const hash = createHash("sha256");
          const write = (text: string) => {
            const bytes = encoder.encode(text);
            hash.update(bytes);
            file.push(bytes, false);
          };
          const keys = columnKeys(entity);
          write(`${keys.map((key) => csvCell(snakeCase(key))).join(",")}\r\n`);
          let count = 0;
          for await (const row of entityRows(entity, window)) {
            write(`${keys.map((key) => csvCell(cellValue(row[key]))).join(",")}\r\n`);
            count += 1;
          }
          file.push(new Uint8Array(0), true);
          rowCounts[entity.file] = count;
          checksums[entity.file] = hash.digest("hex");
        }

        const manifest = new ZipDeflate("manifest.json", { level: 6 });
        zip.add(manifest);
        manifest.push(
          encoder.encode(
            JSON.stringify(
              { month, timeZone, exportedAt: new Date().toISOString(), rowCounts, checksums },
              null,
              2,
            ),
          ),
          true,
        );

        const batchId = await upsertExportedBatch({
          month,
          rowCounts,
          checksums,
          exportedBy: session.user.id,
        });
        await recordAudit(
          db,
          {
            actorId: session.user.id,
            action: "housekeeping.exported",
            entity: "archive-batch",
            entityId: batchId,
            diff: { month, rowCounts },
          },
          requestContext,
        );
        zip.end();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Marks a month's rows as archived after its export (FR-HK-03). The rows are
 * counted again and must match the last export, otherwise the owner has to
 * download again first. Unsettled store credit is never marked (FR-HK-05).
 */
export async function archiveMonth(
  session: Session,
  month: string,
  requestContext: RequestContext,
  now = new Date(),
): Promise<ArchiveResult> {
  assertPermission(session, "page:housekeeping");
  if (!(await isArchivableMonth(month, now))) return { ok: false, reason: "not-archivable" };
  const { timeZone } = await monthContext(now);
  const window = windowOf(month, timeZone);

  return db.transaction(async (tx) => {
    const batch = await lockBatch(tx, month);
    if (!batch) return { ok: false, reason: "not-exported" } as const;
    if (batch.archivedAt) return { ok: false, reason: "already-archived" } as const;
    for (const entity of archiveEntities) {
      if ((await countEntity(tx, entity, window)) !== (batch.rowCounts[entity.file] ?? 0)) {
        return { ok: false, reason: "changed" } as const;
      }
    }
    const at = new Date();
    for (const entity of archiveEntities) await markEntity(tx, entity, window, batch.id, at);
    await setBatchArchived(tx, batch.id, session.user.id, at);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "housekeeping.archived",
        entity: "archive-batch",
        entityId: batch.id,
        diff: { month, rowCounts: batch.rowCounts },
      },
      requestContext,
    );
    return { ok: true } as const;
  });
}
