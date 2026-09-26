"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { themes } from "@/config/locales";
import { THEME_COOKIE } from "@/lib/theme/theme-cookie";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const themeInput = z.enum(themes);

/**
 * Persists the viewer's theme. Stored per device until user accounts exist;
 * Milestone 1 also saves it to the user profile (PRD FR-EMP-04).
 */
export async function setTheme(formData: FormData): Promise<void> {
  const parsed = themeInput.safeParse(formData.get("theme"));
  if (!parsed.success) return;

  (await cookies()).set(THEME_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}
