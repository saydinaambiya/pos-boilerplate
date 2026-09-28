import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE, type Permission } from "@/config/permissions";
import { db } from "@/db/client";
import {
  onlineOrderEvents,
  onlineOrderItems,
  onlineOrders,
  productVariants,
  rolePermissions,
  roles,
  stockMovements,
} from "@/db/schema";
import { createProduct } from "@/features/catalog/service";
import { createMarketplace } from "@/features/settings/service";
import { receiveStock } from "@/features/stock/service";
import type { Session } from "@/lib/auth/session";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import type { ChangeStatusInput } from "./schemas";
import {
  changeOnlineOrderStatus,
  createOnlineOrder,
  getOnlineOrder,
  listOnlineOrders,
} from "./service";
import type { OnlineOrderStatus } from "./transitions";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const cashier = () => signIn("kasir", "123456");

let seq = 0;

async function grant(...permissions: Permission[]) {
  const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
  await db
    .insert(rolePermissions)
    .values(permissions.map((permission) => ({ roleId: role?.id ?? "", permission })))
    .onConflictDoNothing();
}

async function marketplace(name = "Shopee") {
  const created = await createMarketplace(await owner(), { name }, testContext());
  if (!created.ok) throw new Error(created.reason);
  return created.id;
}

/** A stock-tracked 25.000 rupiah product with `stock` units. */
async function stocked(stock: number) {
  seq += 1;
  const session = await owner();
  const product = await createProduct(
    session,
    {
      name: `Kaos ${String(seq)}`,
      price: 25_000,
      cost: 10_000,
      unit: "pcs",
      trackStock: true,
      sku: `KAOS-${String(seq)}`,
      minStock: 0,
    },
    testContext(),
  );
  if (!product.ok) throw new Error(product.reason);
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  await receiveStock(session, variant?.id ?? "", { qty: stock, note: "" }, testContext());
  return variant?.id ?? "";
}

async function stockOf(variantId: string) {
  const [row] = await db
    .select({ stockQty: productVariants.stockQty })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  return row?.stockQty;
}

function order(
  session: Session,
  marketplaceId: string,
  variantId: string,
  qty = 2,
  code = "ORD-1",
) {
  return createOnlineOrder(
    session,
    {
      marketplaceId,
      orderCode: code,
      lines: [{ variantId, qty }],
      shippingFee: 12_000,
      note: "",
    },
    testContext(),
  );
}

function move(
  session: Session,
  orderId: string,
  from: OnlineOrderStatus,
  to: OnlineOrderStatus,
  extra: Partial<ChangeStatusInput> = {},
) {
  return changeOnlineOrderStatus(
    session,
    orderId,
    { from, to, note: "", complaintNote: "", resolution: null, returns: [], ...extra },
    testContext(),
  );
}

beforeEach(resetDatabase);

describe("entering marketplace orders (FR-ONL-01/02, BR-05)", () => {
  it("takes stock on save and prices from the catalogue", async () => {
    const shopee = await marketplace();
    const variantId = await stocked(5);
    const created = await order(await cashier(), shopee, variantId, 2, "abc-123");
    if (!created.ok) throw new Error(created.reason);

    const [stored] = await db.select().from(onlineOrders).where(eq(onlineOrders.id, created.id));
    expect(stored).toMatchObject({
      orderCode: "ABC-123",
      status: "PROCESSING",
      itemsTotal: 50_000,
      shippingFee: 12_000,
    });
    expect(await stockOf(variantId)).toBe(3);
    const [movement] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.referenceId, created.id));
    expect(movement).toMatchObject({ type: "ONLINE_SALE", qtyDelta: -2 });
  });

  it("keeps order codes unique per marketplace and refuses short stock", async () => {
    const shopee = await marketplace("Shopee");
    const tokped = await marketplace("Tokopedia");
    const variantId = await stocked(3);
    const session = await cashier();
    await order(session, shopee, variantId, 1, "X-1");
    expect(await order(session, shopee, variantId, 1, "x-1")).toEqual({
      ok: false,
      reason: "code-taken",
    });
    expect((await order(session, tokped, variantId, 1, "X-1")).ok).toBe(true);
    expect(await order(session, tokped, variantId, 5, "X-2")).toEqual({
      ok: false,
      reason: "insufficient-stock",
      variantId,
      available: 1,
    });
    expect(await stockOf(variantId)).toBe(1);
  });
});

