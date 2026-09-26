import { z } from "zod";

import { layoutNames } from "./layouts";
import { locales, themes } from "./locales";
import { paletteNames } from "./palettes";

const brandAsset = (extensions: readonly string[]) =>
  z
    .string()
    .regex(
      new RegExp(`^/brand/[a-z0-9][a-z0-9-]*\\.(${extensions.join("|")})$`),
      `must be a file in public/brand/ with extension ${extensions.join(", ")}`,
    );

/**
 * Schema for `src/config/app.config.ts` (PRD §10.3). Kept `strict` so a
 * misspelled key fails instead of being ignored.
 */
export const appConfigSchema = z
  .object({
    brand: z
      .object({
        appName: z.string().trim().min(1).max(40),
        storeName: z.string().trim().min(1).max(60),
        logo: z
          .object({
            light: brandAsset(["svg", "png", "webp"]),
            dark: brandAsset(["svg", "png", "webp"]).nullable(),
            print: brandAsset(["png"]).nullable(),
            icon: brandAsset(["png"]),
          })
          .strict(),
      })
      .strict(),
    appearance: z
      .object({
        palette: z.enum(paletteNames),
        layout: z.enum(layoutNames),
        defaultLocale: z.enum(locales),
        defaultTheme: z.enum(themes),
      })
      .strict(),
  })
  .strict();

export type AppConfig = z.infer<typeof appConfigSchema>;

/**
 * Enforces value rules (lengths, asset paths) when the app builds. The
 * config file imports only the `AppConfig` type, which keeps Zod out of the
 * browser bundle.
 */
export function assertAppConfig(config: AppConfig): void {
  const result = appConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid src/config/app.config.ts:\n${z.prettifyError(result.error)}`);
  }
}
