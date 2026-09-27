import { ShieldPlus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";

import { ActionForm } from "@/components/form/action-form";
import { FormField, FormSelect } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RouteDialog } from "@/components/ui/route-dialog";
import { getAssignableRoles } from "@/features/roles/service";
import { Link } from "@/i18n/navigation";
import type { Session } from "@/lib/auth/session";

import { createEmployeeAction } from "../actions";

interface NewEmployeeDialogProps {
  session: Session;
  closeHref: ComponentProps<typeof RouteDialog>["closeHref"];
}

/** Create an employee with an initial PIN in a dialog (FR-EMP-01, FR-AUTH-06, ADR-0018). */
export async function NewEmployeeDialog({ session, closeHref }: NewEmployeeDialogProps) {
  const [t, tCommon, locale, roles] = await Promise.all([
    getTranslations("Employees"),
    getTranslations("Common"),
    getLocale(),
    getAssignableRoles(session),
  ]);

  return (
    <RouteDialog closeHref={closeHref} closeLabel={tCommon("close")} title={t("newTitle")}>
      {roles.length === 0 ? (
        <EmptyState
          icon={<ShieldPlus aria-hidden="true" />}
          title={t("noRoles")}
          action={
            session.permissions.has("role:manage") ? (
              <Button asChild>
                <Link href="/employees/roles?new=1">{t("tabRoles")}</Link>
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
            reveal={{ show: tCommon("showSecret"), hide: tCommon("hideSecret") }}
            inputMode="numeric"
            maxLength={6}
            autoComplete="new-password"
          />
          <SubmitButton className="self-start">{t("create")}</SubmitButton>
        </ActionForm>
      )}
    </RouteDialog>
  );
}
