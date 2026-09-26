import { getTranslations } from "next-intl/server";

import { SectionTabs } from "@/components/shell/section-tabs";
import type { Session } from "@/lib/auth/session";

/** Products / categories switch; the categories tab needs `category:manage`. */
export async function CatalogTabs({
  current,
  session,
}: {
  current: "products" | "categories";
  session: Session;
}) {
  const t = await getTranslations("Catalog");
  const tabs = [
    { id: "products", href: "/products", label: t("tabProducts") },
    ...(session.permissions.has("category:manage")
      ? [{ id: "categories", href: "/products/categories", label: t("tabCategories") }]
      : []),
  ];
  return <SectionTabs label={t("tabsLabel")} current={current} tabs={tabs} />;
}
