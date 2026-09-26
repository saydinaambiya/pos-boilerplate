import { EXTREME_SALE_ID } from "./accounts";
import { expect, test } from "./fixtures";

const sizes = ["58mm", "80mm", "a4"] as const;
const printUrl = (size: string, lang = "id") =>
  `/id/print/invoices/${EXTREME_SALE_ID}?size=${size}&lang=${lang}`;

test.describe("invoice print and PDF (FR-INV, FR-PDF)", () => {
  test.skip(({ isMobile }) => isMobile, "print layouts are checked once, on desktop");

  for (const size of sizes) {
    test(`${size} keeps every line inside the paper with extreme data (FR-INV-02/03)`, async ({
      page,
    }) => {
      await page.goto(printUrl(size));
      await page.emulateMedia({ media: "print" });
      const invoice = page.getByTestId("invoice");
      await expect(invoice).toContainText("INV-FIXTURE-EXTREME");
      await expect(invoice).toContainText(/Rp\s98\.874\.109\.121/);

      const problems = await invoice.evaluate((paper) => {
        const bounds = paper.getBoundingClientRect();
        const issues: string[] = [];
        for (const element of paper.querySelectorAll<HTMLElement>("*")) {
          if (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1) {
            issues.push(`overflow: ${element.tagName} ${element.textContent.slice(0, 40)}`);
          }
        }
        for (const amount of paper.querySelectorAll<HTMLElement>(".amount")) {
          const box = amount.getBoundingClientRect();
          if (box.right > bounds.right + 0.5 || box.left < bounds.left - 0.5) {
            issues.push(`clipped amount: ${amount.textContent}`);
          }
        }
        return issues;
      });
      expect(problems).toEqual([]);

      if (size === "a4") {
        const wrappedHeaders = await invoice
          .locator("thead th")
          .evaluateAll((cells) =>
            cells
              .filter((cell) => cell.getClientRects().length > 1 || cell.scrollHeight > 24)
              .map((cell) => cell.textContent),
          );
        expect(wrappedHeaders).toEqual([]);
        const headerGroup = await invoice
          .locator("thead")
          .evaluate((head) => getComputedStyle(head).display);
        expect(headerGroup).toBe("table-header-group");
      }
      await expect(invoice).toHaveScreenshot(`invoice-${size}.png`);
    });
  }

  test("switches the invoice language independently of the UI (FR-INV-05)", async ({ page }) => {
    await page.goto(printUrl("80mm"));
    await expect(page.getByTestId("invoice")).toContainText("Pembayaran");
    await page.getByRole("link", { name: "EN" }).click();
    await expect(page.getByTestId("invoice")).toContainText("Payments");
    await expect(page.getByTestId("invoice")).toContainText("Cash");
    await expect(page.getByRole("button", { name: "Cetak" })).toBeVisible();
  });

  test("streams the PDF as a named download and requires a session (FR-PDF-01/02)", async ({
    page,
    playwright,
    baseURL,
  }) => {
    const response = await page.request.get(
      `/api/v1/sales/${EXTREME_SALE_ID}/invoice?size=a4&lang=en`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["content-disposition"]).toBe(
      'attachment; filename="INV-FIXTURE-EXTREME.pdf"',
    );
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const anonymous = await playwright.request.newContext({
      ...(baseURL ? { baseURL } : {}),
      storageState: { cookies: [], origins: [] },
    });
    expect((await anonymous.get(`/api/v1/sales/${EXTREME_SALE_ID}/invoice`)).status()).toBe(401);
    await anonymous.dispose();
  });

  test("shares a signed public download link (FR-PDF-04/05)", async ({
    page,
    context,
    playwright,
    baseURL,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(printUrl("58mm"));
    await page.getByRole("button", { name: "Salin tautan unduh" }).click();
    await expect(page.getByRole("status")).toHaveText("Tautan unduh disalin. Berlaku 7 hari.");
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toMatch(/\/api\/v1\/invoice-links\/[^/?]+\?lang=id&size=58mm$/);

    const anonymous = await playwright.request.newContext({
      ...(baseURL ? { baseURL } : {}),
      storageState: { cookies: [], origins: [] },
    });
    const path = new URL(url).pathname + new URL(url).search;
    const response = await anonymous.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(response.headers()["cache-control"]).toContain("no-store");

    const tampered = path.replace(
      /invoice-links\/[^.]+/,
      "invoice-links/0199a000-0000-7000-8000-000000000000",
    );
    expect((await anonymous.get(tampered)).status()).toBe(404);
    await anonymous.dispose();
  });
});
