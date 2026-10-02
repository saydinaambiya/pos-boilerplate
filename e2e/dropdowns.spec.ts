import { expect, test } from "./fixtures";

/** Every dropdown reaches its last option by keyboard, not only by scrolling (FR-UX-06). */
test.describe("dropdown keyboard access (FR-UX-06)", () => {
  test("a searchable dropdown scrolls the highlighted option into view", async ({ page }) => {
    await page.goto("/id/products?new=1");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Motif", { exact: true }).click();
    const search = page.getByRole("combobox", { name: "Cari…" });
    const options = page.getByRole("listbox").getByRole("option");
    const count = await options.count();
    expect(count).toBeGreaterThan(8);
    for (let index = 1; index < count; index += 1) await search.press("ArrowDown");
    const last = options.last();
    await expect(search).toHaveAttribute(
      "aria-activedescendant",
      (await last.getAttribute("id")) ?? "",
    );
    await expect(last).toBeInViewport();
    const label = (await last.textContent()) ?? "";
    await search.press("PageUp");
    await search.press("PageDown");
    await expect(last).toBeInViewport();
    await search.press("Enter");
    await expect(dialog.getByLabel("Motif", { exact: true })).toHaveText(label);
  });

  test("a plain dropdown reaches its last option with the arrow keys", async ({ page }) => {
    await page.goto("/id/audit");
    const trigger = page.getByLabel("Aksi", { exact: true });
    await trigger.focus();
    await trigger.press("Enter");
    const options = page.getByRole("listbox").getByRole("option");
    const count = await options.count();
    expect(count).toBeGreaterThan(10);
    for (let index = 1; index < count; index += 1) {
      await page.keyboard.press("ArrowDown");
      await expect(options.nth(index)).toBeFocused();
    }
    const last = options.last();
    await expect(last).toBeInViewport();
    const label = (await last.textContent()) ?? "";
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveText(label);
  });
});
