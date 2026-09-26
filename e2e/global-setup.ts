import { execSync } from "node:child_process";

/** Applies migrations and seeds fixtures before any browser starts. */
export default function globalSetup(): void {
  const options = { stdio: "inherit", env: process.env } as const;
  execSync("pnpm exec drizzle-kit migrate", options);
  execSync("pnpm exec tsx --conditions=react-server e2e/seed.ts", options);
}
