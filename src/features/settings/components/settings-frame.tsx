import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { ActionForm } from "@/components/form/action-form";
import { SubmitButton } from "@/components/form/submit-button";
import { SectionTabs } from "@/components/shell/section-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { getSession } from "@/lib/auth/guard";
import type { FormAction } from "@/lib/validation/form-state";

export type SettingsSection =
  "profile" | "tax" | "operations" | "hours" | "bank-accounts" | "marketplaces" | "account";

/**
 * Page title and section tabs shared by every settings page (FR-SET). The
 * account tab only shows for password accounts, i.e. the Owner (ADR-0037).
 */
export async function SettingsHeader({
  current,
  actions,
}: {
  current: SettingsSection;
  actions?: ReactNode;
}) {
  const [t, tAccount, session] = await Promise.all([
    getTranslations("Settings"),
    getTranslations("Account"),
    getSession(),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} actions={actions} />
      <SectionTabs
        label={t("tabsLabel")}
        current={current}
        tabs={[
          { id: "profile", href: "/settings", label: t("tabProfile") },
          { id: "tax", href: "/settings/tax", label: t("tabTax") },
          { id: "operations", href: "/settings/operations", label: t("tabOperations") },
          { id: "hours", href: "/settings/hours", label: t("tabHours") },
          { id: "bank-accounts", href: "/settings/bank-accounts", label: t("tabBankAccounts") },
          { id: "marketplaces", href: "/settings/marketplaces", label: t("tabMarketplaces") },
          ...(session?.user.credential === "password"
            ? [{ id: "account", href: "/settings/account", label: tAccount("title") }]
            : []),
        ]}
      />
    </>
  );
}

interface SettingsFormProps {
  action: FormAction;
  /** Without `settings:manage` the fields render disabled (view only). */
  canManage: boolean;
  submitLabel?: string;
  children: ReactNode;
}

export async function SettingsForm({
  action,
  canManage,
  submitLabel,
  children,
}: SettingsFormProps) {
  const [t, locale] = await Promise.all([getTranslations("Settings"), getLocale()]);
  return (
    <ActionForm action={action} locale={locale}>
      <fieldset disabled={!canManage} className="flex min-w-0 flex-col gap-4">
        {children}
      </fieldset>
      {canManage ? (
        <SubmitButton className="self-start">{submitLabel ?? t("save")}</SubmitButton>
      ) : (
        <p className="text-sm text-ink-muted">{t("readOnly")}</p>
      )}
    </ActionForm>
  );
}
