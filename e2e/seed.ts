/**
 * Seeds the E2E database with the owner and employee fixtures. Employees are
 * reset on every run, so lockouts and PIN changes from earlier runs vanish.
 * Also inserts one deterministic "extreme" sale for the invoice layout tests
 * (FR-INV-03): 120-character names, 50 lines and billion-rupiah amounts.
 */
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  categories,
  payments,
  products,
  productVariants,
  saleItems,
  sales,
  shifts,
  users,
} from "@/db/schema";
import { seed } from "@/db/seed";

import { accounts, EXTREME_SALE_ID } from "./accounts";

await seed(db, {
  owner: accounts.owner,
  employees: [accounts.cashier, accounts.newCashier, accounts.lockedCashier, accounts.posCashier],
});

const FIXTURE = {
  category: "0199a000-0000-7000-8000-00000000c001",
  product: "0199a000-0000-7000-8000-00000000c002",
  variant: "0199a000-0000-7000-8000-00000000c003",
  shift: "0199a000-0000-7000-8000-00000000c004",
};
const issuedAt = new Date("2026-09-25T05:30:00Z");
const longName = `Produk dengan nama yang sangat panjang sekali untuk menguji pembungkusan teks di struk thermal dan invoice A4 ${"X".repeat(8)}`;

const [owner] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.username, accounts.owner.username));

if (owner) {
  await db
    .insert(categories)
    .values({ id: FIXTURE.category, name: "Fixture Invoice", sortOrder: 9999 })
    .onConflictDoNothing();
  await db
    .insert(products)
    .values({
      id: FIXTURE.product,
      name: longName.slice(0, 120),
      categoryId: FIXTURE.category,
      price: 999_999_999,
      unit: "pcs",
      trackStock: false,
      isActive: false,
    })
    .onConflictDoNothing();
  await db
    .insert(productVariants)
    .values({
      id: FIXTURE.variant,
      productId: FIXTURE.product,
      sku: "FIXTURE-EXTREME",
      isDefault: true,
    })
    .onConflictDoNothing();
  await db
    .insert(shifts)
    .values({
      id: FIXTURE.shift,
      userId: owner.id,
      openedAt: issuedAt,
      openingCash: 0,
      closedAt: issuedAt,
      expectedCash: 0,
      countedCash: 0,
      variance: 0,
    })
    .onConflictDoNothing();

  const lines = Array.from({ length: 50 }, (_, index) => {
    const unitPrice = 999_999_999 - index * 1_000;
    const qty = (index % 3) + 1;
    const discountAmount = index % 5 === 0 ? 12_345_678 : 0;
    return { index, unitPrice, qty, discountAmount, lineTotal: unitPrice * qty - discountAmount };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const itemDiscountTotal = lines.reduce((sum, line) => sum + line.discountAmount, 0);

  const inserted = await db
    .insert(sales)
    .values({
      id: EXTREME_SALE_ID,
      invoiceNo: "INV-FIXTURE-EXTREME",
      shiftId: FIXTURE.shift,
      cashierId: owner.id,
      status: "COMPLETED",
      subtotal,
      itemDiscountTotal,
      serviceRateBps: 0,
      serviceAmount: 0,
      ppnRateBps: 0,
      ppnAmount: 0,
      priceIncludesTax: false,
      grandTotal: subtotal,
      paidTotal: subtotal,
      idempotencyKey: "fixture-extreme",
      createdAt: issuedAt,
    })
    .onConflictDoNothing()
    .returning({ id: sales.id });

  if (inserted.length > 0) {
    await db.insert(saleItems).values(
      lines.map((line) => ({
        saleId: EXTREME_SALE_ID,
        variantId: FIXTURE.variant,
        nameSnapshot: `${String(line.index + 1).padStart(2, "0")} ${longName}`.slice(0, 120),
        variantSnapshot: line.index % 4 === 0 ? "Hijau Toska Muda" : null,
        unitPrice: line.unitPrice,
        qty: line.qty,
        discountType: line.discountAmount > 0 ? ("amount" as const) : null,
        discountValue: line.discountAmount > 0 ? line.discountAmount : null,
        discountAmount: line.discountAmount,
        lineTotal: line.lineTotal,
        sortOrder: line.index,
      })),
    );
    await db.insert(payments).values({ saleId: EXTREME_SALE_ID, method: "CASH", amount: subtotal });
  }
}

await db.$client.end();
