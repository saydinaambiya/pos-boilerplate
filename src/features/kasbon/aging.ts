import { storeDate } from "@/lib/format/zoned-time";

export { storeDate };

/** Shared due-date helpers, used by store credit and supplier purchases (FR-UI-11). */
export { daysBetween, dueState, type DueState } from "@/lib/format/due";

/** Aging buckets of outstanding store credit (FR-KSB-06). */
export const agingBuckets = ["current", "days31to60", "over60"] as const;
export type AgingBucket = (typeof agingBuckets)[number];

/** 0–30, 31–60 or more than 60 days since the credit was given, in store days. */
export function agingBucket(ageDays: number): AgingBucket {
  if (ageDays <= 30) return "current";
  if (ageDays <= 60) return "days31to60";
  return "over60";
}
