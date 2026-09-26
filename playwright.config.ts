import { defineConfig, devices } from "@playwright/test";

import { OWNER_STATE } from "./e2e/accounts";

const PORT = 3100;
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://pos:pos@localhost:5432/pos_e2e";
process.env.DATABASE_URL = DATABASE_URL;
process.env.APP_URL = `http://localhost:${PORT}`;
const INVOICE_LINK_SECRET = "e2e-invoice-link-secret-0123456789abcdef";
process.env.INVOICE_LINK_SECRET = INVOICE_LINK_SECRET;

/**
 * End-to-end tests run against a production build (`next start`) and a
 * dedicated database (`pos_e2e`, created by docker-compose). The `setup`
 * project signs the owner in; other projects reuse that session.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  /**
   * Visual baselines are platform-specific (fonts differ). They are kept for
   * macOS, where they are reviewed; CI on Linux skips the image comparison
   * but still runs the DOM overflow checks (FR-INV-03, ADR-0010).
   */
  ignoreSnapshots: Boolean(process.env.CI) && process.platform !== "darwin",
  expect: { toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.01 } },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], storageState: OWNER_STATE },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: OWNER_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `next build && next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      APP_URL: `http://localhost:${PORT}`,
      DATABASE_URL,
      ENABLE_DIAGNOSTICS: "true",
      INVOICE_LINK_SECRET,
    },
  },
});
