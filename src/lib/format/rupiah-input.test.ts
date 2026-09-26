import { describe, expect, it } from "vitest";

import { caretAfterDigits, formatRupiahDigits, parseRupiah } from "./rupiah-input";

describe("money input formatting", () => {
  it("groups thousands per locale while typing", () => {
    expect(formatRupiahDigits("1500000", "id")).toBe("1.500.000");
    expect(formatRupiahDigits("1500000", "en")).toBe("1,500,000");
    expect(formatRupiahDigits("Rp 00012a3", "id")).toBe("123");
    expect(formatRupiahDigits("0", "id")).toBe("0");
    expect(formatRupiahDigits("", "id")).toBe("");
    expect(formatRupiahDigits("1234567890123456", "id")).toBe("123.456.789.012");
  });

  it("round-trips through the parser", () => {
    expect(parseRupiah(formatRupiahDigits("250000", "id"))).toBe(250_000);
    expect(parseRupiah(formatRupiahDigits("250000", "en"))).toBe(250_000);
  });

  it("keeps the caret after the same digit", () => {
    expect(caretAfterDigits("1.500.000", 2)).toBe(3);
    expect(caretAfterDigits("1.500.000", 0)).toBe(0);
    expect(caretAfterDigits("1.500", 9)).toBe(5);
  });
});
