import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE, type Permission } from "@/config/permissions";
import { db } from "@/db/client";
import {
  approvals,
  productVariants,
  rolePermissions,
  roles,
  sales,
  stockMovements,
} from "@/db/schema";
import { createProduct } from "@/features/catalog/service";
import { checkout } from "@/features/checkout/service";
import { requestVoid } from "@/features/checkout/void-service";
import { getShiftReport, openShift } from "@/features/shifts/service";
import { receiveStock } from "@/features/stock/service";
import type { Session } from "@/lib/auth/session";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import {
  cancelApproval,
  countPendingForViewer,
  decideApproval,
  getHistory,
  getInbox,
  getMyRequests,
} from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);

async function grant(...permissions: Permission[]) {
  const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
  await db
    .insert(rolePermissions)
    .values(permissions.map((permission) => ({ roleId: role?.id ?? "", permission })))
    .onConflictDoNothing();
}

/** A completed cash sale of 2 units by `session`; returns sale, shift and variant ids. */
async function sale(session: Session) {
  const ownerSession = await owner();
  const product = await createProduct(
    ownerSession,
    {
      name: "Teh",
      price: 5000,
      cost: 0,
      unit: "cup",
      trackStock: true,
      sku: `TEH-${crypto.randomUUID().slice(0, 8)}`,
      minStock: 0,
    },
    testContext(),
  );
  if (!product.ok) throw new Error(product.reason);
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  await receiveStock(ownerSession, variant?.id ?? "", { qty: 10, note: "" }, testContext());
  const shift = await openShift(session, { openingCash: 0 }, testContext());
  const done = await checkout(
    session,
    {
      idempotencyKey: crypto.randomUUID(),
      customer: { name: "Pembeli", phone: null },
      lines: [{ variantId: variant?.id ?? "", qty: 2 }],
      payments: [{ method: "CASH", amount: 10_000 }],
    },
    testContext(),
  );
  if (!done.ok) throw new Error(done.reason);
  return { saleId: done.saleId, shiftId: shift.ok ? shift.id : "", variantId: variant?.id ?? "" };
}

async function pendingVoid(saleId: string) {
  const [row] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.targetId, saleId), eq(approvals.status, "PENDING")));
  if (!row) throw new Error("pending approval expected");
  return row;
}

async function saleStatus(saleId: string) {
  const [row] = await db.select({ status: sales.status }).from(sales).where(eq(sales.id, saleId));
  return row?.status;
}

async function stockOf(variantId: string) {
  const [row] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
  return row?.stockQty;
}

beforeEach(resetDatabase);

