import "server-only";

import {
  and,
  asc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  notExists,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { db, type Executor } from "@/db/client";
import {
  archiveBatches,
  kasbons,
  onlineOrderEvents,
  onlineOrderItems,
  onlineOrders,
  payments,
  saleItems,
  sales,
  stockMovements,
} from "@/db/schema";

/** Half-open UTC range of one store month. */
export interface MonthWindow {
  start: Date;
  end: Date;
}

/**
 * Sales of the month, except those whose store credit is not settled yet
 * (FR-HK-05); their lines, payments and credit stay live with them.
 */
const eligibleSales = (window: MonthWindow) =>
  db
    .select({ id: sales.id })
    .from(sales)
    .where(
      and(
        gte(sales.createdAt, window.start),
        lt(sales.createdAt, window.end),
        notExists(
          db
            .select({ id: kasbons.id })
            .from(kasbons)
            .where(and(eq(kasbons.saleId, sales.id), ne(kasbons.status, "SETTLED"))),
        ),
      ),
    );

const eligibleKasbons = (window: MonthWindow) =>
  db
    .select({ id: kasbons.id })
    .from(kasbons)
    .where(inArray(kasbons.saleId, eligibleSales(window)));

/** Orders of the month that reached a final state; open orders stay live. */
const eligibleOrders = (window: MonthWindow) =>
  db
    .select({ id: onlineOrders.id })
    .from(onlineOrders)
    .where(
      and(
        gte(onlineOrders.createdAt, window.start),
        lt(onlineOrders.createdAt, window.end),
        inArray(onlineOrders.status, ["COMPLETED", "CANCELLED", "RETURNED"]),
      ),
    );

/**
 * One CSV file in the archive and the rows it covers (FR-HK-02). Every
 * table has `archivedAt` and `archiveBatchId` columns (PRD §11).
 */
export interface ArchiveEntity {
  table: PgTable;
  id: PgColumn;
  archivedAt: PgColumn;
  file: string;
  where: (window: MonthWindow) => SQL | undefined;
}

/** Every entity in a month's archive; export and marking share these conditions. */
export const archiveEntities: readonly ArchiveEntity[] = [
  {
    file: "transactions.csv",
    table: sales,
    id: sales.id,
    archivedAt: sales.archivedAt,
    where: (window) => inArray(sales.id, eligibleSales(window)),
  },
  {
    file: "items.csv",
    table: saleItems,
    id: saleItems.id,
    archivedAt: saleItems.archivedAt,
    where: (window) => inArray(saleItems.saleId, eligibleSales(window)),
  },
  {
    file: "payments.csv",
    table: payments,
    id: payments.id,
    archivedAt: payments.archivedAt,
    where: (window) =>
      or(
        inArray(payments.saleId, eligibleSales(window)),
        inArray(payments.kasbonId, eligibleKasbons(window)),
      ),
  },
  {
    file: "kasbon.csv",
    table: kasbons,
    id: kasbons.id,
    archivedAt: kasbons.archivedAt,
    where: (window) => inArray(kasbons.saleId, eligibleSales(window)),
  },
  {
    file: "stock-movements.csv",
    table: stockMovements,
    id: stockMovements.id,
    archivedAt: stockMovements.archivedAt,
    where: (window) =>
      and(gte(stockMovements.createdAt, window.start), lt(stockMovements.createdAt, window.end)),
  },
  {
    file: "online-orders.csv",
    table: onlineOrders,
    id: onlineOrders.id,
    archivedAt: onlineOrders.archivedAt,
    where: (window) => inArray(onlineOrders.id, eligibleOrders(window)),
  },
  {
    file: "online-order-items.csv",
    table: onlineOrderItems,
    id: onlineOrderItems.id,
    archivedAt: onlineOrderItems.archivedAt,
    where: (window) => inArray(onlineOrderItems.orderId, eligibleOrders(window)),
  },
  {
    file: "online-order-events.csv",
    table: onlineOrderEvents,
    id: onlineOrderEvents.id,
    archivedAt: onlineOrderEvents.archivedAt,
    where: (window) => inArray(onlineOrderEvents.orderId, eligibleOrders(window)),
  },
];

/** Column keys of an entity's table in schema order, for the CSV header. */
export function columnKeys(entity: ArchiveEntity): string[] {
  return Object.keys(getTableColumns(entity.table));
}

/**
 * Rows of one entity in id order, `batchSize` at a time (keyset paging), so
 * a month is streamed without loading it into memory (FR-HK-07).
 */
export async function* entityRows(entity: ArchiveEntity, window: MonthWindow, batchSize = 1000) {
  const columns = getTableColumns(entity.table);
  let after: string | null = null;
  for (;;) {
    const rows: Record<string, unknown>[] = await db
      .select(columns)
      .from(entity.table)
      .where(and(entity.where(window), after ? gt(entity.id, after) : undefined))
      .orderBy(asc(entity.id))
      .limit(batchSize);
    for (const row of rows) yield row;
    if (rows.length < batchSize) return;
    after = String(rows[rows.length - 1]?.id);
  }
}

export async function countEntity(executor: Executor, entity: ArchiveEntity, window: MonthWindow) {
  const [row] = await executor
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(entity.table)
    .where(entity.where(window));
  return row?.count ?? 0;
}

/** Marks the entity's rows of the month that are not archived yet (FR-HK-03). */
export async function markEntity(
  executor: Executor,
  entity: ArchiveEntity,
  window: MonthWindow,
  batchId: string,
  at: Date,
) {
  await executor
    .update(entity.table)
    .set({ archivedAt: at, archiveBatchId: batchId })
    .where(and(entity.where(window), isNull(entity.archivedAt)));
}

export async function upsertExportedBatch(values: {
  month: string;
  rowCounts: Record<string, number>;
  checksums: Record<string, string>;
  exportedBy: string;
}) {
  const now = new Date();
  const [row] = await db
    .insert(archiveBatches)
    .values({ ...values, exportedAt: now })
    .onConflictDoUpdate({
      target: archiveBatches.month,
      set: {
        rowCounts: values.rowCounts,
        checksums: values.checksums,
        exportedBy: values.exportedBy,
        exportedAt: now,
      },
    })
    .returning({ id: archiveBatches.id });
  if (!row) throw new Error("Archive batch upsert returned no row");
  return row.id;
}

export async function lockBatch(executor: Executor, month: string) {
  const [row] = await executor
    .select()
    .from(archiveBatches)
    .where(eq(archiveBatches.month, month))
    .for("update");
  return row;
}

export async function setBatchArchived(executor: Executor, id: string, actorId: string, at: Date) {
  await executor
    .update(archiveBatches)
    .set({ archivedAt: at, archivedBy: actorId })
    .where(eq(archiveBatches.id, id));
}

export async function listBatches() {
  return db.select().from(archiveBatches);
}

/** Earliest store month with any transactional data, or null. */
export async function earliestDataMonth(timeZone: string) {
  const [row] = await db.execute<{ month: string | null }>(sql`
    select to_char(min(created_at) at time zone ${timeZone}, 'YYYY-MM') as month from (
      select min(${sales.createdAt}) as created_at from ${sales}
      union all select min(${onlineOrders.createdAt}) from ${onlineOrders}
      union all select min(${stockMovements.createdAt}) from ${stockMovements}
    ) as firsts
  `);
  return row?.month ?? null;
}

/** Sales, orders and stock movements per store month, for the month list. */
export async function monthlyCounts(timeZone: string, from: Date, to: Date) {
  const count = async (table: PgTable, createdAt: PgColumn) => {
    const month = sql<string>`to_char(${createdAt} at time zone ${timeZone}, 'YYYY-MM')`;
    const rows = await db
      .select({ month, count: sql<number>`count(*)`.mapWith(Number) })
      .from(table)
      .where(and(gte(createdAt, from), lt(createdAt, to)))
      .groupBy(sql`1`);
    return new Map(rows.map((row) => [row.month, row.count]));
  };
  const [salesByMonth, ordersByMonth, movementsByMonth] = await Promise.all([
    count(sales, sales.createdAt),
    count(onlineOrders, onlineOrders.createdAt),
    count(stockMovements, stockMovements.createdAt),
  ]);
  return { salesByMonth, ordersByMonth, movementsByMonth };
}
