import type { AppConfig } from "./app-config.schema";

/**
 * Brand identity and appearance for this deployment.
 * Keys and allowed values are documented in docs/PRD.md §10.3; values are
 * type-checked (`pnpm typecheck`) and validated when the app builds
 * (`assertAppConfig` in next.config.ts).
 * Store profile (address, phone, tax ID, invoice footer) is owner-managed in
 * Settings, not here (PRD FR-SET-01).
 */
export const appConfig: AppConfig = {
  brand: {
    appName: "Kasir",
    storeName: "Toko Contoh",
    logo: {
      light: "/brand/logo-light.svg",
      dark: "/brand/logo-dark.svg",
      print: null,
      icon: "/brand/icon.png",
    },
  },
  appearance: {
    palette: "sage",
    layout: "sidebar",
    defaultLocale: "id",
    defaultTheme: "system",
  },
};
