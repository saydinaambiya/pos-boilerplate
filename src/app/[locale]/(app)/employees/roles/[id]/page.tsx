import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ActionForm } from "@/components/form/action-form";
import { ConfirmAction } from "@/components/form/confirm-action";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { permissions } from "@/config/permissions";
import { setRoleStatusAction, updateRoleAction } from "@/features/roles/actions";
import { PermissionMatrix } from "@/features/roles/components/permission-matrix";
import { permissionMatrixGroups } from "@/features/roles/permission-labels";
import { getRole } from "@/features/roles/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Roles");
  return { title: t("editTitle") };
}

/** Edit a role's name, permissions and status (FR-RBAC-01/03). */
export default async function EditRolePage({
  params,
}: PageProps<"/[locale]/employees/roles/[id]">) {
  const { id } = await params;
  const session = await requirePermission("role:manage");
  if (!z.uuid().safeParse(id).success) notFound();

  const [t, tCommon, locale, groups, role] = await Promise.all([
    getTranslations("Roles"),
    getTranslations("Common"),
    getLocale(),
    permissionMatrixGroups(),
    getRole(session, id),
  ]);
  if (!role) notFound();

  const back = (
    <Button asChild variant="secondary">
      <Link href="/employees/roles">{t("back")}</Link>
    </Button>
  );

  if (role.isSystem) {
    return (
      <>
        <PageHeader title={role.name} description={t("systemNote")} actions={back} />
        <Card>
          <PermissionMatrix groups={groups} defaultSelected={permissions} disabled />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={role.name} actions={back} />
      <div className="flex flex-col gap-6">
        <Card>
          <ActionForm action={updateRoleAction.bind(null, role.id)} locale={locale}>
            <FormField
              name="name"
              label={t("name")}
              defaultValue={role.name}
              maxLength={40}
              autoComplete="off"
              className="max-w-md"
            />
            <PermissionMatrix groups={groups} defaultSelected={role.permissions} />
            <SubmitButton className="self-start">{t("save")}</SubmitButton>
          </ActionForm>
        </Card>
        <Card className="max-w-xl">
          <CardHeader className="flex-col gap-1">
            <CardTitle>{t("statusSection")}</CardTitle>
            <CardDescription>
              {role.isActive ? t("statusActive") : t("statusInactive")}
            </CardDescription>
          </CardHeader>
          <ConfirmAction
            action={setRoleStatusAction.bind(null, role.id, !role.isActive)}
            locale={locale}
            variant={role.isActive ? "danger" : "secondary"}
            labels={{
              trigger: role.isActive ? t("deactivate") : t("activate"),
              title: role.isActive
                ? t("deactivateTitle", { name: role.name })
                : t("activateTitle", { name: role.name }),
              description: role.isActive ? t("deactivateDescription") : t("activateDescription"),
              confirm: role.isActive ? t("deactivate") : t("activate"),
              cancel: tCommon("cancel"),
              close: tCommon("close"),
            }}
          />
        </Card>
      </div>
    </>
  );
}
