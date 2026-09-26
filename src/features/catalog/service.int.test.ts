import { desc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE } from "@/config/permissions";
import { db } from "@/db/client";
import { auditLogs, productVariants, rolePermissions, roles } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/authorize";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import type { ProductFilters, ProductInput } from "./schemas";
import {
  changeProductStatus,
  createCategory,
  createProduct,
  deleteCategory,
  getCategories,
  getProduct,
  listProducts,
  updateProduct,
} from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const allActive: ProductFilters = { q: "", status: "active", page: 1 };

async function categoryId(name = "Minuman"): Promise<string> {
  const result = await createCategory(await owner(), { name, sortOrder: 10 }, testContext());
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

function product(overrides: Partial<ProductInput> & { categoryId: string }): ProductInput {
  return {
    name: "Kopi Susu",
    price: 18000,
    cost: 7000,
    unit: "cup",
    trackStock: true,
    sku: "KOPI-SUSU",
    minStock: 5,
    ...overrides,
  };
}

/** Gives the default employee role product permissions but not cost visibility. */
async function grantCashierProductEditing() {
  const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
  await db.insert(rolePermissions).values(
    ["product:create", "product:update"].map((permission) => ({
      roleId: role?.id ?? "",
      permission,
    })),
  );
}

beforeEach(resetDatabase);

describe("categories (FR-CAT-01)", () => {
  it("orders by display order and counts products", async () => {
    const session = await owner();
    await createCategory(session, { name: "Makanan", sortOrder: 20 }, testContext());
    const drinks = await categoryId("Minuman");
    await createProduct(session, product({ categoryId: drinks }), testContext());

    const list = await getCategories(session);
    expect(list.map((category) => [category.name, category.productCount])).toEqual([
      ["Minuman", 1],
      ["Makanan", 0],
    ]);
  });

  it("rejects duplicate names and deleting categories with products", async () => {
    const session = await owner();
    const drinks = await categoryId("Minuman");
    expect(await createCategory(session, { name: "minuman", sortOrder: 0 }, testContext())).toEqual(
      {
        ok: false,
        reason: "name-taken",
      },
    );

    await createProduct(session, product({ categoryId: drinks }), testContext());
    expect(await deleteCategory(session, drinks, testContext())).toEqual({
      ok: false,
      reason: "in-use",
    });

    const empty = await categoryId("Kosong");
    expect(await deleteCategory(session, empty, testContext())).toEqual({ ok: true, id: empty });
  });
});

describe("products (FR-PRD-01..04, §3.1.1)", () => {
  it("creates a product with one hidden default variant", async () => {
    const session = await owner();
    const result = await createProduct(
      session,
      product({ categoryId: await categoryId() }),
      testContext(),
    );
    if (!result.ok) throw new Error(result.reason);

    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, result.id));
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      isDefault: true,
      sku: "KOPI-SUSU",
      minStock: 5,
      stockQty: 0,
    });
    const [audit] = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
    expect(audit).toMatchObject({ action: "product.created", entityId: result.id });
  });

  it("keeps SKUs unique case-insensitively", async () => {
    const session = await owner();
    const drinks = await categoryId();
    await createProduct(session, product({ categoryId: drinks }), testContext());
    expect(
      await createProduct(
        session,
        product({ categoryId: drinks, name: "Lain", sku: "kopi-susu" }),
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "sku-taken" });
  });

  it("searches name and SKU, filters by category and status", async () => {
    const session = await owner();
    const drinks = await categoryId("Minuman");
    const food = await categoryId("Makanan");
    await createProduct(session, product({ categoryId: drinks }), testContext());
    await createProduct(
      session,
      product({ categoryId: food, name: "Roti Bakar", sku: "RB-100_%" }),
      testContext(),
    );

    const names = async (filters: Partial<ProductFilters>) =>
      (await listProducts(session, { ...allActive, ...filters })).products.map((row) => row.name);

    expect(await names({ q: "susu" })).toEqual(["Kopi Susu"]);
    expect(await names({ q: "rb-1" })).toEqual(["Roti Bakar"]);
    expect(await names({ q: "_%" })).toEqual(["Roti Bakar"]);
    expect(await names({ q: "%" })).toEqual(["Roti Bakar"]);
    expect(await names({ category: food })).toEqual(["Roti Bakar"]);

    const listed = await listProducts(session, { ...allActive, q: "kopi" });
    await changeProductStatus(session, listed.products[0]?.id ?? "", false, testContext());
    expect(await names({ q: "kopi" })).toEqual([]);
    expect(await names({ q: "kopi", status: "inactive" })).toEqual(["Kopi Susu"]);
  });

  it("hides cost from roles without product:view-cost and never overwrites it (FR-PRD-02)", async () => {
    const drinks = await categoryId();
    const created = await createProduct(
      await owner(),
      product({ categoryId: drinks }),
      testContext(),
    );
    if (!created.ok) throw new Error(created.reason);
    await grantCashierProductEditing();
    const cashier = await signIn("kasir", "123456");

    expect((await getProduct(cashier, created.id))?.cost).toBeNull();
    expect((await listProducts(cashier, allActive)).products[0]?.cost).toBeNull();

    const withoutCost: ProductInput = {
      name: "Kopi Susu",
      categoryId: drinks,
      price: 20000,
      unit: "cup",
      trackStock: true,
      sku: "KOPI-SUSU",
      minStock: 5,
    };
    expect(await updateProduct(cashier, created.id, withoutCost, testContext())).toEqual({
      ok: true,
      id: created.id,
    });
    const stored = await getProduct(await owner(), created.id);
    expect(stored).toMatchObject({ price: 20000, cost: 7000 });

    const byCashier = await createProduct(
      cashier,
      product({ categoryId: drinks, name: "Teh", sku: "TEH", cost: 99999 }),
      testContext(),
    );
    if (!byCashier.ok) throw new Error(byCashier.reason);
    expect((await getProduct(await owner(), byCashier.id))?.cost).toBe(0);
  });

  it("audits only changed fields and rejects unknown categories", async () => {
    const session = await owner();
    const drinks = await categoryId();
    const created = await createProduct(session, product({ categoryId: drinks }), testContext());
    if (!created.ok) throw new Error(created.reason);

    await updateProduct(
      session,
      created.id,
      product({ categoryId: drinks, price: 19000 }),
      testContext(),
    );
    const [audit] = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
    expect(audit?.diff).toEqual({ price: { from: 18000, to: 19000 } });

    expect(
      await updateProduct(
        session,
        created.id,
        product({ categoryId: "0199a000-0000-7000-8000-000000000999" }),
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "invalid-category" });
  });

  it("requires product permissions in the service (NFR-SEC-07)", async () => {
    const drinks = await categoryId();
    const cashier = await signIn("kasir", "123456");
    await expect(
      createProduct(cashier, product({ categoryId: drinks }), testContext()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createCategory(cashier, { name: "X", sortOrder: 0 }, testContext()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("searches 5,000 products in under 200 ms (FR-PRD-04)", async () => {
    const session = await owner();
    const drinks = await categoryId();
    await db.execute(sql`
      WITH inserted AS (
        INSERT INTO products (id, name, category_id, price, unit)
        SELECT gen_random_uuid(), 'Produk ' || n, ${drinks}, n * 100, 'pcs'
        FROM generate_series(1, 5000) AS n
        RETURNING id, name
      )
      INSERT INTO product_variants (id, product_id, sku, is_default)
      SELECT gen_random_uuid(), id, 'SKU-' || substr(name, 8), true FROM inserted
    `);
    await db.execute(sql`ANALYZE products; ANALYZE product_variants`);
    await listProducts(session, { ...allActive, q: "warm-up" });

    for (const q of ["produk 4321", "sku-12", "tidak-ada"]) {
      const started = performance.now();
      await listProducts(session, { ...allActive, q });
      expect(performance.now() - started, q).toBeLessThan(200);
    }
  });
});
