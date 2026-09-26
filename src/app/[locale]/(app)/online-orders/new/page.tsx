import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { OrderEntryForm } from "@/features/online-orders/components/order-entry-form";
import { getOrderMarketplaces } from "@/features/online-orders/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OnlineOrders");
  return { title: t("newTitle") };
}

/** Manual entry of a marketplace order (FR-ONL-01/02). */
export default async function NewOnlineOrderPage() {
  const session = await requirePermission("page:online-orders");
  const [t, locale, marketplaces, messages] = await Promise.all([
    getTranslations("OnlineOrders"),
    getLocale(),
    getOrderMarketplaces(session),
    getMessages(),
  ]);

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        description={t("newSubtitle")}
        actions={
          <Button asChild variant="secondary">
            <Link href="/online-orders">{t("back")}</Link>
          </Button>
        }
      />
      <Card className="max-w-3xl">
        {marketplaces.length === 0 ? (
          <EmptyState
            title={t("noMarketplacesTitle")}
            description={t("noMarketplacesDescription")}
          />
        ) : (
          <NextIntlClientProvider
            messages={{
              OnlineOrders: messages.OnlineOrders,
              Feedback: messages.Feedback,
              Picker: messages.Picker,
            }}
          >
            <OrderEntryForm locale={locale} marketplaces={marketplaces} />
          </NextIntlClientProvider>
        )}
      </Card>
    </>
  );
}
