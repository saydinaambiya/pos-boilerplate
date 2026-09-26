import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getFormatter, getLocale, getMessages, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { storeDate } from "@/lib/format/zoned-time";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getPosCatalog, getPosCategories } from "@/features/catalog/pos-catalog";
import { PosTerminal } from "@/features/checkout/components/pos-terminal";
import { getCheckoutBankAccounts } from "@/features/settings/service";
import { openShiftAction } from "@/features/shifts/actions";
import { getOpenShift } from "@/features/shifts/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { readSetting } from "@/lib/settings/store";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Navigation");
  return { title: t("pos") };
}

/**
 * Cashier screen. Without an open shift the only action is opening one
 * (FR-SHF-01); with a shift the terminal loads the sellable catalogue.
 */
export default async function PosPage() {
  const session = await requirePermission("page:pos");
  const [t, tPos, tNav, format, locale, shift] = await Promise.all([
    getTranslations("Shifts"),
    getTranslations("Pos"),
    getTranslations("Navigation"),
    getFormatter(),
    getLocale(),
    getOpenShift(session),
  ]);

  if (!shift) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title={tNav("pos")}
          actions={
            <Button asChild variant="ghost">
              <Link href="/pos/shifts">{t("history")}</Link>
            </Button>
          }
        />
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
      </div>
    );
  }

  const [catalog, categories, bankAccounts, tax, operations, messages] = await Promise.all([
    getPosCatalog(session),
    getPosCategories(session),
    getCheckoutBankAccounts(session),
    readSetting("tax"),
    readSetting("operations"),
    getMessages(),
  ]);

  return (
    <>
      <h1 className="sr-only">{tNav("pos")}</h1>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
        <span>
          {tPos("shiftSince", { time: format.dateTime(shift.openedAt, { timeStyle: "short" }) })}
        </span>
        <span className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/pos/shifts">{tPos("shiftHistory")}</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/pos/shift/close">{tPos("closeShift")}</Link>
          </Button>
        </span>
      </div>
      <NextIntlClientProvider messages={{ Pos: messages.Pos }}>
        <PosTerminal
          locale={locale}
          storageKey={`pos-cart:${session.user.id}`}
          catalog={catalog.products}
          truncated={catalog.truncated}
          categories={categories}
          tax={tax}
          allowNegativeStock={operations.allowNegativeStock}
          canDiscount={session.permissions.has("pos:item-discount")}
          canKasbon={session.permissions.has("kasbon:create")}
          today={storeDate(new Date(), operations.timeZone)}
          bankAccounts={bankAccounts}
        />
      </NextIntlClientProvider>
    </>
  );
}
