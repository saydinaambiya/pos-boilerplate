import { getTranslations } from "next-intl/server";

import { cn } from "@/lib/utils/cn";

import { AccountMenu } from "./account-menu";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeSwitcher } from "./theme-switcher";

/**
 * Theme, language and account controls. `inline` sits in a header row;
 * `stacked` is the drawer and sidebar footer: account card first (unless
 * the sidebar already shows it under the logo), then theme and language
 * side by side filling the width.
 */
export async function Preferences({
  className,
  variant = "inline",
  account = true,
}: {
  className?: string;
  variant?: "inline" | "stacked";
  account?: boolean;
}) {
  const t = await getTranslations("Preferences");
  const locale = (
    <LocaleSwitcher
      label={t("language")}
      names={{ id: t("languageId"), en: t("languageEn") }}
      fill={variant === "stacked"}
    />
  );

  if (variant === "stacked") {
    return (
      <div className={cn("flex flex-col gap-3 border-t border-border pt-4", className)}>
        {account ? <AccountMenu variant="card" /> : null}
        <div className="grid grid-cols-[3fr_2fr] gap-2">
          <ThemeSwitcher fill />
          {locale}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <ThemeSwitcher />
      {locale}
      <AccountMenu />
    </div>
  );
}
