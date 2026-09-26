import "server-only";

import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { forbidden } from "next/navigation";
import { cache } from "react";

import type { Locale } from "@/config/locales";
import type { Permission } from "@/config/permissions";
import { redirect } from "@/i18n/navigation";

import { SESSION_COOKIE } from "./policy";
import { type Session, validateSessionToken } from "./session";
import { isWellFormedSessionToken } from "./session-token";

export async function getSessionToken(): Promise<string | undefined> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return isWellFormedSessionToken(token) ? token : undefined;
}

/** Current viewer's session, resolved once per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = await getSessionToken();
  return token ? validateSessionToken(token) : null;
});

/**
 * Requires a signed-in user who has finished onboarding. Call it from every
 * page and Server Action: layouts are not re-rendered on client navigation,
 * so they cannot be the only gate (FR-RBAC-02). Server Actions pass the
 * locale explicitly because they cannot read root params.
 */
export async function requireSession(locale?: Locale): Promise<Session> {
  const session = await getSession();
  if (session && !session.user.mustChangePin) return session;
  const target = locale ?? (await getLocale());
  return redirect({ href: session ? "/change-pin" : "/login", locale: target });
}

/** Requires a permission; renders the 403 page otherwise (FR-RBAC-02, NFR-SEC-07). */
export async function requirePermission(permission: Permission, locale?: Locale): Promise<Session> {
  const session = await requireSession(locale);
  if (!session.permissions.has(permission)) forbidden();
  return session;
}
