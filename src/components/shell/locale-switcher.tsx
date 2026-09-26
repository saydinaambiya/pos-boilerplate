"use client";

import { useLocale } from "next-intl";

import { locales, type Locale } from "@/config/locales";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

interface LocaleSwitcherProps {
  label: string;
  names: Record<Locale, string>;
}

export function LocaleSwitcher({ label, names }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const current = useLocale();

  return (
    <nav aria-label={label} className="flex rounded-full bg-surface-muted p-1">
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
            "inline-flex min-h-9 min-w-11 items-center justify-center rounded-full px-3 text-xs font-semibold text-ink-muted uppercase",
            locale === current && "bg-surface text-ink shadow-sm",
          )}
        >
          <span aria-hidden="true">{locale}</span>
          <span className="sr-only">{names[locale]}</span>
        </Link>
      ))}
    </nav>
  );
}
