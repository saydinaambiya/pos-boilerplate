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
import { createBrand, createProduct } from "@/features/catalog/service";
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

/** A stock-tracked 25.000 rupiah product with `stock` units, optionally branded. */
async function stocked(
  stock: number,
  details: { brandId?: string; motif?: string; colorName?: string } = {},
) {
  seq += 1;
  const session = await owner();
  const product = await createProduct(
    session,
    {
      name: `Kaos ${String(seq)}`,
      price: 25_000,
      unit: "pcs",
      trackStock: true,
      sku: `KAOS-${String(seq)}`,
      minStock: 0,
      ...details,
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
  unitPrice = 25_000,
) {
  return createOnlineOrder(
    session,
    {
      marketplaceId,
      orderCode: code,
      lines: [{ variantId, qty, unitPrice }],
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
  it("takes stock on save with the typed price and keeps the store price", async () => {
    const shopee = await marketplace();
    const variantId = await stocked(5);
    const created = await order(await cashier(), shopee, variantId, 2, "abc-123", 21_500);
    if (!created.ok) throw new Error(created.reason);

    const [stored] = await db.select().from(onlineOrders).where(eq(onlineOrders.id, created.id));
    expect(stored).toMatchObject({
      orderCode: "ABC-123",
      status: "PROCESSING",
      itemsTotal: 43_000,
      shippingFee: 12_000,
    });
    const [item] = await db
      .select()
      .from(onlineOrderItems)
      .where(eq(onlineOrderItems.orderId, created.id));
    expect(item).toMatchObject({ unitPrice: 21_500, storePrice: 25_000, lineTotal: 43_000 });
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
      isRoll: false,
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
          { variantId: good, qty: 1, unitPrice: 25_000 },
          { variantId: damaged, qty: 2, unitPrice: 25_000 },
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

describe("brand, motif and colour on orders (FR-ONL-09)", () => {
  it("shows the first item's brand and motif on the card and every line's on the detail", async () => {
    const session = await owner();
    const shopee = await marketplace();
    const brand = await createBrand(session, { name: "Turkiye" }, testContext());
    if (!brand.ok) throw new Error(brand.reason);
    const branded = await stocked(5, { brandId: brand.id, motif: "Mihrab", colorName: "Red" });
    const plain = await stocked(5);
    const created = await createOnlineOrder(
      session,
      {
        marketplaceId: shopee,
        orderCode: "SHP-100",
        lines: [
          { variantId: branded, qty: 1, unitPrice: 25_000 },
          { variantId: plain, qty: 1, unitPrice: 25_000 },
        ],
        shippingFee: 0,
        note: "",
      },
      testContext(),
    );
    if (!created.ok) throw new Error(created.reason);

    const board = await listOnlineOrders(session, { status: undefined, search: "", page: 1 });
    expect(board.orders[0]).toMatchObject({
      firstItemBrand: "Turkiye",
      firstItemMotif: "Mihrab",
      firstItemColor: "Red",
    });

    const detail = await getOnlineOrder(session, created.id);
    expect(detail?.items.map((item) => [item.brandName, item.motif, item.colorName])).toEqual([
      ["Turkiye", "Mihrab", "Red"],
      [null, null, null],
    ]);
  });
});

describe("rolls by the meter on orders (FR-ONL-10, ADR-0052)", () => {
  /** A roll priced 100.000 per meter, with 5 m on the roll. */
  async function roll() {
    const session = await owner();
    const created = await createProduct(
      session,
      {
        name: "Karpet Roll",
        price: 100_000,
        unit: "pcs",
        trackStock: true,
        sku: "ROLL-1",
        minStock: 0,
        sizePrices: { "93x47": 50_000, "100x70": 60_000, "50x140": 55_000, "100x140": 110_000 },
      },
      testContext(),
    );
    if (!created.ok) throw new Error(created.reason);
    const rows = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, created.id));
    const rollId = rows.find((row) => row.parentId === null)?.id ?? "";
    await receiveStock(session, rollId, { qty: 500, note: "" }, testContext());
    return rollId;
  }

  function cut(session: Session, marketplaceId: string, rollId: string, lengthCm?: number) {
    return createOnlineOrder(
      session,
      {
        marketplaceId,
        orderCode: "CUT-1",
        lines: [
          { variantId: rollId, qty: 1, unitPrice: 90_000, ...(lengthCm ? { lengthCm } : {}) },
        ],
        shippingFee: 0,
        note: "",
      },
      testContext(),
    );
  }

  it("prices the cut per meter, takes its length off the roll and puts it back on cancel", async () => {
    const shopee = await marketplace();
    const rollId = await roll();
    const session = await cashier();
    const created = await cut(session, shopee, rollId, 250);
    if (!created.ok) throw new Error(created.reason);

    const [item] = await db
      .select()
      .from(onlineOrderItems)
      .where(eq(onlineOrderItems.orderId, created.id));
    expect(item).toMatchObject({
      qty: 1,
      lengthCm: 250,
      unitPrice: 225_000,
      storePrice: 250_000,
      lineTotal: 225_000,
    });
    expect(await stockOf(rollId)).toBe(250);

    await grant("order.online:update-status");
    expect(await move(await cashier(), created.id, "PROCESSING", "CANCELLED")).toEqual({
      ok: true,
    });
    expect(await stockOf(rollId)).toBe(500);
  });

  it("refuses a roll without a length and a cut longer than the roll", async () => {
    const shopee = await marketplace();
    const rollId = await roll();
    const session = await cashier();
    expect(await cut(session, shopee, rollId)).toEqual({ ok: false, reason: "invalid-items" });
    expect(await cut(session, shopee, rollId, 501)).toMatchObject({
      ok: false,
      reason: "insufficient-stock",
      available: 500,
      isRoll: true,
    });
  });
});
