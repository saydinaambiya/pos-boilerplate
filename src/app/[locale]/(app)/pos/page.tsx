import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { openShiftAction } from "@/features/shifts/actions";
import { ShiftFigures } from "@/features/shifts/components/shift-figures";
import { getOpenShift } from "@/features/shifts/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Navigation");
  return { title: t("pos") };
}

/** Cashier entry point: a sale needs an open shift (FR-SHF-01). */
export default async function PosPage() {
  const session = await requirePermission("page:pos");
  const [t, tNav, locale, shift] = await Promise.all([
    getTranslations("Shifts"),
    getTranslations("Navigation"),
    getLocale(),
    getOpenShift(session),
  ]);

  return (
    <>
      <PageHeader
        title={tNav("pos")}
        actions={
          <Button asChild variant="ghost">
            <Link href="/pos/shifts">{t("history")}</Link>
          </Button>
        }
      />
      {shift ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("current")}</CardTitle>
            <Button asChild variant="secondary">
              <Link href="/pos/shift/close">{t("close")}</Link>
            </Button>
          </CardHeader>
          <ShiftFigures shift={{ ...shift, countedCash: null, variance: null }} />
        </Card>
      ) : (
        <Card className="max-w-md">
          <CardHeader className="flex-col gap-1">
            <CardTitle>{t("openTitle")}</CardTitle>
            <CardDescription>{t("openDescription")}</CardDescription>
          </CardHeader>
          <ActionForm action={openShiftAction} locale={locale}>
            <FormField
              name="openingCash"
              label={t("openingCash")}
              hint={t("moneyHint")}
              inputMode="numeric"
              maxLength={20}
            />
            <SubmitButton className="self-start">{t("open")}</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
