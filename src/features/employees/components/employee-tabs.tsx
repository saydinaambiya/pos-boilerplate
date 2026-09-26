import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import type { Session } from "@/lib/auth/session";
import { cn } from "@/lib/utils/cn";

interface EmployeeTabsProps {
  current: "employees" | "roles";
  session: Session;
}

/** Switches between employees and roles; the roles tab needs `role:manage`. */
export async function EmployeeTabs({ current, session }: EmployeeTabsProps) {
  const t = await getTranslations("Employees");
  const tabs = [
    { id: "employees", href: "/employees", label: t("tabEmployees"), visible: true },
    {
      id: "roles",
      href: "/employees/roles",
      label: t("tabRoles"),
      visible: session.permissions.has("role:manage"),
    },
  ] as const;
  const visible = tabs.filter((tab) => tab.visible);
  if (visible.length < 2) return null;

  return (
    <nav aria-label={t("tabsLabel")} className="mb-6">
      <ul className="inline-flex rounded-full bg-surface-muted p-1">
        {visible.map((tab) => (
          <li key={tab.id}>
            <Link
              href={tab.href}
              aria-current={tab.id === current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium text-ink-muted hover:text-ink",
                tab.id === current && "bg-surface text-ink shadow-sm",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
