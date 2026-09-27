import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { Theme } from "@/config/locales";
import { setTheme } from "@/features/preferences/actions";
import { getTheme } from "@/lib/theme/theme-cookie";
import { cn } from "@/lib/utils/cn";

const options = [
  { value: "light", icon: Sun, label: "themeLight" },
  { value: "dark", icon: Moon, label: "themeDark" },
  { value: "system", icon: Monitor, label: "themeSystem" },
] as const satisfies readonly { value: Theme; icon: LucideIcon; label: string }[];

/** Plain form posting to a Server Action: works before and without hydration. */
export async function ThemeSwitcher({ fill = false }: { fill?: boolean }) {
  const [t, current] = await Promise.all([getTranslations("Preferences"), getTheme()]);

  return (
    <form
      action={setTheme}
      aria-label={t("theme")}
      className={cn("flex rounded-full bg-surface-muted p-1", fill && "w-full")}
    >
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="submit"
          name="theme"
          value={value}
          title={t(label)}
          aria-label={t(label)}
          aria-pressed={current === value}
          className={cn(
            "inline-flex min-h-9 min-w-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-ink",
            fill && "min-w-0 flex-1",
            current === value ? "bg-surface text-ink shadow-sm" : "hover:bg-surface/60",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </form>
  );
}
