import AxeBuilder from "@axe-core/playwright";

import { OWNER_STATE } from "./accounts";
import { expect, test } from "./fixtures";

test.describe("routing & i18n", () => {
  test("redirects to the default locale", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/id$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dasbor");
  });

  test("switches language and keeps the current page", async ({ page, isMobile }) => {
    test.skip(isMobile, "language switch is covered on desktop");
    await page.goto("/id/pos");
    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en\/pos$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cashier");
  });

  test("returns 404 for unknown pages", async ({ page }) => {
    const response = await page.goto("/id/does-not-exist");
    expect(response?.status()).toBe(404);
  });
});

test.describe("theme (FR-UI-09)", () => {
  test("persists the selected theme", async ({ page, isMobile }) => {
    await page.goto("/id");
    if (isMobile) await page.getByRole("button", { name: "Lainnya" }).click();
    await page.getByRole("button", { name: "Gelap" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("works without JavaScript", async ({ browser, isMobile }) => {
    test.skip(isMobile, "mobile preferences live in a dialog that needs JavaScript");
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: OWNER_STATE,
    });
    const page = await context.newPage();
    await page.goto("/id");
    await page.getByRole("button", { name: "Terang" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await context.close();
  });
});

test.describe("security headers (NFR-SEC-05)", () => {
  test("pages carry a nonce-based CSP and hardening headers", async ({ request }) => {
    const response = await request.get("/id");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );
    expect(headers["strict-transport-security"]).toContain("max-age=63072000");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-request-id"]).toBeTruthy();
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});

test.describe("responsive layout (FR-UX-01)", () => {
  test("never scrolls horizontally", async ({ page }) => {
    for (const path of ["/id", "/id/ui"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("shows the bottom bar on mobile and the sidebar on desktop", async ({ page, isMobile }) => {
    await page.goto("/id");
    const navigations = page.getByRole("navigation", { name: "Navigasi utama" });
    await expect(navigations.filter({ visible: true })).toHaveCount(1);
    const box = await navigations.filter({ visible: true }).boundingBox();
    if (isMobile) expect(box?.y).toBeGreaterThan(400);
    else expect(box?.x).toBeLessThan(100);
  });
});

test.describe("accessibility (FR-UX-06, WCAG 2.2 AA)", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const path of [
      "/id",
      "/id/ui",
      "/id/login",
      "/id/employees",
      "/id/employees/roles/new",
      "/id/settings",
      "/id/settings/tax",
      "/id/audit",
      "/id/products",
      "/id/products/new",
      "/id/products/categories",
      "/id/stock",
    ]) {
      test(`${path} in ${theme} theme has no violations`, async ({ page, context, baseURL }) => {
        if (path.endsWith("/login")) await context.clearCookies();
        await context.addCookies([{ name: "theme", value: theme, url: baseURL ?? "" }]);
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(results.violations).toEqual([]);
      });
    }
  }
});
