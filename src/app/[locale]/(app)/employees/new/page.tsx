import { ShieldPlus } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormField, FormSelect } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { createEmployeeAction } from "@/features/employees/actions";
import { getAssignableRoles } from "@/features/roles/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Employees");
  return { title: t("newTitle") };
}

/** Create an employee with an initial PIN (FR-EMP-01, FR-AUTH-06). */
export default async function NewEmployeePage() {
  const session = await requirePermission("employee:manage");
  const [t, locale, roles] = await Promise.all([
    getTranslations("Employees"),
    getLocale(),
    getAssignableRoles(session),
  ]);

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        actions={
          <Button asChild variant="secondary">
            <Link href="/employees">{t("back")}</Link>
          </Button>
        }
      />
      <Card className="max-w-xl">
        {roles.length === 0 ? (
          <EmptyState
            icon={<ShieldPlus aria-hidden="true" />}
            title={t("noRoles")}
            action={
              session.permissions.has("role:manage") ? (
                <Button asChild>
                  <Link href="/employees/roles/new">{t("tabRoles")}</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ActionForm action={createEmployeeAction} locale={locale}>
            <FormField name="name" label={t("name")} maxLength={80} autoComplete="off" />
            <FormField
              name="username"
              label={t("username")}
              hint={t("usernameHint")}
              maxLength={32}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
            <FormSelect
              name="roleId"
              label={t("role")}
              options={roles.map((role) => ({ value: role.id, label: role.name }))}
            />
            <FormField
              name="pin"
              label={t("initialPin")}
              hint={t("initialPinHint")}
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="new-password"
            />
            <SubmitButton className="self-start">{t("create")}</SubmitButton>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
