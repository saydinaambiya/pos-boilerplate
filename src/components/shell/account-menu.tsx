import { LogOut } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { logoutAction } from "@/features/auth/actions";
import { LOCALE_FIELD } from "@/i18n/form-locale";
import { getSession } from "@/lib/auth/guard";

/**
 * Signed-in account and sign-out ("ganti kasir", FR-AUTH-08). A plain form,
 * so it works without client JavaScript.
 */
export async function AccountMenu() {
  const session = await getSession();
  if (!session) return null;
  const [t, locale] = await Promise.all([getTranslations("Auth"), getLocale()]);
  const account = t("account", { name: session.user.name, role: session.role.name });

  return (
    <form action={logoutAction} className="flex items-center gap-2">
      <input type="hidden" name={LOCALE_FIELD} value={locale} />
      <span className="sr-only">{account}</span>
      <span aria-hidden="true" title={account} className="max-w-32 truncate text-sm text-ink-muted">
        {session.user.name}
      </span>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium text-ink hover:bg-surface-muted"
      >
        <LogOut className="size-4" aria-hidden="true" />
        <span>{t("logout")}</span>
      </button>
    </form>
  );
}
