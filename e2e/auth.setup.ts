import { expect, test as setup } from "@playwright/test";

import { accounts, OWNER_STATE } from "./accounts";

/** Signs the owner in once and shares the session with the other projects. */
setup("sign in as owner", async ({ page }) => {
  await page.goto("/id/login");
  await page.getByLabel("Username").fill(accounts.owner.username);
  await page.getByLabel("Password atau PIN").fill(accounts.owner.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/id$/);
  await page.context().storageState({ path: OWNER_STATE });
});
