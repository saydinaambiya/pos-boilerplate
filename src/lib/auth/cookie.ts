import "server-only";

import { cookies } from "next/headers";

import { authPolicy, SESSION_COOKIE } from "./policy";

/** `HttpOnly`, `Secure`, `SameSite=Lax` session cookie (FR-AUTH-05). */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: authPolicy.cookieMaxAgeDays * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
