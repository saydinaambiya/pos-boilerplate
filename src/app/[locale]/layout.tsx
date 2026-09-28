import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Outfit } from "next/font/google";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingIndicator } from "@/components/feedback/loading-indicator";
import { StyleNonce } from "@/components/shell/style-nonce";
import { appConfig } from "@/config/app.config";
import { routing } from "@/i18n/routing";
import { getNonce } from "@/lib/security/nonce";
import { paletteStylesheetHref } from "@/lib/theme/active-palette";
import { getTheme } from "@/lib/theme/theme-cookie";

import "../globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

const { appName, storeName, logo } = appConfig.brand;

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
    namespace: "Metadata",
  });

  return {
    title: { default: appName, template: `%s · ${appName}` },
    description: t("description", { storeName }),
    applicationName: appName,
    icons: { icon: logo.icon, apple: logo.icon },
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const [theme, nonce, messages, tCommon] = await Promise.all([
    getTheme(),
    getNonce(),
    getMessages(),
    getTranslations({ locale, namespace: "Common" }),
  ]);

  return (
    <html lang={locale} data-theme={theme} className={outfit.variable}>
      <head>
        <link rel="stylesheet" href={paletteStylesheetHref} />
      </head>
      <body>
        {/* Client components receive translated props; only the tiny feedback and picker catalogs are shipped. */}
        <StyleNonce nonce={nonce} />
        <NextIntlClientProvider messages={{ Feedback: messages.Feedback, Picker: messages.Picker }}>
          {children}
        </NextIntlClientProvider>
        <Suspense fallback={null}>
          <LoadingIndicator label={tCommon("loading")} />
        </Suspense>
      </body>
    </html>
  );
}
