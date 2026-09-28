import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE, type Permission } from "@/config/permissions";
import { db } from "@/db/client";
import { approvals, productVariants, rolePermissions, roles, sales, vouchers } from "@/db/schema";
import { decideApproval } from "@/features/approvals/service";
import { createProduct } from "@/features/catalog/service";
import { checkout } from "@/features/checkout/service";
import { requestVoid } from "@/features/checkout/void-service";
import { openShift } from "@/features/shifts/service";
import type { Session } from "@/lib/auth/session";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import type { VoucherTermsInput } from "./schemas";
import {
  createVoucher,
  deactivateVoucher,
  getVoucher,
  reactivateVoucher,
  reviseVoucher,
} from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);

const terms = (overrides: Partial<VoucherTermsInput> = {}): VoucherTermsInput => ({
  name: "Hemat 10%",
  type: "PERCENT",
  value: 10,
  minPurchase: null,
  maxDiscount: null,
  startDate: null,
  endDate: null,
  quota: null,
  ...overrides,
});

async function grant(...permissions: Permission[]) {
  const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
  await db
    .insert(rolePermissions)
    .values(permissions.map((permission) => ({ roleId: role?.id ?? "", permission })))
    .onConflictDoNothing();
}

async function approvePending(voucherId: string) {
  const [pending] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.targetId, voucherId), eq(approvals.status, "PENDING")));
  if (!pending) throw new Error("pending approval expected");
  return decideApproval(
    await owner(),
    pending.id,
    { decision: "approve", note: "", version: pending.version },
    testContext(),
  );
}

/** A 100.000 rupiah untracked product and an open shift for `session`. */
async function sellable(session: Session) {
  const ownerSession = await owner();
  const product = await createProduct(
    ownerSession,
    {
      name: "Paket",
      price: 100_000,
      cost: 0,
      unit: "pcs",
      trackStock: false,
      sku: `PKT-${crypto.randomUUID().slice(0, 8)}`,
      minStock: 0,
    },
    testContext(),
  );
  if (!product.ok) throw new Error(product.reason);
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  await openShift(session, { openingCash: 0 }, testContext());
  return variant?.id ?? "";
}

function buy(session: Session, variantId: string, amount: number, voucherCode?: string) {
  return checkout(
    session,
    {
      idempotencyKey: crypto.randomUUID(),
      customer: { name: "Pembeli", phone: null },
      lines: [{ variantId, qty: 1 }],
      payments: [{ method: "CASH", amount }],
      ...(voucherCode ? { voucherCode } : {}),
    },
    testContext(),
  );
}

beforeEach(resetDatabase);

describe("voucher lifecycle (FR-VCH-01..04, BR-10)", () => {
  it("activates a voucher requested by an employee only after approval", async () => {
    await grant("voucher:request");
    const cashier = await signIn("kasir", "123456");
    const created = await createVoucher(cashier, { code: "hemat10", ...terms() }, testContext());
    if (!created.ok) throw new Error(created.reason);
    expect(created.status).toBe("PENDING");
    expect((await getVoucher(await owner(), created.id))?.status).toBe("PENDING_APPROVAL");

    await approvePending(created.id);
    const voucher = await getVoucher(await owner(), created.id);
    expect(voucher).toMatchObject({ code: "HEMAT10", status: "ACTIVE", active: { value: 1000 } });
  });

  it("auto-approves the owner's voucher and rejects duplicate codes", async () => {
    const session = await owner();
    expect(
      await createVoucher(session, { code: "PROMO", ...terms() }, testContext()),
    ).toMatchObject({
      ok: true,
      status: "APPROVED",
    });
    expect(await createVoucher(session, { code: "promo", ...terms() }, testContext())).toEqual({
      ok: false,
      reason: "code-taken",
    });
  });

  it("keeps the active terms while a revision waits, and on rejection (FR-VCH-03)", async () => {
    const ownerSession = await owner();
    const created = await createVoucher(ownerSession, { code: "REV", ...terms() }, testContext());
    if (!created.ok) throw new Error(created.reason);
    await grant("voucher:request");
    const cashier = await signIn("kasir", "123456");

    expect(
      await reviseVoucher(cashier, created.id, terms({ value: 20 }), testContext()),
    ).toMatchObject({ status: "PENDING" });
    expect(await reviseVoucher(cashier, created.id, terms({ value: 30 }), testContext())).toEqual({
      ok: false,
      reason: "already-pending",
    });
    expect((await getVoucher(ownerSession, created.id))?.active?.value).toBe(1000);

    await approvePending(created.id);
    expect((await getVoucher(ownerSession, created.id))?.active?.value).toBe(2000);

    await reviseVoucher(cashier, created.id, terms({ value: 50 }), testContext());
    const [pending] = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.targetId, created.id), eq(approvals.status, "PENDING")));
    await decideApproval(
      ownerSession,
      pending?.id ?? "",
      { decision: "reject", note: "Terlalu besar", version: pending?.version ?? 0 },
      testContext(),
    );
    const after = await getVoucher(ownerSession, created.id);
    expect(after?.active?.value).toBe(2000);
    expect(after?.revisions[0]?.status).toBe("REJECTED");
  });

  it("deactivates immediately and needs approval to reactivate (FR-VCH-04)", async () => {
    const ownerSession = await owner();
    const created = await createVoucher(ownerSession, { code: "ONOFF", ...terms() }, testContext());
    if (!created.ok) throw new Error(created.reason);
    await grant("voucher:request");
    const cashier = await signIn("kasir", "123456");

    await deactivateVoucher(cashier, created.id, testContext());
    expect((await getVoucher(ownerSession, created.id))?.status).toBe("INACTIVE");
    expect(await reactivateVoucher(cashier, created.id, testContext())).toMatchObject({
      status: "PENDING",
    });
    expect((await getVoucher(ownerSession, created.id))?.status).toBe("INACTIVE");
    await approvePending(created.id);
    expect((await getVoucher(ownerSession, created.id))?.status).toBe("ACTIVE");
  });
});

