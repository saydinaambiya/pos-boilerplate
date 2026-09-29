import { describe, expect, it } from "vitest";

import { COLOR_NAMES, colorHex, MOTIF_OPTIONS, MOTIFS } from "./options";
import { hexColor } from "./schemas";

describe("motif and colour lists (ADR-0026)", () => {
  it("stores 3D motifs with their family and lists them under it", () => {
    expect(MOTIFS).toContain("Nappa");
    expect(MOTIFS).toContain("3D Catur");
    expect(MOTIFS).not.toContain("3D");
    expect(MOTIF_OPTIONS.find((option) => option.value === "3D Wave")).toEqual({
      value: "3D Wave",
      label: "Wave",
      group: "3D",
    });
    expect(new Set(MOTIFS).size).toBe(MOTIFS.length);
  });

  it("has ten distinct colours with valid swatches", () => {
    expect(COLOR_NAMES).toHaveLength(10);
    expect(new Set(COLOR_NAMES).size).toBe(10);
    for (const name of COLOR_NAMES) expect(hexColor.safeParse(colorHex(name)).success).toBe(true);
    expect(colorHex(" navy ")).toBe(colorHex("Navy"));
    expect(colorHex("Merah")).toBeUndefined();
  });
});
