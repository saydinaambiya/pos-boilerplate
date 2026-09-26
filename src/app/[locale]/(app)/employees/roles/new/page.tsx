import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/form/action-form";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { createRoleAction } from "@/features/roles/actions";
import { PermissionMatrix } from "@/features/roles/components/permission-matrix";
import { permissionMatrixGroups } from "@/features/roles/permission-labels";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Roles");
  return { title: t("newTitle") };
}

/** Create a role and pick its permissions (FR-RBAC-01). */
export default async function NewRolePage() {
  await requirePermission("role:manage");
  const [t, locale, groups] = await Promise.all([
    getTranslations("Roles"),
    getLocale(),
    permissionMatrixGroups(),
  ]);

  return (
    <>
      <PageHeader
        title={t("newTitle")}
        actions={
          <Button asChild variant="secondary">
            <Link href="/employees/roles">{t("back")}</Link>
          </Button>
        }
      />
      <Card>
        <ActionForm action={createRoleAction} locale={locale}>
          <FormField
            name="name"
            label={t("name")}
            maxLength={40}
            autoComplete="off"
            className="max-w-md"
          />
          <PermissionMatrix groups={groups} defaultSelected={[]} />
          <SubmitButton className="self-start">{t("create")}</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
