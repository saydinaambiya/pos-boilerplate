import { UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import { EmployeeStatusChips } from "@/features/employees/components/employee-status-chips";
import { NewEmployeeDialog } from "@/features/employees/components/new-employee-dialog";
import { EmployeeTabs } from "@/features/employees/components/employee-tabs";
import { getEmployees } from "@/features/employees/service";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { firstParam } from "@/lib/utils/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Employees");
  return { title: t("title") };
}

/** Employee list (FR-EMP-01/02); `?new=1` opens the create dialog (ADR-0018). */
export default async function EmployeesPage({ searchParams }: PageProps<"/[locale]/employees">) {
  const session = await requirePermission("page:employees");
  const [t, employees] = await Promise.all([getTranslations("Employees"), getEmployees(session)]);
  const canManage = session.permissions.has("employee:manage");
  const creating = canManage && firstParam((await searchParams).new) === "1";
  const now = new Date();

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/employees?new=1" scroll={false}>
                <UserPlus aria-hidden="true" />
                {t("add")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <EmployeeTabs current="employees" session={session} />
      <Card>
        {employees.length === 0 ? (
          <EmptyState
            icon={<Users aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Table>
            <TableCaption>{t("listCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("username")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">
                    {canManage && !employee.isOwner ? (
                      <Link
                        href={`/employees/${employee.id}`}
                        aria-label={t("edit", { name: employee.name })}
                        className="underline-offset-4 hover:underline"
                      >
                        {employee.name}
                      </Link>
                    ) : (
                      employee.name
                    )}
                  </TableCell>
                  <TableCell className="text-ink-muted">{employee.username}</TableCell>
                  <TableCell>{employee.roleName}</TableCell>
                  <TableCell>
                    <EmployeeStatusChips employee={employee} now={now} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {creating ? <NewEmployeeDialog session={session} closeHref="/employees" /> : null}
    </>
  );
}
