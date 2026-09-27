import { getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { RouteDialog } from "@/components/ui/route-dialog";

import { createVoucherAction } from "../actions";
import { VoucherForm } from "./voucher-form";

/** Propose a voucher in a dialog; it goes live after approval (FR-VCH-02, BR-10, ADR-0018). */
export async function NewVoucherDialog({
  closeHref,
}: {
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}) {
  const [t, tCommon] = await Promise.all([getTranslations("Vouchers"), getTranslations("Common")]);
  return (
    <RouteDialog
      closeHref={closeHref}
      closeLabel={tCommon("close")}
      size="lg"
      title={t("newTitle")}
      description={t("subtitle")}
    >
      <VoucherForm action={createVoucherAction} submitLabel={t("create")} withCode />
    </RouteDialog>
  );
}
