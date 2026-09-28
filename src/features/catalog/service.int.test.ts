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
  createBrand,
  createProduct,
  deleteBrand,
  getBrands,
  getProduct,
  listProducts,
  updateProduct,
} from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const allActive: ProductFilters = { q: "", status: "active", page: 1 };

function product(overrides: Partial<ProductInput> = {}): ProductInput {
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

describe("brands and product details (FR-CAT-02, FR-PRD-06)", () => {
  it("stores brand, motif and size, filters by them and guards brands in use", async () => {
    const session = await owner();
    const created = await createBrand(session, { name: "Turkiye" }, testContext());
    if (!created.ok) throw new Error(created.reason);
    expect(await createBrand(session, { name: "turkiye" }, testContext())).toEqual({
      ok: false,
      reason: "name-taken",
    });

    const saved = await createProduct(
      session,
      product({ brandId: created.id, motif: "Mihrab", size: "93x47" }),
      testContext(),
    );
    if (!saved.ok) throw new Error(saved.reason);
    expect(await getProduct(session, saved.id)).toMatchObject({
      brandName: "Turkiye",
      motif: "Mihrab",
      size: "93x47",
    });

    const search = async (filters: Partial<ProductFilters>) =>
      (await listProducts(session, { ...allActive, ...filters })).products.map((row) => row.id);
    expect(await search({ q: "turki" })).toEqual([saved.id]);
    expect(await search({ q: "mihrab" })).toEqual([saved.id]);
    expect(await search({ brand: created.id, size: "93x47" })).toEqual([saved.id]);
    expect(await search({ size: "100x70" })).toEqual([]);

    expect(await getBrands(session)).toEqual([
      { id: created.id, name: "Turkiye", productCount: 1 },
    ]);
    expect(await deleteBrand(session, created.id, testContext())).toEqual({
      ok: false,
      reason: "in-use",
    });
  });

  it("rejects unknown brands and keeps details when an edit omits them", async () => {
    const session = await owner();
    expect(
      await createProduct(
        session,
        product({ brandId: "0199a000-0000-7000-8000-0000000000ff" }),
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "invalid-brand" });

    const saved = await createProduct(
      session,
      product({ motif: "Polos", size: "50x140" }),
      testContext(),
    );
    if (!saved.ok) throw new Error(saved.reason);
    await updateProduct(session, saved.id, product({ price: 20000 }), testContext());
    expect(await getProduct(session, saved.id)).toMatchObject({
      price: 20000,
      motif: "Polos",
      size: "50x140",
    });
  });
});

describe("products (FR-PRD-01..04, §3.1.1)", () => {
  it("creates a product with one hidden default variant", async () => {
    const session = await owner();
    const result = await createProduct(session, product(), testContext());
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
    await createProduct(session, product(), testContext());
    expect(
      await createProduct(session, product({ name: "Lain", sku: "kopi-susu" }), testContext()),
    ).toEqual({ ok: false, reason: "sku-taken" });
  });

  it("searches name and SKU, filters by brand and status", async () => {
    const session = await owner();
    await createProduct(session, product(), testContext());
    const brand = await createBrand(session, { name: "Roti Enak" }, testContext());
    if (!brand.ok) throw new Error(brand.reason);
    await createProduct(
      session,
      product({ brandId: brand.id, name: "Roti Bakar", sku: "RB-100_%" }),
      testContext(),
    );

    const names = async (filters: Partial<ProductFilters>) =>
      (await listProducts(session, { ...allActive, ...filters })).products.map((row) => row.name);

    expect(await names({ q: "susu" })).toEqual(["Kopi Susu"]);
    expect(await names({ q: "rb-1" })).toEqual(["Roti Bakar"]);
    expect(await names({ q: "_%" })).toEqual(["Roti Bakar"]);
    expect(await names({ q: "%" })).toEqual(["Roti Bakar"]);
    expect(await names({ brand: brand.id })).toEqual(["Roti Bakar"]);

    const listed = await listProducts(session, { ...allActive, q: "kopi" });
    await changeProductStatus(session, listed.products[0]?.id ?? "", false, testContext());
    expect(await names({ q: "kopi" })).toEqual([]);
    expect(await names({ q: "kopi", status: "inactive" })).toEqual(["Kopi Susu"]);
  });

  it("hides cost from roles without product:view-cost and never overwrites it (FR-PRD-02)", async () => {
    const created = await createProduct(await owner(), product(), testContext());
    if (!created.ok) throw new Error(created.reason);
    await grantCashierProductEditing();
    const cashier = await signIn("kasir", "123456");

    expect((await getProduct(cashier, created.id))?.cost).toBeNull();
    expect((await listProducts(cashier, allActive)).products[0]?.cost).toBeNull();

    const withoutCost: ProductInput = {
      name: "Kopi Susu",
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
      product({ name: "Teh", sku: "TEH", cost: 99999 }),
      testContext(),
    );
    if (!byCashier.ok) throw new Error(byCashier.reason);
    expect((await getProduct(await owner(), byCashier.id))?.cost).toBe(0);
  });

  it("audits only changed fields and rejects unknown brands", async () => {
    const session = await owner();
    const created = await createProduct(session, product(), testContext());
    if (!created.ok) throw new Error(created.reason);

    await updateProduct(session, created.id, product({ price: 19000 }), testContext());
    const [audit] = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
    expect(audit?.diff).toEqual({ price: { from: 18000, to: 19000 } });

    expect(
      await updateProduct(
        session,
        created.id,
        product({ brandId: "0199a000-0000-7000-8000-000000000999" }),
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "invalid-brand" });
  });

  it("requires product permissions in the service (NFR-SEC-07)", async () => {
    const cashier = await signIn("kasir", "123456");
    await expect(createProduct(cashier, product(), testContext())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createBrand(cashier, { name: "X" }, testContext())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("searches 5,000 products in under 200 ms (FR-PRD-04)", async () => {
    const session = await owner();
    await db.execute(sql`
      WITH inserted AS (
        INSERT INTO products (id, name, price, unit)
        SELECT gen_random_uuid(), 'Produk ' || n, n * 100, 'pcs'
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
