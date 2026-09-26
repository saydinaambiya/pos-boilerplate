import "server-only";

import { applyVoid } from "@/features/checkout/void-service";

import type { ApplyApproval, ApprovalType } from "./engine";

/**
 * How an approved request takes effect, per type. Domains export their
 * apply functions; only this registry knows all of them, so the engine
 * itself never depends on a domain module.
 */
export const approvalAppliers: Partial<Record<ApprovalType, ApplyApproval>> = {
  VOID: applyVoid,
};
