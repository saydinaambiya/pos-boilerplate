import "server-only";

import type { Session } from "@/lib/auth/session";

import { readSetting } from "./store";
import { type StoreHoursState, storeHoursState } from "./store-hours";

/**
 * The closed state when `session` may not use the POS right now, otherwise
 * null (FR-SET-09, BR-24). The Owner and roles holding `pos:after-hours`,
 * such as Sales working into the evening, are never blocked. Checked by the
 * POS page, checkout, opening a shift and consignment writes; closing a
 * shift stays possible after hours.
 */
export async function storeClosedFor(
  session: Session,
  now = new Date(),
): Promise<StoreHoursState | null> {
  if (session.role.isSystem || session.permissions.has("pos:after-hours")) return null;
  const [hours, operations] = await Promise.all([
    readSetting("store.hours"),
    readSetting("operations"),
  ]);
  const state = storeHoursState(hours, now, operations.timeZone);
  return state.open ? null : state;
}
