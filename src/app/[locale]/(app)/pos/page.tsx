import { Clock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getFormatter, getLocale, getMessages, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RouteDialog } from "@/components/ui/route-dialog";
import { getPosBrands, getPosCatalog } from "@/features/catalog/pos-catalog";
import { PosTerminal } from "@/features/checkout/components/pos-terminal";
import { getCheckoutBankAccounts } from "@/features/settings/service";
import { closeShiftAction, openShiftAction } from "@/features/shifts/actions";
import { ShiftFigures } from "@/features/shifts/components/shift-figures";
import { getOpenShift, getOtherOpenShifts } from "@/features/shifts/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { readSetting } from "@/lib/settings/store";
import { storeClosedFor } from "@/lib/settings/store-hours-guard";
import { toneClasses } from "@/components/ui/tone";
import { storeDate } from "@/lib/format/zoned-time";
import { cn } from "@/lib/utils/cn";
import { firstParam } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Navigation");
  return { title: t("pos") };
}

/**
 * Cashier screen. Outside store hours employees only see that the store is
 * closed and can still close their shift (FR-SET-09). Without an open shift
 * the only action is opening one (FR-SHF-01); with a shift the terminal
 * loads the sellable catalogue and `?close=1` opens the close-shift dialog
 * over it (FR-SHF-03, ADR-0018).
 */
export default async function PosPage({ searchParams }: PageProps<"/[locale]/pos">) {
  const session = await requirePermission("page:pos");
  const closing = firstParam((await searchParams).close) === "1";
  const [t, tPos, tNav, tCommon, format, locale, shift] = await Promise.all([
    getTranslations("Shifts"),
    getTranslations("Pos"),
    getTranslations("Navigation"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    getOpenShift(session),
  ]);

  const closeDialog =
    shift && closing ? (
      <RouteDialog
        closeHref="/pos"
        closeLabel={tCommon("close")}
        size="lg"
        title={t("closeTitle")}
        description={t("closeDescription")}
      >
        <ShiftFigures shift={{ ...shift, countedCash: null, variance: null }} />
        <ActionForm
          action={closeShiftAction}
          locale={locale}
          className="border-t border-border pt-4"
        >
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
    ) : null;

  const closed = await storeClosedFor(session);
  if (closed) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title={tNav("pos")}
          actions={
            <>
              <Button asChild variant="ghost">
                <Link href="/pos/sales">{tPos("salesHistory")}</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/pos/shifts">{t("history")}</Link>
              </Button>
            </>
          }
        />
        <Card className="max-w-md">
          <EmptyState
            icon={<Clock aria-hidden="true" />}
            title={tPos("storeClosedTitle")}
            description={
              closed.today ? tPos("storeClosedToday", closed.today) : tPos("storeClosedAllDay")
            }
          />
          {shift ? (
            <div className="flex flex-col items-start gap-3 border-t border-border pt-4">
              <p className="text-sm text-ink-muted">{tPos("storeClosedShift")}</p>
              <Button asChild variant="secondary">
                <Link href="/pos?close=1" scroll={false}>
                  {tPos("closeShift")}
                </Link>
              </Button>
            </div>
          ) : null}
        </Card>
        {closeDialog}
      </div>
    );
  }

  if (!shift) {
    const others = await getOtherOpenShifts(session);
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title={tNav("pos")}
          actions={
            <>
              <Button asChild variant="ghost">
                <Link href="/pos/sales">{tPos("salesHistory")}</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/pos/shifts">{t("history")}</Link>
              </Button>
            </>
          }
        />
        {others.length > 0 ? (
          <div
            role="status"
            className={cn(
              "flex max-w-md gap-3 rounded-card px-4 py-3 text-sm",
              toneClasses.warning,
            )}
          >
            <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">{t("othersOpenTitle", { count: others.length })}</p>
              <ul className="flex flex-col gap-0.5">
                {others.map((other) => (
                  <li key={other.id}>
                    {t("othersOpenItem", {
                      name: other.cashierName,
                      time: format.dateTime(other.openedAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })}
                  </li>
                ))}
              </ul>
              <p>{t("othersOpenHint")}</p>
            </div>
          </div>
        ) : null}
        <Card className="max-w-md">
          <CardHeader className="flex-col gap-1">
            <CardTitle>{t("openTitle")}</CardTitle>
            <CardDescription>{t("openDescription")}</CardDescription>
          </CardHeader>
          <ActionForm action={openShiftAction} locale={locale}>
            <FormField
              name="openingCash"
              money
              label={t("openingCash")}
              hint={t("moneyHint")}
              maxLength={20}
            />
            <SubmitButton className="self-start">{t("open")}</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    );
  }

  const [catalog, brands, bankAccounts, tax, operations, messages] = await Promise.all([
    getPosCatalog(session),
    getPosBrands(session),
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
            <Link href="/pos/sales">{tPos("salesHistory")}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/pos/shifts">{tPos("shiftHistory")}</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/pos?close=1" scroll={false}>
              {tPos("closeShift")}
            </Link>
          </Button>
        </span>
      </div>
      <NextIntlClientProvider
        messages={{ Pos: messages.Pos, Feedback: messages.Feedback, Picker: messages.Picker }}
      >
        <PosTerminal
          locale={locale}
          storageKey={`pos-cart:${session.user.id}`}
          catalog={catalog.products}
          truncated={catalog.truncated}
          brands={brands}
          tax={tax}
          allowNegativeStock={operations.allowNegativeStock}
          canDiscount={session.permissions.has("pos:item-discount")}
          canKasbon={session.permissions.has("kasbon:create")}
          today={storeDate(new Date(), operations.timeZone)}
          bankAccounts={bankAccounts}
        />
      </NextIntlClientProvider>
      {closeDialog}
    </>
  );
}
