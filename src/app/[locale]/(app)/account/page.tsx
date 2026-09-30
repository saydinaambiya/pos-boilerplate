import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { toneClasses } from "@/components/ui/tone";
import { appConfig } from "@/config/app.config";
import { changePasswordAction } from "@/features/auth/actions";
import { RecoveryCodesCard } from "@/features/auth/components/recovery-codes-card";
import { getRecoveryCodeStatus } from "@/features/auth/service";
import { redirect } from "@/i18n/navigation";
import { requireSession } from "@/lib/auth/guard";
import { cn } from "@/lib/utils/cn";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account");
  return { title: t("title") };
}

/** Codes left at which the page asks for a new set (ADR-0037). */
const LOW_CODES = 2;

/**
 * Password change and recovery codes for password accounts, i.e. the Owner
 * (FR-AUTH-11/12, ADR-0037). PIN accounts are sent home; the Owner resets
 * their PIN instead (FR-AUTH-06).
 */
export default async function AccountPage() {
  const session = await requireSession();
  const [t, tCommon, format, locale, status] = await Promise.all([
    getTranslations("Account"),
    getTranslations("Common"),
    getFormatter(),
    getLocale(),
    getRecoveryCodeStatus(session),
  ]);
  if (!status) return redirect({ href: "/", locale });
  const reveal = { show: tCommon("showSecret"), hide: tCommon("hideSecret") };

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card className="self-start">
          <CardHeader className="flex-col gap-1">
            <CardTitle>{t("changePasswordTitle")}</CardTitle>
            <CardDescription>{t("changePasswordDescription")}</CardDescription>
          </CardHeader>
          <ActionForm action={changePasswordAction} locale={locale}>
            <FormField
              name="currentPassword"
              label={t("currentPassword")}
              reveal={reveal}
              autoComplete="current-password"
              maxLength={128}
            />
            <FormField
              name="password"
              label={t("newPassword")}
              hint={t("newPasswordHint")}
              reveal={reveal}
              autoComplete="new-password"
              maxLength={128}
            />
            <FormField
              name="confirmPassword"
              label={t("confirmPassword")}
              reveal={reveal}
              autoComplete="new-password"
              maxLength={128}
            />
            <SubmitButton className="self-start">{t("savePassword")}</SubmitButton>
          </ActionForm>
        </Card>

        <Card className="self-start">
          <CardHeader className="flex-col gap-1">
            <CardTitle>{t("codesTitle")}</CardTitle>
            <CardDescription>{t("codesDescription")}</CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-4">
            {status.total === 0 ? (
              <p className={cn("rounded-control px-3 py-2 text-sm", toneClasses.warning)}>
                {t("codesNone")}
              </p>
            ) : (
              <p className="text-sm text-ink">
                {t("codesStatus", {
                  unused: status.unused,
                  total: status.total,
                  date: status.createdAt
                    ? format.dateTime(status.createdAt, { dateStyle: "medium" })
                    : "",
                })}
              </p>
            )}
            {status.total > 0 && status.unused <= LOW_CODES ? (
              <p className={cn("rounded-control px-3 py-2 text-sm", toneClasses.warning)}>
                {t("codesLow")}
              </p>
            ) : null}
            <RecoveryCodesCard
              locale={locale}
              hasCodes={status.total > 0}
              fileHeader={t("codesFileHeader", {
                appName: appConfig.brand.appName,
                username: session.user.username,
              })}
              labels={{
                currentPassword: t("currentPassword"),
                passwordHint: t("codesPasswordHint"),
                generate: t("generateCodes"),
                regenerate: t("regenerateCodes"),
                regenerateWarning: t("regenerateWarning"),
                shownOnce: t("codesShownOnce"),
                listLabel: t("codesListLabel"),
                copy: t("copyCodes"),
                copied: t("copied"),
                download: t("downloadCodes"),
                saved: t("codesSaved"),
                reveal,
              }}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
