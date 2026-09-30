"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import type { Locale } from "@/config/locales";
import { localeFromForm } from "@/i18n/form-locale";
import { redirect } from "@/i18n/navigation";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/cookie";
import { getSession, getSessionToken } from "@/lib/auth/guard";
import { formText } from "@/lib/http/form-data";
import { currentRequestContext } from "@/lib/http/request-context";
import { fieldErrors, type FormState, submittedValues } from "@/lib/validation/form-state";

import { changePasswordInput, changePinInput, loginInput, recoverPasswordInput } from "./schemas";
import {
  changePassword,
  changePin,
  generateRecoveryCodes,
  login,
  loginMethodFor,
  logout,
  recoverPassword,
} from "./service";

/**
 * Form state returned to `useActionState`; messages are already translated.
 * `method` is set once the username step is done.
 */
export interface LoginState {
  error?: string;
  username?: string;
  method?: "password" | "pin";
}

const toMinutes = (seconds: number) => Math.max(Math.ceil(seconds / 60), 1);

/**
 * Two-step login (FR-AUTH-01/02): the first post carries only the username
 * and returns which secret to ask for; the second signs in. Works before
 * hydration as a plain form post.
 */
export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const locale = localeFromForm(formData);
  const t = await getTranslations({ locale, namespace: "Auth" });
  const username = formText(formData, "username").trim();
  if (formText(formData, "step") === "username") {
    if (username === "") return { error: t("errorUsernameRequired") };
    return { username, method: await loginMethodFor(username) };
  }

  const method = await loginMethodFor(username);
  const parsed = loginInput.safeParse({ username, secret: formText(formData, "secret") });
  const invalid = method === "password" ? t("errorInvalidPassword") : t("errorInvalidPin");
  if (!parsed.success) return { error: invalid, username, method };

  const result = await login(parsed.data, await currentRequestContext());
  if (!result.ok) {
    if (result.reason === "invalid") return { error: invalid, username, method };
    if (result.reason === "device-limit") {
      return { error: t("errorDeviceLimit", { count: result.maxDevices }), username, method };
    }
    const minutes = toMinutes(result.retryAfterSeconds);
    return {
      error: t(result.reason === "locked" ? "errorLocked" : "errorRateLimited", { minutes }),
      username,
      method,
    };
  }

  await setSessionCookie(result.token);
  revalidatePath("/", "layout");
  return redirect({ href: result.mustChangePin ? "/change-pin" : "/", locale });
}

/**
 * Signs out ("ganti kasir", FR-AUTH-08); an open shift is left untouched.
 * Cached pages of the previous account are dropped so the next account never
 * sees them.
 */
export async function logoutAction(formData: FormData): Promise<void> {
  const locale = localeFromForm(formData);
  const token = await getSessionToken();
  if (token) await logout(token, await currentRequestContext());
  await clearSessionCookie();
  revalidatePath("/", "layout");
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

/** Zod errors per field, with "mismatch" on the confirmation said plainly. */
async function passwordErrors(error: ZodError, locale: Locale) {
  const [t, tv] = await Promise.all([
    getTranslations({ locale, namespace: "Account" }),
    getTranslations({ locale, namespace: "Validation" }),
  ]);
  const errors = fieldErrors(error, tv);
  if (error.issues.some((issue) => issue.message === "mismatch")) {
    errors.confirmPassword = t("errorMismatch");
  }
  return errors;
}

/** The Owner changes their password from the account page (FR-AUTH-11). */
export async function changePasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });
  const t = await getTranslations({ locale, namespace: "Account" });
  const parsed = changePasswordInput.safeParse({
    currentPassword: formText(formData, "currentPassword"),
    password: formText(formData, "password"),
    confirmPassword: formText(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { status: "error", errors: await passwordErrors(parsed.error, locale) };
  }
  const result = await changePassword(session, parsed.data, await currentRequestContext());
  if (!result.ok) {
    switch (result.reason) {
      case "wrong-password":
        return { status: "error", errors: { currentPassword: t("errorWrongPassword") } };
      case "same-password":
        return { status: "error", errors: { password: t("errorSamePassword") } };
      case "not-password-account":
        return { status: "error", message: t("errorNotPasswordAccount") };
    }
  }
  return { status: "success", message: t("passwordChanged") };
}

export interface RecoveryCodesState {
  codes?: string[];
  error?: string;
}

/** New recovery codes, shown once to the Owner (FR-AUTH-12, ADR-0037). */
export async function generateRecoveryCodesAction(
  _previous: RecoveryCodesState,
  formData: FormData,
): Promise<RecoveryCodesState> {
  const locale = localeFromForm(formData);
  const session = await getSession();
  if (!session) return redirect({ href: "/login", locale });
  const t = await getTranslations({ locale, namespace: "Account" });
  const password = formText(formData, "currentPassword");
  if (password === "" || password.length > 128) return { error: t("errorWrongPassword") };
  const result = await generateRecoveryCodes(session, password, await currentRequestContext());
  if (!result.ok) {
    return {
      error:
        result.reason === "wrong-password" ? t("errorWrongPassword") : t("errorNotPasswordAccount"),
    };
  }
  revalidatePath("/", "layout");
  return { codes: result.codes };
}

/** Forgotten password: a recovery code sets a new one, then sign in again (FR-AUTH-12). */
export async function recoverPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeFromForm(formData);
  const t = await getTranslations({ locale, namespace: "Account" });
  const values = submittedValues(formData, ["username"]);
  const parsed = recoverPasswordInput.safeParse({
    username: formText(formData, "username"),
    code: formText(formData, "code"),
    password: formText(formData, "password"),
    confirmPassword: formText(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    const errors = await passwordErrors(parsed.error, locale);
    if (errors.username || errors.code) {
      delete errors.username;
      delete errors.code;
      return { status: "error", message: t("errorRecoveryInvalid"), errors, values };
    }
    return { status: "error", errors, values };
  }
  const result = await recoverPassword(parsed.data, await currentRequestContext());
  if (!result.ok) {
    if (result.reason === "invalid") {
      return { status: "error", message: t("errorRecoveryInvalid"), values };
    }
    const tAuth = await getTranslations({ locale, namespace: "Auth" });
    const minutes = toMinutes(result.retryAfterSeconds);
    return {
      status: "error",
      message: tAuth(result.reason === "locked" ? "errorLocked" : "errorRateLimited", { minutes }),
      values,
    };
  }
  return redirect({ href: "/login?recovered=1", locale });
}
