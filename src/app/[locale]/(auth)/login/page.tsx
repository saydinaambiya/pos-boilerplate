import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { appConfig } from "@/config/app.config";
import { LoginForm } from "@/features/auth/components/login-form";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("loginTitle") };
}

export default async function LoginPage() {
  const [session, locale, t] = await Promise.all([
    getSession(),
    getLocale(),
    getTranslations("Auth"),
  ]);
  if (session) return redirect({ href: session.user.mustChangePin ? "/change-pin" : "/", locale });

  return (
    <>
      <h1 className="text-xl font-semibold text-ink">{t("loginTitle")}</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        {t("loginSubtitle", { appName: appConfig.brand.appName })}
      </p>
      <LoginForm
        locale={locale}
        labels={{
          username: t("username"),
          secret: t("secret"),
          secretHint: t("secretHint"),
          submit: t("submit"),
          submitting: t("submitting"),
        }}
      />
    </>
  );
}
