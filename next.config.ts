import { existsSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { appConfig } from "./src/config/app.config";
import { assertAppConfig } from "./src/config/app-config.schema";
import { staticSecurityHeaders } from "./src/lib/security/headers";

/** Fails the build when a logo referenced in app.config.ts is missing (PRD §10.3). */
function assertBrandAssets(): void {
  const missing = Object.values(appConfig.brand.logo)
    .filter((asset): asset is string => asset !== null)
    .filter((asset) => !existsSync(path.join(process.cwd(), "public", asset)));
  if (missing.length > 0) {
    throw new Error(`app.config.ts references missing brand assets: ${missing.join(", ")}`);
  }
}

assertAppConfig(appConfig);
assertBrandAssets();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  /** Enables `forbidden()` for permission failures (FR-RBAC-02, ADR-0006). */
  experimental: { authInterrupts: true },
  /** Native bindings and the PDF engine stay runtime requires instead of being bundled. */
  serverExternalPackages: ["@node-rs/argon2", "@react-pdf/renderer"],
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: [...staticSecurityHeaders] }]);
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
