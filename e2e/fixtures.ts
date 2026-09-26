import { test as base, expect } from "@playwright/test";

/**
 * Fails any test whose page reports a Content-Security-Policy violation, so a
 * regression in nonce handling cannot pass silently.
 */
export const test = base.extend<{ cspViolations: string[] }>({
  cspViolations: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
          violations.push(message.text());
        }
      });
      await use(violations);
      expect(violations, "CSP violations").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
