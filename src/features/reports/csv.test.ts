import { describe, expect, it } from "vitest";

import { csvCell, csvLines } from "./csv";
import { reportRange } from "./schemas";

describe("CSV export (FR-RPT-05)", () => {
  it("quotes separators and neutralises formulas", () => {
    expect(csvCell("Kaos, Hitam")).toBe('"Kaos, Hitam"');
    expect(csvCell('Kata "baik"')).toBe('"Kata ""baik"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
  });

  it("writes a header and CRLF rows", () => {
    const lines = [
      ...csvLines(
        [{ name: "A", qty: 2 }],
        [
          { header: "Nama", value: (row: { name: string; qty: number }) => row.name },
          { header: "Qty", value: (row: { name: string; qty: number }) => row.qty },
        ],
      ),
    ];
    expect(lines).toEqual(["Nama,Qty\r\n", "A,2\r\n"]);
  });
});

describe("report range (FR-RPT-01)", () => {
  it("defaults to this month, swaps reversed ends and clips long ranges", () => {
    expect(reportRange({}, "2026-09-26")).toEqual({
      from: "2026-09-01",
      to: "2026-09-26",
      clipped: false,
    });
    expect(reportRange({ from: "2026-09-10", to: "2026-09-01" }, "2026-09-26")).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-10",
    });
    expect(reportRange({ from: "2024-01-01", to: "2026-09-26" }, "2026-09-26")).toEqual({
      from: "2025-09-26",
      to: "2026-09-26",
      clipped: true,
    });
    expect(reportRange({ from: "bukan", to: "2026-02-30" }, "2026-09-26").to).toBe("2026-09-26");
  });
});
