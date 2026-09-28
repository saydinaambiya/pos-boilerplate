import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ActionForm } from "@/components/form/action-form";
import { ConfirmAction } from "@/components/form/confirm-action";
import { FormField, FormSelect } from "@/components/form/form-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  resetEmployeePinAction,
  setEmployeeStatusAction,
  updateEmployeeAction,
} from "@/features/employees/actions";
import { endUserDeviceAction } from "@/features/devices/actions";
import { DeviceList } from "@/features/devices/components/device-list";
import { getUserDevices } from "@/features/devices/service";
import { EmployeeStatusChips } from "@/features/employees/components/employee-status-chips";
import { getEmployee } from "@/features/employees/service";
import { getAssignableRoles } from "@/features/roles/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Employees");
  return { title: t("editTitle") };
}

/**
 * Edit profile, reset PIN, sign out devices and change status of one
 * employee (FR-EMP-01/02, FR-AUTH-06, FR-AUTH-10).
 */
export default async function EditEmployeePage({ params }: PageProps<"/[locale]/employees/[id]">) {
  const { id } = await params;
  const session = await requirePermission("employee:manage");
  if (!z.uuid().safeParse(id).success) notFound();

  const [t, tCommon, tDevices, locale, employee, roles, devices] = await Promise.all([
    getTranslations("Employees"),
    getTranslations("Common"),
    getTranslations("Devices"),
    getLocale(),
    getEmployee(session, id),
    getAssignableRoles(session),
    getUserDevices(session, id),
  ]);
  if (!employee) notFound();

  const roleOptions = roles.map((role) => ({ value: role.id, label: role.name }));
  if (!roles.some((role) => role.id === employee.roleId)) {
    roleOptions.unshift({ value: employee.roleId, label: employee.roleName });
  }
  const isSelf = employee.id === session.user.id;

  return (
    <>
      <PageHeader
        title={employee.name}
        description={employee.username}
        actions={
          <Button asChild variant="secondary">
            <Link href="/employees">{t("back")}</Link>
          </Button>
        }
      />
      <div className="mb-6">
        <EmployeeStatusChips employee={employee} now={new Date()} />
      </div>

      {employee.isOwner ? (
        <Card className="max-w-xl">
          <CardDescription>{t("ownerNote")}</CardDescription>
        </Card>
      ) : (
        <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("profile")}</CardTitle>
            </CardHeader>
            <ActionForm action={updateEmployeeAction.bind(null, employee.id)} locale={locale}>
              <FormField
                name="name"
                label={t("name")}
                defaultValue={employee.name}
                maxLength={80}
                autoComplete="off"
              />
              <FormSelect
                name="roleId"
                label={t("role")}
                defaultValue={employee.roleId}
                options={roleOptions}
              />
              <SubmitButton className="self-start">{t("save")}</SubmitButton>
            </ActionForm>
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader className="flex-col gap-1">
                <CardTitle>{t("resetPin")}</CardTitle>
                <CardDescription>{t("resetPinDescription")}</CardDescription>
              </CardHeader>
              <ActionForm action={resetEmployeePinAction.bind(null, employee.id)} locale={locale}>
                <FormField
                  name="pin"
                  label={t("temporaryPin")}
                  hint={t("temporaryPinHint")}
                  reveal={{ show: tCommon("showSecret"), hide: tCommon("hideSecret") }}
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="new-password"
                />
                <SubmitButton variant="secondary" className="self-start">
                  {t("resetPin")}
                </SubmitButton>
              </ActionForm>
            </Card>

            {devices ? (
              <Card>
                <CardHeader className="flex-col gap-1">
                  <CardTitle>{tDevices("title")}</CardTitle>
                  <CardDescription>{tDevices("employeeDescription")}</CardDescription>
                </CardHeader>
                <DeviceList
                  data={devices}
                  ownerName={employee.name}
                  endAction={(sessionId) => endUserDeviceAction.bind(null, employee.id, sessionId)}
                />
              </Card>
            ) : null}

            {isSelf ? null : (
              <Card>
                <CardHeader className="flex-col gap-1">
                  <CardTitle>{t("statusSection")}</CardTitle>
                  <CardDescription>
                    {employee.isActive ? t("statusActive") : t("statusInactive")}
                  </CardDescription>
                </CardHeader>
                <ConfirmAction
                  action={setEmployeeStatusAction.bind(null, employee.id, !employee.isActive)}
                  locale={locale}
                  variant={employee.isActive ? "danger" : "secondary"}
                  labels={
                    employee.isActive
                      ? {
                          trigger: t("deactivate"),
                          title: t("deactivateTitle", { name: employee.name }),
                          description: t("deactivateDescription"),
                          confirm: t("deactivate"),
                          cancel: tCommon("cancel"),
                          close: tCommon("close"),
                        }
                      : {
                          trigger: t("activate"),
                          title: t("activateTitle", { name: employee.name }),
                          description: t("activateDescription"),
                          confirm: t("activate"),
                          cancel: tCommon("cancel"),
                          close: tCommon("close"),
                        }
                  }
                />
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
