import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { ActionForm } from "@/components/form/action-form";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RouteDialog } from "@/components/ui/route-dialog";
import { requireSession } from "@/lib/auth/guard";
import { formatCurrency } from "@/lib/format/currency";

import { closeShiftAction, openShiftAction } from "../actions";
import { getDrawerCarry } from "../service";
import { ShiftFigures } from "./shift-figures";

/**
 * Opening float form, shared by the cashier and the Sales menu (FR-SHF-02,
 * ADR-0029). A cashier sees the drawer's leftover that is added on top of
 * the float they enter (ADR-0032).
 */
export async function OpenShiftCard({ description }: { description?: string }) {
  const [t, locale, carried] = await Promise.all([
    getTranslations("Shifts"),
    getLocale(),
    requireSession().then(getDrawerCarry),
  ]);
  return (
    <Card className="max-w-md">
      <CardHeader className="flex-col gap-1">
        <CardTitle>{t("openTitle")}</CardTitle>
        <CardDescription>{description ?? t("openDescription")}</CardDescription>
      </CardHeader>
      <ActionForm action={openShiftAction} locale={locale}>
        <FormField
          name="openingCash"
          money
          label={t("openingCash")}
          hint={
            carried === 0
              ? t("moneyHint")
              : t("carriedHint", { amount: formatCurrency(carried, locale) })
          }
          maxLength={20}
        />
        <SubmitButton className="self-start">{t("open")}</SubmitButton>
      </ActionForm>
    </Card>
  );
}

/** Close-shift dialog with the shift's figures and the counted cash (FR-SHF-03). */
export async function CloseShiftDialog({
  shift,
  closeHref,
}: {
  shift: Omit<ComponentProps<typeof ShiftFigures>["shift"], "countedCash" | "variance">;
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}) {
  const [t, tCommon, locale] = await Promise.all([
    getTranslations("Shifts"),
    getTranslations("Common"),
    getLocale(),
  ]);
  return (
    <RouteDialog
      closeHref={closeHref}
      closeLabel={tCommon("close")}
      size="lg"
      title={t("closeTitle")}
      description={t("closeDescription")}
    >
      <ShiftFigures shift={{ ...shift, countedCash: null, variance: null }} />
      <ActionForm action={closeShiftAction} locale={locale} className="border-t border-border pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="countedCash"
            money
            label={t("countedCash")}
            hint={t("moneyHint")}
            maxLength={20}
          />
          <FormField name="note" label={t("note")} hint={t("noteHint")} maxLength={200} />
        </div>
        <SubmitButton variant="danger" className="self-start">
          {t("close")}
        </SubmitButton>
      </ActionForm>
    </RouteDialog>
  );
}
