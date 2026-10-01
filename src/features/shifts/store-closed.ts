import "server-only";

import { getTranslations } from "next-intl/server";

import { db } from "@/db/client";
import type { Locale } from "@/config/locales";
import type { ActionLink } from "@/components/feedback/result-dialog";
import type { Session } from "@/lib/auth/session";

import { findOpenShift } from "./repository";

/**
 * Rejection of a transaction outside store hours, with a link that opens
 * the close-shift dialog when the caller still has a shift open: at the POS
 * for a cashier, under Sales for a salesperson (FR-SET-09, ADR-0036).
 */
export async function storeClosedRejection(
  session: Session,
  locale: Locale,
): Promise<{ message: string; action?: ActionLink }> {
  const [t, shift] = await Promise.all([
    getTranslations({ locale, namespace: "Feedback" }),
    findOpenShift(db, session.user.id),
  ]);
  if (!shift) return { message: t("storeClosed") };
  return {
    message: t("storeClosedShiftOpen"),
    action: {
      label: t("closeShift"),
      href: shift.kind === "SALES" ? "/consignments?closeShift=1" : "/pos?close=1",
    },
  };
}
