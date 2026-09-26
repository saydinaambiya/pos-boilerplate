"use server";

import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { onlineOrderStatuses } from "@/db/schema/online-orders";
import type { PosProduct } from "@/features/catalog/pos-types";
import { searchOrderCatalog } from "@/features/catalog/pos-catalog";
import { localeFromForm } from "@/i18n/form-locale";
import { routing } from "@/i18n/routing";
import { requirePermission } from "@/lib/auth/guard";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import type { FormState } from "@/lib/validation/form-state";

import { changeStatusInput, createOnlineOrderInput } from "./schemas";
import { changeOnlineOrderStatus, createOnlineOrder } from "./service";

function localeOf(value: unknown) {
  return typeof value === "string" && hasLocale(routing.locales, value)
    ? value
    : routing.defaultLocale;
}

export type CreateOrderResponse =
  { ok: true; id: string } | { ok: false; message: string; field?: "orderCode" | "lines" };

/** Saves an order from the entry form; the payload is validated again here (FR-ONL-01). */
export async function createOnlineOrderAction(
  localeValue: unknown,
  payload: unknown,
): Promise<CreateOrderResponse> {
  const locale = localeOf(localeValue);
  const session = await requirePermission("page:online-orders", locale);
  const t = await getTranslations({ locale, namespace: "OnlineOrders" });
  const parsed = createOnlineOrderInput.safeParse(payload);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return field === "orderCode"
      ? { ok: false, message: t("errorOrderCode"), field: "orderCode" }
      : { ok: false, message: t("errorInvalid") };
  }
  const result = await createOnlineOrder(session, parsed.data, await currentRequestContext());
  if (result.ok) {
    revalidatePath("/", "layout");
    return { ok: true, id: result.id };
  }
  switch (result.reason) {
    case "code-taken":
      return { ok: false, message: t("errorCodeTaken"), field: "orderCode" };
    case "insufficient-stock":
      return {
        ok: false,
        message: t("errorInsufficientStock", { available: result.available }),
        field: "lines",
      };
    case "invalid-marketplace":
    case "invalid-items":
      return { ok: false, message: t("errorInvalid") };
  }
}

/** Product search for the entry form. */
export async function searchOrderCatalogAction(
  localeValue: unknown,
  term: unknown,
): Promise<PosProduct[]> {
  const session = await requirePermission("page:online-orders", localeOf(localeValue));
  return searchOrderCatalog(session, typeof term === "string" ? term : "");
}

const orderId = z.uuid();
const status = z.enum(onlineOrderStatuses);

/**
 * Changes an order's status from a confirm dialog (FR-ONL-03/05/06). Return
 * conditions arrive as `condition:<itemId>` fields.
 */
export async function changeOrderStatusAction(
  id: string,
  from: string,
  to: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await requirePermission("order.online:update-status", locale);
  const t = await getTranslations({ locale, namespace: "OnlineOrders" });
  if (!orderId.safeParse(id).success || !status.safeParse(from).success) {
    return { status: "error", message: t("errorNotFound") };
  }
  const resolution = formText(formData, "resolution");
  const returns = [...formData.entries()]
    .filter(([name]) => name.startsWith("condition:"))
    .map(([name, value]) => ({ itemId: name.slice("condition:".length), condition: value }));
  const parsed = changeStatusInput.safeParse({
    from,
    to,
    note: formText(formData, "note"),
    complaintNote: formText(formData, "complaintNote"),
    resolution: resolution === "" ? null : resolution,
    returns,
  });
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return field === "note" || field === "complaintNote"
      ? { status: "error", errors: { [field]: t("errorTooLong") } }
      : { status: "error", message: t("errorInvalid") };
  }

  const result = await changeOnlineOrderStatus(
    session,
    id,
    parsed.data,
    await currentRequestContext(),
  );
  if (result.ok) {
    revalidatePath("/", "layout");
    return { status: "success", message: t("statusChanged") };
  }
  switch (result.reason) {
    case "complaint-note-required":
      return { status: "error", errors: { complaintNote: t("errorComplaintNote") } };
    case "resolution-required":
      return { status: "error", errors: { resolution: t("errorResolution") } };
    case "return-conditions-required":
      return { status: "error", message: t("errorReturnConditions") };
    case "stale":
      return { status: "error", message: t("errorStale") };
    case "invalid-transition":
      return { status: "error", message: t("errorInvalidTransition") };
    case "not-found":
      return { status: "error", message: t("errorNotFound") };
  }
}
