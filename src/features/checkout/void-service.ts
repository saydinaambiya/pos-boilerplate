import "server-only";

import { z } from "zod";

import { db } from "@/db/client";
import {
  type ApplyApproval,
  ApprovalConflict,
  findPendingApproval,
  submitApproval,
} from "@/features/approvals/engine";
import { recordStockMovement } from "@/features/stock/service";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import { plainText } from "@/lib/validation/text";

import { lockSale, setSaleStatus, soldTrackedQuantities } from "./repository";
import { getSale } from "./service";

/** A void always carries a reason (FR-POS-09, BR-17). */
export const voidInput = z.object({ reason: plainText(200) }).strict();
export type VoidInput = z.infer<typeof voidInput>;

export type VoidResult =
  | { ok: true; status: "PENDING" | "APPROVED" }
  | { ok: false; reason: "not-found" | "not-voidable" | "already-pending" };

/**
 * Applies an approved void: the sale becomes `VOIDED` and sold stock returns
 * through `VOID` movements, in the approval's transaction (FR-POS-09,
 * FR-STK-01). Raises `ApprovalConflict` if the sale is no longer completed.
 */
export const applyVoid: ApplyApproval = async (tx, approval, actor, context) => {
  const sale = await lockSale(tx, approval.targetId);
  if (sale?.status !== "COMPLETED") throw new ApprovalConflict("not-voidable");
  await setSaleStatus(tx, sale.id, "VOIDED");
  for (const line of await soldTrackedQuantities(tx, sale.id)) {
    const returned = await recordStockMovement(
      tx,
      {
        variantId: line.variantId,
        type: "VOID",
        qtyDelta: line.qty,
        actorId: actor.id,
        reason: approvalReason(approval.payload),
        reference: { type: "sale", id: sale.id },
      },
      { allowNegative: true },
    );
    if (!returned.ok && returned.reason !== "not-tracked") throw new ApprovalConflict("stock");
  }
  await recordAudit(
    tx,
    {
      actorId: actor.id,
      action: "sale.voided",
      entity: "sale",
      entityId: sale.id,
      diff: { invoiceNo: sale.invoiceNo, approvalId: approval.id },
    },
    context,
  );
};

function approvalReason(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null && "reason" in payload) {
    const { reason } = payload;
    return typeof reason === "string" ? reason : null;
  }
  return null;
}

/**
 * Requests a void of a completed sale the caller may see; an approver with
 * `approval.void:decide` applies it, or it applies at once for the Owner
 * (FR-POS-09, FR-APR-03).
 */
export async function requestVoid(
  session: Session,
  saleId: string,
  input: VoidInput,
  context: RequestContext,
): Promise<VoidResult> {
  assertPermission(session, "sale:void");
  const sale = await getSale(session, saleId);
  if (!sale) return { ok: false, reason: "not-found" };
  if (sale.status !== "COMPLETED") return { ok: false, reason: "not-voidable" };
  try {
    const result = await db.transaction((tx) =>
      submitApproval(
        tx,
        session,
        {
          type: "VOID",
          targetType: "sale",
          targetId: sale.id,
          payload: {
            invoiceNo: sale.invoiceNo,
            grandTotal: sale.grandTotal,
            cashierName: sale.cashierName,
            reason: input.reason,
          },
        },
        context,
        applyVoid,
      ),
    );
    return { ok: true, status: result.status };
  } catch (error) {
    if (error instanceof ApprovalConflict) {
      return {
        ok: false,
        reason: error.reason === "already-pending" ? "already-pending" : "not-voidable",
      };
    }
    throw error;
  }
}

/** Whether a void is waiting for a decision, for the sale page. */
export async function getPendingVoid(saleId: string) {
  return findPendingApproval(db, "VOID", saleId);
}
