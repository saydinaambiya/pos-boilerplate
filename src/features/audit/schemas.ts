import { z } from "zod";

import { auditActions } from "@/lib/audit/actions";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const fields = {
  actor: z.uuid(),
  action: z.enum(auditActions),
  from: isoDate,
  to: isoDate,
  cursor: z.uuid(),
};

export interface AuditFilters {
  actor?: string;
  action?: (typeof auditActions)[number];
  from?: string;
  to?: string;
  cursor?: string;
}

/**
 * Reads filters from the query string (FR-AUD-03). Each field is validated
 * on its own and dropped when invalid, so a bad link shows unfiltered
 * results instead of an error page.
 */
export function parseAuditFilters(
  searchParams: Record<string, string | string[] | undefined>,
): AuditFilters {
  const filters: Record<string, string> = {};
  for (const [name, schema] of Object.entries(fields)) {
    const raw = searchParams[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === "") continue;
    const parsed = schema.safeParse(value);
    if (parsed.success) filters[name] = parsed.data;
  }
  return filters;
}
