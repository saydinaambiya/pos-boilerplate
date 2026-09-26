import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const serverOnly = new URL("./src/test/server-only.ts", import.meta.url).pathname;

/**
 * `unit`: pure logic, no I/O (`pnpm test`).
 * `integration`: services against a real Postgres started by Testcontainers
 * (`pnpm test:int`, needs Docker) — PRD NFR-CODE-05.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    alias: { "server-only": serverOnly },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
          environment: "node",
          env: {
            APP_URL: "http://localhost:3000",
            DATABASE_URL: "postgres://unit:unit@localhost:5432/unused",
            INVOICE_LINK_SECRET: "unit-test-invoice-link-secret-0123456789",
          },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          environment: "node",
          globalSetup: ["./src/test/postgres-container.ts"],
          setupFiles: ["./src/test/integration-env.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
