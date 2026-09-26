import "server-only";

import { cookies } from "next/headers";

import { appConfig } from "@/config/app.config";
import { themes, type Theme } from "@/config/locales";

export const THEME_COOKIE = "theme";

function isTheme(value: string | undefined): value is Theme {
  return themes.includes(value as Theme);
}

/** Viewer's theme, falling back to `appConfig.appearance.defaultTheme`. */
export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : appConfig.appearance.defaultTheme;
}
