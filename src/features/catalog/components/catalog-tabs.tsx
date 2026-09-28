import { getTranslations } from "next-intl/server";

import { SectionTabs } from "@/components/shell/section-tabs";
import type { Session } from "@/lib/auth/session";

/** Products / brands switch; the brands tab needs `brand:manage`. */
export async function CatalogTabs({
  current,
  session,
}: {
  current: "products" | "brands";
  session: Session;
}) {
  const t = await getTranslations("Catalog");
  const tabs = [
    { id: "products", href: "/products", label: t("tabProducts") },
    ...(session.permissions.has("brand:manage")
      ? [{ id: "brands", href: "/products/brands", label: t("tabBrands") }]
      : []),
  ];
  return <SectionTabs label={t("tabsLabel")} current={current} tabs={tabs} />;
}
