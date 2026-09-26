import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { ChangePinForm } from "@/features/auth/components/change-pin-form";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("changePinTitle") };
}

/** Reachable only while the account still has to replace its PIN (FR-AUTH-06). */
export default async function ChangePinPage() {
  const [session, locale, t] = await Promise.all([
    getSession(),
    getLocale(),
    getTranslations("Auth"),
  ]);
  if (!session) return redirect({ href: "/login", locale });
  if (!session.user.mustChangePin) return redirect({ href: "/", locale });

  return (
    <>
      <h1 className="text-xl font-semibold text-ink">{t("changePinTitle")}</h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">{t("changePinSubtitle")}</p>
      <ChangePinForm
        locale={locale}
        labels={{
          newPin: t("newPin"),
          newPinHint: t("newPinHint"),
          confirmPin: t("confirmPin"),
          submit: t("savePin"),
        }}
      />
    </>
  );
}