describe("order status changes (FR-ONL-03, PRD §4.2)", () => {
  it("needs order.online:update-status and follows the state machine", async () => {
    const shopee = await marketplace();
    const variantId = await stocked(5);
    const session = await cashier();
    const created = await order(session, shopee, variantId);
    if (!created.ok) throw new Error(created.reason);

    await expect(move(session, created.id, "PROCESSING", "IN_TRANSIT")).rejects.toThrow();
    await grant("order.online:update-status");
    const allowed = await cashier();
    expect(await move(allowed, created.id, "PROCESSING", "DELIVERED")).toEqual({
      ok: false,
      reason: "invalid-transition",
    });
    expect(await move(allowed, created.id, "PROCESSING", "IN_TRANSIT")).toEqual({ ok: true });
    expect(await move(allowed, created.id, "PROCESSING", "IN_TRANSIT")).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(await move(allowed, created.id, "IN_TRANSIT", "DELIVERED")).toEqual({ ok: true });
    expect(await move(allowed, created.id, "DELIVERED", "COMPLETED")).toEqual({ ok: true });

    const events = await db
      .select()
      .from(onlineOrderEvents)
      .where(eq(onlineOrderEvents.orderId, created.id))
      .orderBy(asc(onlineOrderEvents.createdAt), asc(onlineOrderEvents.id));
    expect(events.map((event) => event.toStatus)).toEqual([
      "PROCESSING",
      "IN_TRANSIT",
      "DELIVERED",
      "COMPLETED",
    ]);
    expect((await getOnlineOrder(allowed, created.id))?.next).toEqual([]);
  });

  it("puts stock back when an order is cancelled", async () => {
    const shopee = await marketplace();
    const variantId = await stocked(5);
    const session = await owner();
    const created = await order(session, shopee, variantId, 3);
    if (!created.ok) throw new Error(created.reason);
    expect(await stockOf(variantId)).toBe(2);
    await move(session, created.id, "PROCESSING", "CANCELLED");
    expect(await stockOf(variantId)).toBe(5);
  });

  it("records complaints and their resolution (FR-ONL-06)", async () => {
    const shopee = await marketplace();
    const session = await owner();
    const created = await order(session, shopee, await stocked(5));
    if (!created.ok) throw new Error(created.reason);
    await move(session, created.id, "PROCESSING", "IN_TRANSIT");
    await move(session, created.id, "IN_TRANSIT", "DELIVERED");
    expect(await move(session, created.id, "DELIVERED", "COMPLAINT")).toEqual({
      ok: false,
      reason: "complaint-note-required",
    });
    await move(session, created.id, "DELIVERED", "COMPLAINT", { complaintNote: "Warna salah" });
    expect(await move(session, created.id, "COMPLAINT", "COMPLETED")).toEqual({
      ok: false,
      reason: "resolution-required",
    });
    await move(session, created.id, "COMPLAINT", "COMPLETED", { resolution: "RESEND" });
    const [stored] = await db.select().from(onlineOrders).where(eq(onlineOrders.id, created.id));
    expect(stored).toMatchObject({
      status: "COMPLETED",
      complaintNote: "Warna salah",
      resolution: "RESEND",
    });
  });

  it("restocks good returns and writes off damaged ones (FR-ONL-05, BR-19)", async () => {
    const shopee = await marketplace();
    const good = await stocked(5);
    const damaged = await stocked(5);
    const session = await owner();
    const created = await createOnlineOrder(
      session,
      {
        marketplaceId: shopee,
        orderCode: "RET-1",
        lines: [
          { variantId: good, qty: 1 },
          { variantId: damaged, qty: 2 },
        ],
        shippingFee: 0,
        note: "",
      },
      testContext(),
    );
    if (!created.ok) throw new Error(created.reason);
    await move(session, created.id, "PROCESSING", "IN_TRANSIT");
    await move(session, created.id, "IN_TRANSIT", "RETURN_REQUESTED");

    const items = await db
      .select()
      .from(onlineOrderItems)
      .where(eq(onlineOrderItems.orderId, created.id))
      .orderBy(asc(onlineOrderItems.sortOrder));
    expect(
      await move(session, created.id, "RETURN_REQUESTED", "RETURNED", {
        returns: [{ itemId: items[0]?.id ?? "", condition: "GOOD" }],
      }),
    ).toEqual({ ok: false, reason: "return-conditions-required" });
    expect(
      await move(session, created.id, "RETURN_REQUESTED", "RETURNED", {
        returns: [
          { itemId: items[0]?.id ?? "", condition: "GOOD" },
          { itemId: items[1]?.id ?? "", condition: "DAMAGED" },
        ],
      }),
    ).toEqual({ ok: true });

    expect(await stockOf(good)).toBe(5);
    expect(await stockOf(damaged)).toBe(3);
    const writeOffs = await db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.variantId, damaged), eq(stockMovements.type, "WRITE_OFF")));
    expect(writeOffs.map((row) => row.qtyDelta)).toEqual([-2]);
  });
});

describe("order board (FR-ONL-04/07)", () => {
  it("counts per status, searches codes and flags held orders", async () => {
    const shopee = await marketplace();
    const variantId = await stocked(10);
    const session = await owner();
    const first = await order(session, shopee, variantId, 1, "SHP-001");
    await order(session, shopee, variantId, 1, "SHP-002");
    if (!first.ok) throw new Error(first.reason);
    await move(session, first.id, "PROCESSING", "IN_TRANSIT");

    const later = new Date(Date.now() + 49 * 60 * 60 * 1000);
    const board = await listOnlineOrders(
      session,
      { status: "IN_TRANSIT", search: "", page: 1 },
      later,
    );
    expect(board.counts).toMatchObject({ PROCESSING: 1, IN_TRANSIT: 1, COMPLETED: 0 });
    expect(board.orders.map((row) => [row.orderCode, row.held])).toEqual([["SHP-001", true]]);

    const searched = await listOnlineOrders(session, { status: undefined, search: "002", page: 1 });
    expect(searched.orders.map((row) => row.orderCode)).toEqual(["SHP-002"]);
    expect(searched.counts.IN_TRANSIT).toBe(0);
  });
});
