import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { isRollRowSql, variantPriceSql } from "@/features/catalog/pricing-sql";
import { db, type Executor } from "@/db/client";
import {
  consignmentBatches,
  consignmentItems,
  consignments,
  productVariants,
  products,
  rolePermissions,
  roles,
  sales,
  users,
} from "@/db/schema";

type ItemKind = (typeof consignmentItems.$inferSelect)["kind"];

/** The salesperson's open consignment, locked for this transaction. */
export async function lockOpenConsignment(executor: Executor, salespersonId: string) {
  const [row] = await executor
    .select({ id: consignments.id })
    .from(consignments)
    .where(and(eq(consignments.salespersonId, salespersonId), eq(consignments.status, "OPEN")))
    .for("update");
  return row;
}

/**
 * Opens a consignment unless one is already open; the partial unique index
 * makes a concurrent pickup reuse the same one.
 */
export async function insertOpenConsignment(executor: Executor, salespersonId: string) {
  await executor.insert(consignments).values({ salespersonId }).onConflictDoNothing();
}

export async function lockConsignment(executor: Executor, id: string) {
  const [row] = await executor
    .select({
      id: consignments.id,
      salespersonId: consignments.salespersonId,
      status: consignments.status,
    })
    .from(consignments)
    .where(eq(consignments.id, id))
    .for("update");
  return row;
}

export async function closeConsignment(executor: Executor, id: string, now: Date) {
  await executor
    .update(consignments)
    .set({ status: "CLOSED", closedAt: now })
    .where(eq(consignments.id, id));
}

export async function touchConsignment(executor: Executor, id: string, now: Date) {
  await executor.update(consignments).set({ updatedAt: now }).where(eq(consignments.id, id));
}

/** An earlier batch with the same idempotency key, for replaying a retry. */
export async function findBatchByKey(executor: Executor, actorId: string, key: string) {
  const [row] = await executor
    .select({ id: consignmentBatches.id, consignmentId: consignmentBatches.consignmentId })
    .from(consignmentBatches)
    .where(and(eq(consignmentBatches.actorId, actorId), eq(consignmentBatches.idempotencyKey, key)))
    .limit(1);
  return row;
}

export async function insertBatch(
  executor: Executor,
  values: typeof consignmentBatches.$inferInsert,
): Promise<string> {
  const [row] = await executor
    .insert(consignmentBatches)
    .values(values)
    .returning({ id: consignmentBatches.id });
  if (!row) throw new Error("Consignment batch insert returned no row");
  return row.id;
}

export async function insertItems(
  executor: Executor,
  values: (typeof consignmentItems.$inferInsert)[],
) {
  if (values.length > 0) await executor.insert(consignmentItems).values(values);
}

/** Variants that can be taken out, with the data needed for snapshots. */
export async function findTakeableVariants(executor: Executor, variantIds: readonly string[]) {
  return executor
    .select({
      id: productVariants.id,
      productName: products.name,
      attributes: productVariants.attributes,
      trackStock: products.trackStock,
      size: productVariants.size,
      isDefect: productVariants.isDefect,
      price: variantPriceSql,
      sellable: sql<boolean>`${products.isActive} AND ${productVariants.isActive} AND NOT ${isRollRowSql}`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, [...variantIds]));
}

const sumOf = (kind: ItemKind) =>
  sql<number>`coalesce(sum(${consignmentItems.qty}) filter (where ${consignmentItems.kind} = ${kind}), 0)`.mapWith(
    Number,
  );

/**
 * Per variant: taken (net of corrections), sold, returned and still
 * outstanding, with the names and price of the latest pickup, the product's
 * motif and whether stock is tracked (FR-CSG-03/07/08).
 */
