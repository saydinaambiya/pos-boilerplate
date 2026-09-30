import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { RecoverForm } from "@/features/auth/components/recover-form";
import { usernameSchema } from "@/features/auth/schemas";
import { Link, redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account");
  return { title: t("recoverTitle") };
}

/** Forgotten Owner password, reset with a recovery code (FR-AUTH-12, ADR-0037). */
export default async function RecoverPage({ searchParams }: PageProps<"/[locale]/recover">) {
  const [session, locale, t, tAuth, tCommon, params] = await Promise.all([
    getSession(),
    getLocale(),
    getTranslations("Account"),
    getTranslations("Auth"),
    getTranslations("Common"),
    searchParams,
  ]);
  if (session) return redirect({ href: "/", locale });
  const username = usernameSchema.safeParse(params.username);

  return (
    <>
      <h1 className="text-xl font-semibold text-ink">{t("recoverTitle")}</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">{t("recoverSubtitle")}</p>
      <RecoverForm
        locale={locale}
        username={username.success ? username.data : ""}
        labels={{
          username: tAuth("username"),
          code: t("recoveryCode"),
          codeHint: t("recoveryCodeHint"),
          password: t("newPassword"),
          passwordHint: t("newPasswordHint"),
          confirmPassword: t("confirmPassword"),
          submit: t("recoverSubmit"),
          reveal: { show: tCommon("showSecret"), hide: tCommon("hideSecret") },
        }}
      />
      <p className="mt-6 text-xs text-ink-muted">{t("noCodesHelp")}</p>
      <Link
        href="/login"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4"
      >
        {t("backToLogin")}
      </Link>
    </>
  );
}
