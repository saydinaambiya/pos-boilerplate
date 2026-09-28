import { LogOut, MonitorSmartphone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { logoutAction } from "@/features/auth/actions";
import { LOCALE_FIELD } from "@/i18n/form-locale";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/lib/auth/guard";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/**
 * Signed-in account, a link to its devices (FR-AUTH-10) and sign-out
 * ("ganti kasir", FR-AUTH-08). A plain form, so it works without client
 * JavaScript. `card` is the sidebar variant under the logo with initials,
 * name, role and icon-only devices and sign-out buttons.
 */
export async function AccountMenu({ variant = "inline" }: { variant?: "inline" | "card" }) {
  const session = await getSession();
  if (!session) return null;
  const [t, locale] = await Promise.all([getTranslations("Auth"), getLocale()]);
  const account = t("account", { name: session.user.name, role: session.role.name });

  if (variant === "card") {
    return (
      <form
        action={logoutAction}
        className="flex items-center gap-3 rounded-card bg-surface-muted p-2"
      >
        <input type="hidden" name={LOCALE_FIELD} value={locale} />
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-ink"
        >
          {initials(session.user.name)}
        </span>
        <span className="sr-only">{account}</span>
        <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-ink">{session.user.name}</span>
          <span className="truncate text-xs text-ink-muted">{session.role.name}</span>
        </span>
        <Link
          href="/devices"
          aria-label={t("devices")}
          title={t("devices")}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <MonitorSmartphone className="size-4" aria-hidden="true" />
        </Link>
        <button
          type="submit"
          aria-label={t("logout")}
          title={t("logout")}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <LogOut className="size-4" aria-hidden="true" />
        </button>
      </form>
    );
  }

  return (
    <form action={logoutAction} className="flex items-center gap-2">
      <input type="hidden" name={LOCALE_FIELD} value={locale} />
      <span className="sr-only">{account}</span>
      <span aria-hidden="true" title={account} className="max-w-32 truncate text-sm text-ink-muted">
        {session.user.name}
      </span>
      <Link
        href="/devices"
        aria-label={t("devices")}
        title={t("devices")}
        className="inline-flex size-11 items-center justify-center rounded-control text-ink transition-colors hover:bg-surface-muted"
      >
        <MonitorSmartphone className="size-4" aria-hidden="true" />
      </Link>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-muted"
      >
        <LogOut className="size-4" aria-hidden="true" />
        <span>{t("logout")}</span>
      </button>
    </form>
  );
}