export async function consignmentBalances(executor: Executor, consignmentId: string) {
  const rows = await executor
    .select({
      variantId: consignmentItems.variantId,
      taken: sumOf("TAKE"),
      sold: sumOf("SOLD"),
      returned: sumOf("RETURN"),
      reduced: sumOf("REDUCE"),
      name: sql<string>`(array_agg(${consignmentItems.nameSnapshot} order by ${consignmentItems.createdAt} desc, ${consignmentItems.id} desc))[1]`,
      variantName: sql<
        string | null
      >`(array_agg(${consignmentItems.variantSnapshot} order by ${consignmentItems.createdAt} desc, ${consignmentItems.id} desc))[1]`,
      takenPrice:
        sql<number>`(array_agg(${consignmentItems.unitPrice} order by ${consignmentItems.createdAt} desc, ${consignmentItems.id} desc) filter (where ${consignmentItems.kind} = 'TAKE'))[1]`.mapWith(
          Number,
        ),
      motif: products.motif,
      trackStock: products.trackStock,
      price: variantPriceSql,
    })
    .from(consignmentItems)
    .innerJoin(productVariants, eq(productVariants.id, consignmentItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(consignmentItems.consignmentId, consignmentId))
    .groupBy(
      consignmentItems.variantId,
      products.motif,
      products.trackStock,
      productVariants.priceOverride,
      productVariants.size,
      productVariants.isDefect,
      products.sizePrices,
      products.defectSizePrices,
      products.price,
    );
  return rows
    .map(({ reduced, ...row }) => ({
      ...row,
      taken: row.taken - reduced,
      outstanding: row.taken - reduced - row.sold - row.returned,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.variantId.localeCompare(b.variantId));
}

/** Consignments with salesperson and outstanding totals (FR-CSG-05). */
export async function queryConsignments(query: {
  status: "OPEN" | "CLOSED";
  salespersonId: string | null;
  limit: number;
}) {
  const outstanding = sql<number>`coalesce((
    select sum(case ${consignmentItems.kind} when 'TAKE' then ${consignmentItems.qty} else -${consignmentItems.qty} end)
    from ${consignmentItems} where ${consignmentItems.consignmentId} = ${consignments.id}
  ), 0)`.mapWith(Number);
  const outstandingValue = sql<number>`coalesce((
    select sum(case ${consignmentItems.kind} when 'TAKE' then ${consignmentItems.qty} else -${consignmentItems.qty} end * ${consignmentItems.unitPrice})
    from ${consignmentItems} where ${consignmentItems.consignmentId} = ${consignments.id}
  ), 0)`.mapWith(Number);
  const conditions = [eq(consignments.status, query.status)];
  if (query.salespersonId) conditions.push(eq(consignments.salespersonId, query.salespersonId));
  return db
    .select({
      id: consignments.id,
      status: consignments.status,
      createdAt: consignments.createdAt,
      updatedAt: consignments.updatedAt,
      closedAt: consignments.closedAt,
      salespersonId: consignments.salespersonId,
      salespersonName: users.name,
      outstanding,
      outstandingValue,
    })
    .from(consignments)
    .innerJoin(users, eq(users.id, consignments.salespersonId))
    .where(and(...conditions))
    .orderBy(desc(consignments.updatedAt), desc(consignments.id))
    .limit(query.limit);
}

export async function findConsignment(id: string) {
  const [row] = await db
    .select({
      id: consignments.id,
      status: consignments.status,
      createdAt: consignments.createdAt,
      closedAt: consignments.closedAt,
      salespersonId: consignments.salespersonId,
      salespersonName: users.name,
    })
    .from(consignments)
    .innerJoin(users, eq(users.id, consignments.salespersonId))
    .where(eq(consignments.id, id))
    .limit(1);
  return row;
}

/** Every visit of a consignment with its lines and their motif, newest first (FR-CSG-02/08). */
export async function listBatches(consignmentId: string) {
  const [batches, items] = await Promise.all([
    db
      .select({
        id: consignmentBatches.id,
        kind: consignmentBatches.kind,
        createdAt: consignmentBatches.createdAt,
        note: consignmentBatches.note,
        actorName: users.name,
        saleId: consignmentBatches.saleId,
        invoiceNo: sales.invoiceNo,
      })
      .from(consignmentBatches)
      .innerJoin(users, eq(users.id, consignmentBatches.actorId))
      .leftJoin(sales, eq(sales.id, consignmentBatches.saleId))
      .where(eq(consignmentBatches.consignmentId, consignmentId))
      .orderBy(desc(consignmentBatches.createdAt), desc(consignmentBatches.id)),
    db
      .select({
        id: consignmentItems.id,
        batchId: consignmentItems.batchId,
        kind: consignmentItems.kind,
        qty: consignmentItems.qty,
        name: consignmentItems.nameSnapshot,
        variantName: consignmentItems.variantSnapshot,
        motif: products.motif,
        unitPrice: consignmentItems.unitPrice,
      })
      .from(consignmentItems)
      .innerJoin(productVariants, eq(productVariants.id, consignmentItems.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(consignmentItems.consignmentId, consignmentId))
      .orderBy(asc(consignmentItems.nameSnapshot), asc(consignmentItems.id)),
  ]);
  return batches.map((batch) => ({
    ...batch,
    items: items.filter((item) => item.batchId === batch.id),
  }));
}

/**
 * Active accounts that may carry goods: the Owner and roles holding
 * `consignment:sell` (FR-CSG-01).
 */
export async function listSalespeople() {
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .leftJoin(
      rolePermissions,
      and(eq(rolePermissions.roleId, roles.id), eq(rolePermissions.permission, "consignment:sell")),
    )
    .where(
      and(
        eq(users.isActive, true),
        sql`(${roles.isSystem} OR (${roles.isActive} AND ${rolePermissions.id} IS NOT NULL))`,
      ),
    )
    .orderBy(asc(users.name));
}
