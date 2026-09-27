import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";
import { z } from "zod";

import { ActionForm } from "@/components/form/action-form";
import { ConfirmAction } from "@/components/form/confirm-action";
import { FormField } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { DialogSection } from "@/components/ui/dialog";
import { RouteDialog } from "@/components/ui/route-dialog";
import { permissions } from "@/config/permissions";
import type { Session } from "@/lib/auth/session";

import { createRoleAction, setRoleStatusAction, updateRoleAction } from "../actions";
import { permissionMatrixGroups } from "../permission-labels";
import { getRole } from "../service";
import { PermissionMatrix } from "./permission-matrix";

interface RoleDialogProps {
  session: Session;
  /** The role to edit; null creates one. */
  roleId: string | null;
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}

/**
 * Create a role, or edit its name, permissions and status, in a dialog over
 * the role list (FR-RBAC-01/03, ADR-0018). System roles are shown read-only.
 * Renders nothing for an unknown role.
 */
export async function RoleDialog({ session, roleId, closeHref }: RoleDialogProps) {
  if (roleId !== null && !z.uuid().safeParse(roleId).success) return null;
  const [t, tCommon, locale, groups, role] = await Promise.all([
    getTranslations("Roles"),
    getTranslations("Common"),
    getLocale(),
    permissionMatrixGroups(),
    roleId === null ? null : getRole(session, roleId),
  ]);
  if (roleId !== null && !role) return null;
  const common = { closeHref, closeLabel: tCommon("close"), size: "xl" } as const;

  if (!role) {
    return (
      <RouteDialog {...common} title={t("newTitle")}>
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
      </RouteDialog>
    );
  }

  if (role.isSystem) {
    return (
      <RouteDialog {...common} title={role.name} description={t("systemNote")}>
        <PermissionMatrix groups={groups} defaultSelected={permissions} disabled />
      </RouteDialog>
    );
  }

  return (
    <RouteDialog {...common} title={role.name}>
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
      <DialogSection
        title={t("statusSection")}
        description={role.isActive ? t("statusActive") : t("statusInactive")}
      >
        <div>
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
        </div>
      </DialogSection>
    </RouteDialog>
  );
}
