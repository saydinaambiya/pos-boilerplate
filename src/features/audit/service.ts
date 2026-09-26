import "server-only";

import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { startOfNextZonedDay, startOfZonedDay } from "@/lib/format/zoned-time";
import { readSetting } from "@/lib/settings/store";

import { listActors, queryAuditLogs } from "./repository";
import type { AuditFilters } from "./schemas";

export const AUDIT_PAGE_SIZE = 50;

/**
 * Read-only audit trail with filters (FR-AUD-03). There is intentionally no
 * update or delete counterpart anywhere in the codebase (FR-AUD-04).
 * Dates are calendar days in the store's time zone.
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
