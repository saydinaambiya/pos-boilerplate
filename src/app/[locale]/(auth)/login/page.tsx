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

export default async function LoginPage({ searchParams }: PageProps<"/[locale]/login">) {
  const [session, locale, t, tCommon, params] = await Promise.all([
    getSession(),
    getLocale(),
    getTranslations("Auth"),
    getTranslations("Common"),
    searchParams,
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
        notice={params.recovered === "1" ? t("recovered") : undefined}
        labels={{
          username: t("username"),
          next: t("next"),
          password: t("password"),
          pin: t("pin"),
          pinHint: t("pinHint"),
          changeUser: t("changeUser"),
          signingInAs: t("signingInAs", { username: "{username}" }),
          submit: t("submit"),
          submitting: t("submitting"),
          forgotPassword: t("forgotPassword"),
          reveal: { show: tCommon("showSecret"), hide: tCommon("hideSecret") },
        }}
      />
    </>
  );
}