describe("vouchers at checkout (FR-POS-03, FR-VCH-05/06)", () => {
  it("applies the discount, records usage and releases it on void", async () => {
    const ownerSession = await owner();
    await createVoucher(
      ownerSession,
      { code: "DISKON", ...terms({ value: 10, maxDiscount: 8000 }) },
      testContext(),
    );
    const variantId = await sellable(ownerSession);

    expect(await buy(ownerSession, variantId, 100_000, "DISKON")).toEqual({
      ok: false,
      reason: "payment-mismatch",
    });
    const sale = await buy(ownerSession, variantId, 92_000, "diskon");
    if (!sale.ok) throw new Error(sale.reason);
    const [stored] = await db.select().from(sales).where(eq(sales.id, sale.saleId));
    expect(stored).toMatchObject({ voucherDiscount: 8000, grandTotal: 92_000 });
    const [voucher] = await db.select().from(vouchers).where(eq(vouchers.code, "DISKON"));
    expect(voucher?.usageCount).toBe(1);
    expect((await getVoucher(ownerSession, voucher?.id ?? ""))?.usage).toHaveLength(1);

    await requestVoid(ownerSession, sale.saleId, { reason: "Tes" }, testContext());
    const [released] = await db.select().from(vouchers).where(eq(vouchers.code, "DISKON"));
    expect(released?.usageCount).toBe(0);
  });

  it("enforces minimum purchase, period and status", async () => {
    const ownerSession = await owner();
    await createVoucher(
      ownerSession,
      { code: "MIN", ...terms({ type: "FIXED", value: 5000, minPurchase: 200_000 }) },
      testContext(),
    );
    await createVoucher(
      ownerSession,
      { code: "LAMA", ...terms({ startDate: "2020-01-01", endDate: "2020-12-31" }) },
      testContext(),
    );
    await createVoucher(
      ownerSession,
      { code: "NANTI", ...terms({ startDate: "2099-01-01" }) },
      testContext(),
    );
    const off = await createVoucher(ownerSession, { code: "MATI", ...terms() }, testContext());
    if (off.ok) await deactivateVoucher(ownerSession, off.id, testContext());
    const variantId = await sellable(ownerSession);

    expect(await buy(ownerSession, variantId, 95_000, "MIN")).toEqual({
      ok: false,
      reason: "voucher-min-purchase",
    });
    expect(await buy(ownerSession, variantId, 90_000, "LAMA")).toEqual({
      ok: false,
      reason: "voucher-expired",
    });
    expect(await buy(ownerSession, variantId, 90_000, "NANTI")).toEqual({
      ok: false,
      reason: "voucher-not-started",
    });
    expect(await buy(ownerSession, variantId, 90_000, "MATI")).toEqual({
      ok: false,
      reason: "voucher-invalid",
    });
    expect(await buy(ownerSession, variantId, 90_000, "TIDAKADA")).toEqual({
      ok: false,
      reason: "voucher-invalid",
    });
  });

  it("never exceeds the quota under concurrent sales", async () => {
    const ownerSession = await owner();
    await createVoucher(
      ownerSession,
      { code: "KUOTA", ...terms({ type: "FIXED", value: 10_000, quota: 2 }) },
      testContext(),
    );
    const variantId = await sellable(ownerSession);

    const results = await Promise.all(
      [1, 2, 3, 4].map(() => buy(ownerSession, variantId, 90_000, "KUOTA")),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(
      results.filter((result) => !result.ok && result.reason === "voucher-quota"),
    ).toHaveLength(2);
    const [voucher] = await db.select().from(vouchers).where(eq(vouchers.code, "KUOTA"));
    expect(voucher?.usageCount).toBe(2);
  });
});
