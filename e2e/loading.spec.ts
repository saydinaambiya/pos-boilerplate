import { expect, test } from "./fixtures";

test.describe("global loading indicator (FR-UX-08)", () => {
  test.skip(({ isMobile }) => isMobile, "the sidebar link is on desktop; mobile shares the code");

  test("shows while a link navigation is slow and hides when it lands", async ({ page }) => {
    await page.goto("/id");
    await page.route(
      (url) => url.pathname === "/id/products",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      },
    );
    const indicator = page.getByTestId("loading-indicator");
    await expect(indicator).toHaveAttribute("data-busy", "false");

    const sidebar = page.getByRole("complementary").filter({ visible: true }).first();
    await sidebar.getByRole("link", { name: "Produk", exact: true }).click();
    await expect(indicator).toHaveAttribute("data-busy", "true");
    await expect(indicator).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Memuat" })).toHaveCount(1);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Produk");
    await expect(indicator).toBeHidden();
    await expect(indicator).toHaveAttribute("data-busy", "false");
  });
});
