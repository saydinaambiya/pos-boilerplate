import { describe, expect, it } from "vitest";

import { checkoutInput } from "./schemas";

const base = {
  idempotencyKey: "0199a000-0000-7000-8000-000000000001",
  lines: [{ variantId: "0199a000-0000-7000-8000-000000000002", qty: 1 }],
  payments: [{ method: "CASH", amount: 10_000 }],
};

describe("checkout buyer (FR-POS-11)", () => {
  it("requires a name and normalises an optional phone", () => {
    expect(checkoutInput.safeParse(base).success).toBe(false);
    expect(checkoutInput.safeParse({ ...base, customer: { name: " ", phone: "" } }).success).toBe(
      false,
    );
    expect(
      checkoutInput.parse({ ...base, customer: { name: "Budi", phone: "" } }).customer,
    ).toEqual({ name: "Budi", phone: null });
    expect(
      checkoutInput.parse({ ...base, customer: { name: "Budi", phone: "0812-3456-7890" } }).customer
        .phone,
    ).toBe("+6281234567890");
    expect(
      checkoutInput.safeParse({ ...base, customer: { name: "Budi", phone: "12345" } }).success,
    ).toBe(false);
  });

  it("needs the phone when the remainder goes on store credit (BR-11)", () => {
    const kasbon = { note: "", dueDate: null };
    expect(
      checkoutInput.safeParse({ ...base, customer: { name: "Budi", phone: "" }, kasbon }).success,
    ).toBe(false);
    expect(
      checkoutInput.safeParse({
        ...base,
        customer: { name: "Budi", phone: "081234567890" },
        kasbon,
      }).success,
    ).toBe(true);
  });
});