describe("void through the approval engine (FR-POS-09, FR-APR-01..05)", () => {
  it("files a pending request that changes nothing until approved", async () => {
    await grant("sale:void");
    const cashier = await signIn("kasir", "123456");
    const { saleId, variantId, shiftId } = await sale(cashier);

    expect(await requestVoid(cashier, saleId, { reason: "Salah input" }, testContext())).toEqual({
      ok: true,
      status: "PENDING",
    });
    expect(await saleStatus(saleId)).toBe("COMPLETED");
    expect(await stockOf(variantId)).toBe(8);
    expect(await requestVoid(cashier, saleId, { reason: "Lagi" }, testContext())).toEqual({
      ok: false,
      reason: "already-pending",
    });

    const approver = await owner();
    expect(await countPendingForViewer(approver)).toBe(1);
    const pending = await pendingVoid(saleId);
    expect(pending.payload).toMatchObject({ reason: "Salah input", grandTotal: 10_000 });

    expect(
      await decideApproval(
        approver,
        pending.id,
        { decision: "approve", note: "OK", version: pending.version },
        testContext(),
      ),
    ).toEqual({ ok: true });
    expect(await saleStatus(saleId)).toBe("VOIDED");
    expect(await stockOf(variantId)).toBe(10);
    const [returned] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.type, "VOID"));
    expect(returned).toMatchObject({ qtyDelta: 2, reason: "Salah input" });
    expect(await getShiftReport(cashier, shiftId)).toMatchObject({
      expectedCash: 0,
      totals: { salesCount: 0, voidCount: 1 },
    });
  });

  it("never lets requesters decide their own requests, even with the permission (BR-13)", async () => {
    await grant("sale:void", "approval.void:decide");
    const cashier = await signIn("kasir", "123456");
    const { saleId } = await sale(cashier);
    await requestVoid(cashier, saleId, { reason: "Tes" }, testContext());
    const pending = await pendingVoid(saleId);

    expect(await getInbox(cashier)).toHaveLength(0);
    expect(
      await decideApproval(
        cashier,
        pending.id,
        { decision: "approve", note: "", version: pending.version },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "self-decision" });
  });

  it("requires the decide permission for the request type", async () => {
    await grant("sale:void");
    const cashier = await signIn("kasir", "123456");
    const { saleId } = await sale(cashier);
    await requestVoid(cashier, saleId, { reason: "Tes" }, testContext());
    const pending = await pendingVoid(saleId);
    const colleague = await signIn("kasir-baru", "111111");
    expect(
      await decideApproval(
        colleague,
        pending.id,
        { decision: "approve", note: "", version: pending.version },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "forbidden" });
  });

  it("decides only once under concurrent decisions (FR-APR-05)", async () => {
    await grant("sale:void");
    const cashier = await signIn("kasir", "123456");
    const { saleId, variantId } = await sale(cashier);
    await requestVoid(cashier, saleId, { reason: "Tes" }, testContext());
    const pending = await pendingVoid(saleId);
    const approver = await owner();

    const results = await Promise.all(
      [1, 2, 3].map(() =>
        decideApproval(
          approver,
          pending.id,
          { decision: "approve", note: "", version: pending.version },
          testContext(),
        ),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await stockOf(variantId)).toBe(10);
  });

  it("keeps the sale on rejection and allows a new request afterwards", async () => {
    await grant("sale:void");
    const cashier = await signIn("kasir", "123456");
    const { saleId } = await sale(cashier);
    await requestVoid(cashier, saleId, { reason: "Tes" }, testContext());
    const pending = await pendingVoid(saleId);

    await decideApproval(
      await owner(),
      pending.id,
      { decision: "reject", note: "Tidak valid", version: pending.version },
      testContext(),
    );
    expect(await saleStatus(saleId)).toBe("COMPLETED");
    expect((await getMyRequests(cashier))[0]).toMatchObject({
      status: "REJECTED",
      note: "Tidak valid",
    });
    expect((await requestVoid(cashier, saleId, { reason: "Ulang" }, testContext())).ok).toBe(true);
  });

  it("lets only the requester cancel while pending (FR-APR-04)", async () => {
    await grant("sale:void");
    const cashier = await signIn("kasir", "123456");
    const { saleId } = await sale(cashier);
    await requestVoid(cashier, saleId, { reason: "Tes" }, testContext());
    const pending = await pendingVoid(saleId);

    expect(await cancelApproval(await owner(), pending.id, pending.version, testContext())).toEqual(
      {
        ok: false,
        reason: "stale",
      },
    );
    expect(await cancelApproval(cashier, pending.id, pending.version, testContext())).toEqual({
      ok: true,
    });
    expect(await countPendingForViewer(await owner())).toBe(0);
  });

  it("auto-approves requests by the owner (FR-APR-03)", async () => {
    const ownerSession = await owner();
    const { saleId, variantId } = await sale(ownerSession);
    expect(await requestVoid(ownerSession, saleId, { reason: "Owner" }, testContext())).toEqual({
      ok: true,
      status: "APPROVED",
    });
    expect(await saleStatus(saleId)).toBe("VOIDED");
    expect(await stockOf(variantId)).toBe(10);
    expect(await requestVoid(ownerSession, saleId, { reason: "Lagi" }, testContext())).toEqual({
      ok: false,
      reason: "not-voidable",
    });
  });

  it("rejects void requests without sale:void", async () => {
    const cashier = await signIn("kasir", "123456");
    const { saleId } = await sale(cashier);
    await expect(requestVoid(cashier, saleId, { reason: "Tes" }, testContext())).rejects.toThrow(
      "sale:void",
    );
  });
});

describe("inbox filters (FR-APR-02)", () => {
  it("narrows by request type and by requester name or username", async () => {
    await grant("sale:void");
    const cashier = await signIn("kasir", "123456");
    const { saleId } = await sale(cashier);
    await requestVoid(cashier, saleId, { reason: "Salah input" }, testContext());
    const ownerSession = await owner();

    expect(await getInbox(ownerSession)).toHaveLength(1);
    expect(await getInbox(ownerSession, { type: "VOID" })).toHaveLength(1);
    expect(await getInbox(ownerSession, { type: "VOUCHER" })).toHaveLength(0);
    expect(await getInbox(ownerSession, { requester: "kas" })).toHaveLength(1);
    expect(await getInbox(ownerSession, { requester: "KASIR" })).toHaveLength(1);
    expect(await getInbox(ownerSession, { requester: "orang lain" })).toHaveLength(0);
    expect(await getInbox(ownerSession, { requester: "%" })).toHaveLength(0);
    expect(await getMyRequests(cashier, { type: "VOUCHER" })).toHaveLength(0);
    expect(await getMyRequests(cashier, { type: "VOID" })).toHaveLength(1);
  });
});

describe("approval visibility (FR-APR-02)", () => {
  it("shows approvers every decided request and employees only their own", async () => {
    await grant("sale:void");
    const cashier = await signIn("kasir", "123456");
    const { saleId } = await sale(cashier);
    await requestVoid(cashier, saleId, { reason: "Salah input" }, testContext());
    const ownerSession = await owner();
    const ownSale = await sale(ownerSession);
    await requestVoid(ownerSession, ownSale.saleId, { reason: "Owner batal" }, testContext());

    expect((await getHistory(ownerSession)).map((row) => row.requesterName)).toEqual([
      fixtures.owner.name,
    ]);
    const pending = await pendingVoid(saleId);
    await decideApproval(
      ownerSession,
      pending.id,
      { decision: "reject", note: "", version: pending.version },
      testContext(),
    );
    const history = await getHistory(ownerSession);
    expect(history.map((row) => row.status)).toEqual(["REJECTED", "APPROVED"]);
    expect(await getHistory(ownerSession, { requester: "kasir" })).toHaveLength(1);

    const mine = await getMyRequests(cashier);
    expect(mine).toHaveLength(1);
    expect(mine.every((row) => row.requestedBy === cashier.user.id)).toBe(true);
    expect(await getHistory(cashier)).toEqual([]);
  });
});
