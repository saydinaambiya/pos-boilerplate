import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { RouteDialog } from "@/components/ui/route-dialog";
import type { Session } from "@/lib/auth/session";

import { getOrderMarketplaces } from "../service";
import { OrderEntryForm } from "./order-entry-form";

interface NewOrderDialogProps {
  session: Session;
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}

/** Manual entry of a marketplace order in a dialog (FR-ONL-01/02, ADR-0018). */
export async function NewOrderDialog({ session, closeHref }: NewOrderDialogProps) {
  const [t, tCommon, locale, marketplaces, messages] = await Promise.all([
    getTranslations("OnlineOrders"),
    getTranslations("Common"),
    getLocale(),
    getOrderMarketplaces(session),
    getMessages(),
  ]);

  return (
    <RouteDialog
      closeHref={closeHref}
      closeLabel={tCommon("close")}
      size="xl"
      title={t("newTitle")}
      description={t("newSubtitle")}
    >
      {marketplaces.length === 0 ? (
        <EmptyState title={t("noMarketplacesTitle")} description={t("noMarketplacesDescription")} />
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
    </RouteDialog>
  );
}
