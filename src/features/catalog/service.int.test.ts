import { desc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { auditLogs, productVariants } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/authorize";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import type { ProductFilters, ProductInput } from "./schemas";
import { BRAND_PAGE_SIZE } from "./brand-page";
import {
  createBrand,
  createProduct,
  deleteBrand,
  deleteProduct,
  getBrands,
  getProduct,
  listProducts,
  updateProduct,
} from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const allActive: ProductFilters = { q: "", sort: "name", page: 1 };
const sizePrices = { "93x47": 150000, "100x70": 180000, "50x140": 175000, "100x140": 320000 };

function product(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "Kopi Susu",
    price: 18000,
    unit: "cup",
    trackStock: true,
    sku: "KOPI-SUSU",
    minStock: 5,
    ...overrides,
  };
}

beforeEach(resetDatabase);

describe("brands and product details (FR-CAT-02, FR-PRD-06)", () => {
  it("stores brand, motif and thickness, filters by brand and guards brands in use", async () => {
    const session = await owner();
    const created = await createBrand(session, { name: "Turkiye" }, testContext());
    if (!created.ok) throw new Error(created.reason);
    expect(await createBrand(session, { name: "turkiye" }, testContext())).toEqual({
      ok: false,
      reason: "name-taken",
    });

    const saved = await createProduct(
      session,
      product({ brandId: created.id, motif: "Mihrab", thickness: 2.5 }),
      testContext(),
    );
    if (!saved.ok) throw new Error(saved.reason);
    expect(await getProduct(session, saved.id)).toMatchObject({
      brandName: "Turkiye",
      motif: "Mihrab",
      thickness: 2.5,
    });

    const search = async (filters: Partial<ProductFilters>) =>
      (await listProducts(session, { ...allActive, ...filters })).products.map((row) => row.id);
    expect(await search({ q: "turki" })).toEqual([saved.id]);
    expect(await search({ q: "mihrab" })).toEqual([saved.id]);
    expect(await search({ brand: created.id })).toEqual([saved.id]);
    expect(await search({ q: "polos" })).toEqual([]);

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
      product({ motif: "Polos", thickness: 8 }),
      testContext(),
    );
    if (!saved.ok) throw new Error(saved.reason);
    await updateProduct(session, saved.id, product({ price: 20000 }), testContext());
    expect(await getProduct(session, saved.id)).toMatchObject({
      price: 20000,
      motif: "Polos",
      thickness: 8,
    });
  });
});

