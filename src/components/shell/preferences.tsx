import { getTranslations } from "next-intl/server";

import { cn } from "@/lib/utils/cn";

import { AccountMenu } from "./account-menu";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeSwitcher } from "./theme-switcher";

export async function Preferences({ className }: { className?: string }) {
  const t = await getTranslations("Preferences");

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <ThemeSwitcher />
      <LocaleSwitcher label={t("language")} names={{ id: t("languageId"), en: t("languageEn") }} />
      <AccountMenu />
    </div>
  );
}
