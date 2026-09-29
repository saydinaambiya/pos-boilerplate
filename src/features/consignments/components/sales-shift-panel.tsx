import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CloseShiftDialog, OpenShiftCard } from "@/features/shifts/components/shift-controls";
import { getOpenShift } from "@/features/shifts/service";
import { Link } from "@/i18n/navigation";
import type { Session } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/format/currency";

/**
 * A salesperson's own shift in the Sales menu (ADR-0029): money for sold
 * goods goes into it, so it is opened and closed here without the
 * cashier. `closing` opens the close dialog over the page.
 */
export async function SalesShiftPanel({
  session,
  closing,
}: {
  session: Session;
  closing: boolean;
}) {
  const [t, format, locale, shift] = await Promise.all([
    getTranslations("Consignments"),
    getFormatter(),
    getLocale(),
    getOpenShift(session),
  ]);
  if (!shift) return <OpenShiftCard description={t("shiftOpenDescription")} />;
  return (
    <>
      <Card className="max-w-md">
        <CardHeader className="flex-col gap-1">
          <CardTitle>{t("shiftTitle")}</CardTitle>
          <CardDescription>
            {t("shiftSince", {
              time: format.dateTime(shift.openedAt, { dateStyle: "medium", timeStyle: "short" }),
              cash: formatCurrency(shift.expectedCash, locale),
            })}
          </CardDescription>
        </CardHeader>
        <Button asChild variant="secondary" className="self-start">
          <Link href={{ pathname: "/consignments", query: { closeShift: "1" } }} scroll={false}>
            {t("shiftClose")}
          </Link>
        </Button>
      </Card>
      {closing ? <CloseShiftDialog shift={shift} closeHref="/consignments" /> : null}
    </>
  );
}