describe("roll products (FR-ROL-01/02, ADR-0023)", () => {
  it("creates a roll with a piece per size, priced per size and per meter", async () => {
    const session = await owner();
    const result = await createProduct(
      session,
      product({ sku: "KRP", price: 300000, trackStock: false, sizePrices }),
      testContext(),
    );
    if (!result.ok) throw new Error(result.reason);

    const rows = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, result.id))
      .orderBy(productVariants.sortOrder);
    const roll = rows.find((row) => row.parentId === null);
    expect(roll).toMatchObject({ sku: "KRP", isDefault: true, minStock: 5 });
    expect(
      rows.filter((row) => row.parentId === roll?.id).map((row) => [row.size, row.sku]),
    ).toEqual([
      ["93x47", "KRP-93x47"],
      ["100x70", "KRP-100x70"],
      ["50x140", "KRP-50x140"],
      ["100x140", "KRP-100x140"],
    ]);
    expect(await getProduct(session, result.id)).toMatchObject({
      isRoll: true,
      trackStock: true,
      sizePrices,
      stockQty: 0,
      pieceStock: 0,
      lowStockVariants: 1,
      variantCount: 1,
    });

    await updateProduct(session, result.id, product({ sku: "KRP2", price: 300000 }), testContext());
    const renamed = await db
      .select({ sku: productVariants.sku })
      .from(productVariants)
      .where(eq(productVariants.productId, result.id))
      .orderBy(productVariants.sortOrder, productVariants.sku);
    expect(renamed.map((row) => row.sku)).toContain("KRP2-100x140");
    expect(await getProduct(session, result.id)).toMatchObject({ sizePrices });
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

  it("searches name and SKU, filters by brand", async () => {
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
  });

  it("deletes a product and frees its SKU, keeping the brand deletable (FR-PRD-03, ADR-0041)", async () => {
    const session = await owner();
    const brand = await createBrand(session, { name: "Hapus" }, testContext());
    if (!brand.ok) throw new Error(brand.reason);
    const created = await createProduct(session, product({ brandId: brand.id }), testContext());
    if (!created.ok) throw new Error(created.reason);

    expect(await deleteProduct(session, created.id, testContext())).toEqual({
      ok: true,
      id: created.id,
    });
    expect((await listProducts(session, allActive)).products).toEqual([]);
    expect(await getProduct(session, created.id)).toBeUndefined();
    expect(await deleteProduct(session, created.id, testContext())).toEqual({
      ok: false,
      reason: "not-found",
    });
    const [audit] = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
    expect(audit).toMatchObject({ action: "product.deleted", entityId: created.id });
    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, created.id));
    expect(variants.every((variant) => !variant.isActive && variant.sku.includes("~"))).toBe(true);

    expect((await createProduct(session, product(), testContext())).ok).toBe(true);
    expect(await deleteBrand(session, brand.id, testContext())).toEqual({ ok: true, id: brand.id });
  });

  it("filters and sorts by thickness inside each brand (ADR-0041)", async () => {
    const session = await owner();
    await createProduct(
      session,
      product({ name: "Tebal", sku: "T-1", thickness: 8 }),
      testContext(),
    );
    await createProduct(
      session,
      product({ name: "Tipis", sku: "T-2", thickness: 2.5 }),
      testContext(),
    );
    await createProduct(
      session,
      product({ name: "Sedang", sku: "T-3", thickness: 5 }),
      testContext(),
    );
    const names = async (filters: Partial<ProductFilters>) =>
      (await listProducts(session, { ...allActive, ...filters })).products.map((row) => row.name);

    expect(await names({})).toEqual(["Sedang", "Tebal", "Tipis"]);
    expect(await names({ sort: "thickness-asc" })).toEqual(["Tipis", "Sedang", "Tebal"]);
    expect(await names({ sort: "thickness-desc" })).toEqual(["Tebal", "Sedang", "Tipis"]);
    expect(await names({ thickness: 2.5 })).toEqual(["Tipis"]);
  });

  it("pages by brand, keeping all of a brand's products on one page (ADR-0041)", async () => {
    const session = await owner();
    for (let index = 0; index <= BRAND_PAGE_SIZE; index += 1) {
      const label = String(index).padStart(2, "0");
      const brand = await createBrand(session, { name: `Merk ${label}` }, testContext());
      if (!brand.ok) throw new Error(brand.reason);
      for (const color of ["A", "B"]) {
        await createProduct(
          session,
          product({ brandId: brand.id, name: `${label} ${color}`, sku: `P-${label}-${color}` }),
          testContext(),
        );
      }
    }
    const first = await listProducts(session, allActive);
    expect(new Set(first.products.map((row) => row.brandName)).size).toBe(BRAND_PAGE_SIZE);
    expect(first.products).toHaveLength(BRAND_PAGE_SIZE * 2);
    expect(first.hasNextPage).toBe(true);
    const second = await listProducts(session, { ...allActive, page: 2 });
    expect(second.products.map((row) => row.name)).toEqual(["10 A", "10 B"]);
    expect(second.hasNextPage).toBe(false);
  });

  it("creates a product with its first colour as the default roll (ADR-0026)", async () => {
    const session = await owner();
    const created = await createProduct(
      session,
      { ...product({ sku: "KRP-RED", sizePrices }), colorName: "Red" },
      testContext(),
    );
    if (!created.ok) throw new Error(created.reason);
    expect(await getProduct(session, created.id)).toMatchObject({ hasVariants: true });
    const rows = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, created.id));
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.attributes).toEqual({ color: { name: "Red", hex: "#D32F2F" } });
    }
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
