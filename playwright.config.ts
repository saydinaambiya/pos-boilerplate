import { defineConfig, devices } from "@playwright/test";

import { OWNER_STATE } from "./e2e/accounts";

const PORT = 3100;
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://pos:pos@localhost:5432/pos_e2e";
process.env.DATABASE_URL = DATABASE_URL;
process.env.APP_URL = `http://localhost:${PORT}`;

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
    },
  },
});
