import "server-only";

import { applyVoid } from "@/features/checkout/void-service";
import { applyVoucherApproval, settleVoucherApproval } from "@/features/vouchers/service";

import type { ApprovalHandler, ApprovalType } from "./engine";

/**
 * How requests take effect per type. Domains export their handlers; only
 * this registry knows all of them, so the engine itself never depends on a
 * domain module (ADR-0011).
 */
export const approvalHandlers: Record<ApprovalType, ApprovalHandler | undefined> = {
  VOID: { apply: applyVoid },
  VOUCHER: { apply: applyVoucherApproval, settle: settleVoucherApproval },
  KASBON_PAYMENT: undefined,
};
