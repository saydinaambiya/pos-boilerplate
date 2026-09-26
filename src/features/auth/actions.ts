"use server";

import { getTranslations } from "next-intl/server";

import { localeFromForm } from "@/i18n/form-locale";
import { redirect } from "@/i18n/navigation";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/cookie";
import { getSession, getSessionToken } from "@/lib/auth/guard";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";

import { changePinInput, loginInput } from "./schemas";
import { changePin, login, logout } from "./service";

/** Form state returned to `useActionState`; messages are already translated. */
export interface LoginState {
  error?: string;
  username?: string;
}

const toMinutes = (seconds: number) => Math.max(Math.ceil(seconds / 60), 1);

/** Login form action (FR-AUTH-01/02). Works before hydration as a plain form post. */
export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const locale = localeFromForm(formData);
  const t = await getTranslations({ locale, namespace: "Auth" });
  const username = formText(formData, "username");
  const parsed = loginInput.safeParse({ username, secret: formText(formData, "secret") });
  if (!parsed.success) return { error: t("errorInvalid"), username };

  const result = await login(parsed.data, await currentRequestContext());
  if (!result.ok) {
    if (result.reason === "invalid") return { error: t("errorInvalid"), username };
    const minutes = toMinutes(result.retryAfterSeconds);
    return {
      error: t(result.reason === "locked" ? "errorLocked" : "errorRateLimited", { minutes }),
      username,
    };
  }

  await setSessionCookie(result.token);
  return redirect({ href: result.mustChangePin ? "/change-pin" : "/", locale });
}

/** Signs out ("ganti kasir", FR-AUTH-08); an open shift is left untouched. */
export async function logoutAction(formData: FormData): Promise<void> {
  const locale = localeFromForm(formData);
  const token = await getSessionToken();
  if (token) await logout(token, await currentRequestContext());
  await clearSessionCookie();
  redirect({ href: "/login", locale });
}

export interface ChangePinState {
  errors?: { pin?: string; confirmPin?: string };
}

/** Forced PIN change (FR-AUTH-06). */
export async function changePinAction(
  _previous: ChangePinState,
  formData: FormData,
): Promise<ChangePinState> {
  const locale = localeFromForm(formData);
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });

  const t = await getTranslations({ locale, namespace: "Auth" });
  const parsed = changePinInput.safeParse({
    pin: formText(formData, "pin"),
    confirmPin: formText(formData, "confirmPin"),
  });
  if (!parsed.success) {
    const failed = new Set(parsed.error.issues.map((issue) => issue.path[0]));
    return {
      errors: {
        ...(failed.has("pin") ? { pin: t("errorPinFormat") } : {}),
        ...(failed.has("confirmPin") ? { confirmPin: t("errorPinMismatch") } : {}),
      },
    };
  }

  const result = await changePin(session, parsed.data, await currentRequestContext());
  if (!result.ok && result.reason === "same-pin") return { errors: { pin: t("errorPinSame") } };
  return redirect({ href: "/", locale });
}
