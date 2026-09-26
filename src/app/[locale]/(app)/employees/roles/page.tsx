import { CircleCheck, CircleOff, Lock, ShieldPlus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { permissions } from "@/config/permissions";
import { EmployeeTabs } from "@/features/employees/components/employee-tabs";
import { getRoles } from "@/features/roles/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Roles");
  return { title: t("title") };
}

/** Role list (FR-RBAC-01). */
export default async function RolesPage() {
  const session = await requirePermission("role:manage");
  const [t, tEmployees, roles] = await Promise.all([
    getTranslations("Roles"),
    getTranslations("Employees"),
    getRoles(session),
  ]);

  return (
    <>
      <PageHeader
        title={tEmployees("title")}
        description={t("subtitle")}
        actions={
          <Button asChild>
            <Link href="/employees/roles/new">
              <ShieldPlus aria-hidden="true" />
              {t("add")}
            </Link>
          </Button>
        }
      />
      <EmployeeTabs current="roles" session={session} />
      <Card>
        <Table>
          <TableCaption>{t("listCaption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("permissions")}</TableHead>
              <TableHead>{t("members")}</TableHead>
              <TableHead>{t("status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/employees/roles/${role.id}`}
                    aria-label={t("edit", { name: role.name })}
                    className="underline-offset-4 hover:underline"
                  >
                    {role.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {t("permissionCount", {
                    count: role.isSystem ? permissions.length : role.permissionCount,
                  })}
                </TableCell>
                <TableCell>{t("memberCount", { count: role.userCount })}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1.5">
                    {role.isSystem ? (
                      <Chip tone="primary" icon={<Lock aria-hidden="true" />}>
                        {t("system")}
                      </Chip>
                    ) : null}
                    {role.isActive ? (
                      <Chip tone="success" icon={<CircleCheck aria-hidden="true" />}>
                        {t("active")}
                      </Chip>
                    ) : (
                      <Chip tone="neutral" icon={<CircleOff aria-hidden="true" />}>
                        {t("inactive")}
                      </Chip>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
