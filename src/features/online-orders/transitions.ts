import type { onlineOrderStatuses } from "@/db/schema/online-orders";

export type OnlineOrderStatus = (typeof onlineOrderStatuses)[number];

/** Allowed status changes (PRD §4.2, BRD §5.2). */
export const nextStatuses: Record<OnlineOrderStatus, readonly OnlineOrderStatus[]> = {
  PROCESSING: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED", "COMPLAINT", "RETURN_REQUESTED"],
  DELIVERED: ["COMPLETED", "COMPLAINT"],
  COMPLAINT: ["COMPLETED", "RETURN_REQUESTED"],
  RETURN_REQUESTED: ["RETURNED"],
  COMPLETED: [],
  CANCELLED: [],
  RETURNED: [],
};

/** States that end the order's flow; they are never flagged as held. */
export const finalStatuses: readonly OnlineOrderStatus[] = ["COMPLETED", "CANCELLED", "RETURNED"];

export function canTransition(from: OnlineOrderStatus, to: OnlineOrderStatus): boolean {
  return nextStatuses[from].includes(to);
}

/**
 * What a change must carry: a complaint needs its note, settling a
 * complaint needs a resolution, and a return needs every line's condition
 * (FR-ONL-05/06).
 */
export function transitionNeeds(from: OnlineOrderStatus, to: OnlineOrderStatus) {
  return {
    complaintNote: to === "COMPLAINT",
    resolution: from === "COMPLAINT" && to === "COMPLETED",
    returnConditions: to === "RETURNED",
  };
}

/**
 * Flags an order that has sat in one open state longer than the threshold
 * (FR-ONL-07).
 */
export function isHeld(
  status: OnlineOrderStatus,
  statusChangedAt: Date,
  thresholdHours: number,
  now: Date,
): boolean {
  if (finalStatuses.includes(status)) return false;
  return now.getTime() - statusChangedAt.getTime() > thresholdHours * 60 * 60 * 1000;
}
