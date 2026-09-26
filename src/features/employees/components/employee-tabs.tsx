import { getTranslations } from "next-intl/server";

import { SectionTabs } from "@/components/shell/section-tabs";
import type { Session } from "@/lib/auth/session";

interface EmployeeTabsProps {
  current: "employees" | "roles";
  session: Session;
}

/** Switches between employees and roles; the roles tab needs `role:manage`. */
export async function EmployeeTabs({ current, session }: EmployeeTabsProps) {
  const t = await getTranslations("Employees");
  const tabs = [
    { id: "employees", href: "/employees", label: t("tabEmployees") },
    ...(session.permissions.has("role:manage")
      ? [{ id: "roles", href: "/employees/roles", label: t("tabRoles") }]
      : []),
  ];
  return <SectionTabs label={t("tabsLabel")} current={current} tabs={tabs} />;
}
