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
