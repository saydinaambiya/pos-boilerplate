import "server-only";

import { and, asc, desc, eq, exists, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { sales, voucherRevisions, vouchers } from "@/db/schema";

const revisionColumns = {
  revisionId: voucherRevisions.id,
  name: voucherRevisions.name,
  type: voucherRevisions.type,
  value: voucherRevisions.value,
  minPurchase: voucherRevisions.minPurchase,
  maxDiscount: voucherRevisions.maxDiscount,
  startsAt: voucherRevisions.startsAt,
  endsAt: voucherRevisions.endsAt,
  quota: voucherRevisions.quota,
};

export interface RevisionTerms {
  name: string;
  type: (typeof voucherRevisions.$inferSelect)["type"];
  value: number;
  minPurchase: number | null;
  maxDiscount: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  quota: number | null;
}

/** Vouchers with their active terms and whether a revision is pending (one query). */
export async function listVouchers() {
  const pending = db
    .select({ one: sql`1` })
    .from(voucherRevisions)
    .where(
      and(
        eq(voucherRevisions.voucherId, vouchers.id),
        eq(voucherRevisions.status, "PENDING_APPROVAL"),
      ),
    );
  return db
    .select({
      id: vouchers.id,
      code: vouchers.code,
      status: vouchers.status,
      usageCount: vouchers.usageCount,
      hasPendingRevision: sql<boolean>`${exists(pending)}`,
      ...revisionColumns,
    })
    .from(vouchers)
    .leftJoin(voucherRevisions, eq(voucherRevisions.id, vouchers.activeRevisionId))
    .orderBy(asc(vouchers.code));
}

export async function findVoucher(executor: Executor, id: string) {
  const [row] = await executor
    .select({
      id: vouchers.id,
      code: vouchers.code,
      status: vouchers.status,
      usageCount: vouchers.usageCount,
      activeRevisionId: vouchers.activeRevisionId,
    })
    .from(vouchers)
    .where(eq(vouchers.id, id))
    .limit(1);
  return row;
}

/** Locks a voucher row with its active terms (checkout, approvals). */
export async function lockVoucherByCode(executor: Executor, code: string) {
  const [row] = await executor
    .select({
      id: vouchers.id,
      code: vouchers.code,
      status: vouchers.status,
      usageCount: vouchers.usageCount,
      ...revisionColumns,
    })
    .from(vouchers)
    .leftJoin(voucherRevisions, eq(voucherRevisions.id, vouchers.activeRevisionId))
    .where(eq(vouchers.code, code))
    .for("update", { of: vouchers });
  return row;
}

export async function lockVoucher(executor: Executor, id: string) {
  const [row] = await executor
    .select({ id: vouchers.id, status: vouchers.status, code: vouchers.code })
    .from(vouchers)
    .where(eq(vouchers.id, id))
    .for("update");
  return row;
}

export async function findRevisions(voucherId: string) {
  return db
    .select({
      ...revisionColumns,
      status: voucherRevisions.status,
      createdAt: voucherRevisions.createdAt,
    })
    .from(voucherRevisions)
    .where(eq(voucherRevisions.voucherId, voucherId))
    .orderBy(desc(voucherRevisions.createdAt));
}

export async function insertVoucher(executor: Executor, code: string): Promise<string> {
  const [row] = await executor.insert(vouchers).values({ code }).returning({ id: vouchers.id });
  if (!row) throw new Error("Voucher insert returned no row");
  return row.id;
}

export async function insertRevision(
  executor: Executor,
  voucherId: string,
  createdBy: string,
  terms: RevisionTerms,
): Promise<string> {
  const [row] = await executor
    .insert(voucherRevisions)
    .values({ voucherId, createdBy, ...terms })
    .returning({ id: voucherRevisions.id });
  if (!row) throw new Error("Revision insert returned no row");
  return row.id;
}

export async function setRevisionStatus(
  executor: Executor,
  revisionId: string,
  status: (typeof voucherRevisions.$inferSelect)["status"],
): Promise<void> {
  await executor
    .update(voucherRevisions)
    .set({ status })
    .where(eq(voucherRevisions.id, revisionId));
}

export async function updateVoucherRow(
  executor: Executor,
  id: string,
  values: Partial<Pick<typeof vouchers.$inferInsert, "status" | "activeRevisionId">>,
): Promise<void> {
  await executor.update(vouchers).set(values).where(eq(vouchers.id, id));
}

export async function changeUsage(executor: Executor, id: string, delta: 1 | -1): Promise<void> {
  await executor
    .update(vouchers)
    .set({ usageCount: sql`greatest(${vouchers.usageCount} + ${delta}, 0)` })
    .where(eq(vouchers.id, id));
}

/** Sales that used the voucher, newest first (FR-VCH-06). */
export async function voucherUsage(voucherId: string) {
  return db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      createdAt: sales.createdAt,
      status: sales.status,
      voucherDiscount: sales.voucherDiscount,
      grandTotal: sales.grandTotal,
    })
    .from(sales)
    .where(eq(sales.voucherId, voucherId))
    .orderBy(desc(sales.createdAt))
    .limit(100);
}
