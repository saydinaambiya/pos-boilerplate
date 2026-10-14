import "server-only";

import { z } from "zod";

import { saleStatuses } from "@/db/schema";
import { seesEveryConsignment } from "@/features/consignments/access";
import { listSalespeople } from "@/features/consignments/repository";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { startOfNextZonedDay, startOfZonedDay, storeDate } from "@/lib/format/zoned-time";
import { readSetting } from "@/lib/settings/store";

import { listSellingCashiers, querySales, summarizeSales } from "./repository";

export const SALE_PAGE_SIZE = 50;

export const saleHistoryMethods = ["CASH", "TRANSFER", "QRIS", "KASBON"] as const;

/** Query string of the transaction history (FR-POS-13, FR-HK-04). */
export const saleHistoryQuery = z.object({
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  q: z.string().trim().max(40).catch(""),
  cashier: z.uuid().optional().catch(undefined),
  method: z.enum(saleHistoryMethods).optional().catch(undefined),
  status: z.enum(saleStatuses).optional().catch(undefined),
  archived: z.literal("1").optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});
export type SaleHistoryQuery = z.infer<typeof saleHistoryQuery>;

/** Store-day range of a history query: today by default, swapped if reversed. */
async function historyRange(
  query: { from?: string | undefined; to?: string | undefined },
  now: Date,
) {
  const { timeZone } = await readSetting("operations");
  const today = storeDate(now, timeZone);
  const first = query.from ?? today;
  const last = query.to ?? (first > today ? first : today);
  const [from, to] = first <= last ? [first, last] : [last, first];
  const start = startOfZonedDay(from, timeZone);
  const end = startOfNextZonedDay(to, timeZone);
  if (!start || !end) throw new Error("Invalid sale history range");
  return { today, from, to, start, end };
}

/**
 * Transaction history (FR-POS-13): sales in a store-day range, newest first,
 * searchable by invoice number and filterable by cashier, payment method
 * and status. Cashiers only see their own sales; `report:view` holders see
 * everyone's (NFR-SEC-07). Archived sales are hidden unless asked for
 * (FR-HK-04).
 */
export async function listSales(session: Session, query: SaleHistoryQuery, now = new Date()) {
  assertPermission(session, "page:pos");
  const { today, from, to, start, end } = await historyRange(query, now);
  const seesAll = session.permissions.has("report:view");
  const filters = {
    start,
    end,
    cashierId: seesAll ? (query.cashier ?? null) : session.user.id,
    invoice: query.q,
    method: query.method,
    status: query.status,
    includeArchived: query.archived === "1",
  };
  const [rows, summary, cashiers] = await Promise.all([
    querySales(filters, query.page, SALE_PAGE_SIZE),
    summarizeSales(filters),
    seesAll ? listSellingCashiers() : Promise.resolve([]),
  ]);
  return {
    from,
    to,
    today,
    seesAll,
    cashiers,
    summary,
    sales: rows.slice(0, SALE_PAGE_SIZE),
    hasNextPage: rows.length > SALE_PAGE_SIZE,
  };
}

/** Query string of the salespeople's transaction history (FR-CSG-10). */
export const consignmentSaleQuery = saleHistoryQuery
  .omit({ cashier: true })
  .extend({ salesperson: z.uuid().optional().catch(undefined) });
export type ConsignmentSaleQuery = z.infer<typeof consignmentSaleQuery>;

/**
 * Salespeople's transaction history (FR-CSG-10): the sales recorded for goods
 * they carried, with the same range, invoice, method and status filters as
 * the cashier's history. A salesperson only sees their own; pickup and
 * return staff see everyone's and can pick one salesperson.
 */
export async function listConsignmentSales(
  session: Session,
  query: ConsignmentSaleQuery,
  now = new Date(),
) {
  assertPermission(session, "page:consignments");
  const { today, from, to, start, end } = await historyRange(query, now);
  const seesAll = seesEveryConsignment(session);
  const filters = {
    start,
    end,
    cashierId: null,
    consignment: { salespersonId: seesAll ? (query.salesperson ?? null) : session.user.id },
    invoice: query.q,
    method: query.method,
    status: query.status,
    includeArchived: query.archived === "1",
  };
  const [rows, summary, salespeople] = await Promise.all([
    querySales(filters, query.page, SALE_PAGE_SIZE),
    summarizeSales(filters),
    seesAll ? listSalespeople() : Promise.resolve([]),
  ]);
  return {
    from,
    to,
    today,
    seesAll,
    salespeople,
    summary,
    sales: rows.slice(0, SALE_PAGE_SIZE),
    hasNextPage: rows.length > SALE_PAGE_SIZE,
  };
}
