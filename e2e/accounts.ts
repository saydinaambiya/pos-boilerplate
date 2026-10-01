/** E2E fixture accounts; seeded by `e2e/seed.ts`, never used outside tests. */
export const accounts = {
  owner: { username: "owner", name: "Owner E2E", password: "owner-e2e-password" },
  cashier: { username: "kasir", name: "Kasir", pin: "123456", mustChangePin: false },
  newCashier: { username: "kasir-baru", name: "Kasir Baru", pin: "111111", mustChangePin: true },
  posCashier: { username: "kasir-pos", name: "Kasir POS", pin: "333333", mustChangePin: false },
  lockedCashier: {
    username: "kasir-kunci",
    name: "Kasir Kunci",
    pin: "222222",
    mustChangePin: false,
  },
};

export const OWNER_STATE = "playwright/.auth/owner.json";

/** Brand seeded for products created through the UI (FR-PRD-06). */
export const E2E_BRAND = "Merk Uji";

/** Deterministic sale with extreme data for invoice layout tests (FR-INV-03). */
export const EXTREME_SALE_ID = "0199a000-0000-7000-8000-00000000c005";

/** Store-local day of the seeded audit entries the purge test deletes (FR-AUD-05). */
export const OLD_AUDIT_DAY = "2020-01-15";
