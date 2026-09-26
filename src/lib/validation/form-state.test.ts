import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fieldErrors, submittedValues } from "./form-state";
import { plainText } from "./text";

describe("plainText (NFR-SEC-04)", () => {
  it("normalises whitespace, control characters and Unicode form", () => {
    expect(plainText(40).parse("  Kasir\u0000  Pagi\n ")).toBe("Kasir Pagi");
    expect(plainText(40).parse("Café")).toBe("Café");
  });

  it("checks length after normalisation", () => {
    expect(plainText(5).safeParse("   ").success).toBe(false);
    expect(plainText(5).safeParse("abcdef").success).toBe(false);
  });
});

describe("fieldErrors (FR-UX-05)", () => {
  const schema = z.object({
    name: plainText(3),
    roleId: z.uuid(),
    note: plainText(10),
    months: z.int().min(3).max(60),
  });
  const translate = (message: string, values?: { min?: number; max?: number }) =>
    values ? `${message}:${String(values.min ?? values.max)}` : message;

  it("reports one translated message per field", () => {
    const result = schema.safeParse({ name: "abcd", roleId: "x", note: "", months: 2 });
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error ?? new z.ZodError([]), translate)).toEqual({
      name: "tooLong:3",
      roleId: "invalid",
      note: "required",
      months: "tooSmall:3",
    });
    const big = schema.safeParse({ name: "a", roleId: "x", note: "n", months: 61 });
    expect(fieldErrors(big.error ?? new z.ZodError([]), translate).months).toBe("tooBig:60");
  });
});

describe("submittedValues", () => {
  it("echoes single values as strings and repeated ones as arrays", () => {
    const formData = new FormData();
    formData.append("name", "Kasir");
    formData.append("permissions", "page:pos");
    formData.append("permissions", "page:stock");
    expect(submittedValues(formData, ["name", "permissions", "missing"])).toEqual({
      name: "Kasir",
      permissions: ["page:pos", "page:stock"],
      missing: "",
    });
  });
});
