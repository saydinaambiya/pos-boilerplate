import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { closeShiftAction } from "@/features/shifts/actions";
import { ShiftFigures } from "@/features/shifts/components/shift-figures";
import { getOpenShift } from "@/features/shifts/service";
import { Link, redirect } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Shifts");
  return { title: t("closeTitle") };
}

/** Close the caller's shift with the counted cash (FR-SHF-03). */
export default async function CloseShiftPage() {
  const session = await requirePermission("page:pos");
  const [t, locale, shift] = await Promise.all([
    getTranslations("Shifts"),
    getLocale(),
    getOpenShift(session),
  ]);
  if (!shift) return redirect({ href: "/pos", locale });

  return (
    <>
      <PageHeader
        title={t("closeTitle")}
        actions={
          <Button asChild variant="secondary">
            <Link href="/pos">{t("back")}</Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <Card>
          <ShiftFigures shift={{ ...shift, countedCash: null, variance: null }} />
        </Card>
        <Card className="max-w-md">
          <CardHeader className="flex-col gap-1">
            <CardTitle>{t("close")}</CardTitle>
            <CardDescription>{t("closeDescription")}</CardDescription>
          </CardHeader>
          <ActionForm action={closeShiftAction} locale={locale}>
            <FormField
              name="countedCash"
              label={t("countedCash")}
              hint={t("moneyHint")}
              inputMode="numeric"
              maxLength={20}
            />
            <FormField name="note" label={t("note")} hint={t("noteHint")} maxLength={200} />
            <SubmitButton variant="danger" className="self-start">
              {t("close")}
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
