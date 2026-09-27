"use client";

import { useLocale } from "next-intl";

import { locales, type Locale } from "@/config/locales";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

interface LocaleSwitcherProps {
  label: string;
  names: Record<Locale, string>;
  /** Stretch to the container width, e.g. in the sidebar footer. */
  fill?: boolean;
}

export function LocaleSwitcher({ label, names, fill = false }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const current = useLocale();

  return (
    <nav
      aria-label={label}
      className={cn("flex rounded-full bg-surface-muted p-1", fill && "w-full")}
    >
      {locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          lang={locale}
          hrefLang={locale}
          title={names[locale]}
          aria-current={locale === current ? "true" : undefined}
          className={cn(
            "inline-flex min-h-9 min-w-11 items-center justify-center rounded-full px-3 text-xs font-semibold text-ink-muted uppercase transition-colors hover:text-ink",
            fill && "min-w-0 flex-1 px-0",
            locale === current ? "bg-surface text-ink shadow-sm" : "hover:bg-surface/60",
          )}
        >
          <span aria-hidden="true">{locale}</span>
          <span className="sr-only">{names[locale]}</span>
        </Link>
      ))}
    </nav>
  );
}
