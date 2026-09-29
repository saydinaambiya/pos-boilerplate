import { Clock, KeyRound, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { appConfig } from "@/config/app.config";
import { navigation } from "@/config/navigation";
import { getOpenShift } from "@/features/shifts/service";
import { Link } from "@/i18n/navigation";
import { requireSession } from "@/lib/auth/guard";
import { readSetting } from "@/lib/settings/store";
import { storeClosedFor } from "@/lib/settings/store-hours-guard";
import { storeHoursState } from "@/lib/settings/store-hours";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Home");
  return { title: t("title") };
}

/**
 * Home for every signed-in account (ADR-0028): sign-in lands here, so a
 * role without the dashboard still gets in. It greets the user, says
 * whether the store is open today and whether they may work now, shows
 * their shift when they use the cashier, and links to every page their
 * role opens. Needs a session only.
 */
export default async function HomePage() {
  const session = await requireSession();
  const [t, tNav, format, hours, operations] = await Promise.all([
    getTranslations("Home"),
    getTranslations("Navigation"),
    getFormatter(),
    readSetting("store.hours"),
    readSetting("operations"),
  ]);
  const now = new Date();
  const state = storeHoursState(hours, now, operations.timeZone);
  const blocked = (await storeClosedFor(session, now)) !== null;
  const usesPos = session.permissions.has("page:pos");
  /** Salespeople keep their shift in the Sales menu instead (ADR-0029). */
  const keepsShift = usesPos || session.permissions.has("consignment:sell");
  const shiftHref = usesPos ? "/pos" : "/consignments";
  const shift = keepsShift ? await getOpenShift(session) : null;
  const shortcuts = navigation.filter(
    (item) =>
      item.href !== "/" &&
      !item.diagnostics &&
      item.permission !== undefined &&
      session.permissions.has(item.permission),
  );

  return (
    <>
      <PageHeader
        title={t("greeting", { name: session.user.name })}
        description={t("subtitle", {
          role: session.role.name,
          store: appConfig.brand.storeName,
          date: format.dateTime(now, { dateStyle: "full", timeZone: operations.timeZone }),
        })}
      />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-5 text-ink-muted" aria-hidden="true" />
              {t("hoursTitle")}
            </CardTitle>
            <CardDescription>
              {!hours.enabled
                ? t("hoursAlways")
                : state.today
                  ? t("hoursToday", { open: state.today.open, close: state.today.close })
                  : t("hoursClosedToday")}
            </CardDescription>
          </CardHeader>
          <p className="text-sm font-medium text-ink">
            {blocked ? t("closedNow") : state.open ? t("openNow") : t("afterHoursAllowed")}
          </p>
        </Card>
        {keepsShift ? (
          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="size-5 text-ink-muted" aria-hidden="true" />
                {t("shiftTitle")}
              </CardTitle>
              <CardDescription>
                {shift
                  ? t("shiftOpen", {
                      time: format.dateTime(shift.openedAt, { timeStyle: "short" }),
                    })
                  : t("shiftClosed")}
              </CardDescription>
            </CardHeader>
            <Button asChild variant={shift ? "secondary" : "primary"} className="self-start">
              <Link href={shiftHref}>
                {usesPos ? (shift ? t("toPos") : t("openShift")) : t("toSales")}
              </Link>
            </Button>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("shortcutsTitle")}</CardTitle>
        </CardHeader>
        {shortcuts.length === 0 ? (
          <EmptyState
            icon={<KeyRound aria-hidden="true" />}
            title={t("noAccessTitle")}
            description={t("noAccessDescription")}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shortcuts.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex min-h-20 flex-col items-start justify-between gap-2 rounded-card border border-border p-4 text-sm font-medium text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                    {tNav(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
