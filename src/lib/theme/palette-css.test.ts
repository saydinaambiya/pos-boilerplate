import { describe, expect, it } from "vitest";

import { paletteNames } from "@/config/palettes";

import { renderPaletteCss } from "./palette-css";

describe("renderPaletteCss", () => {
  it.each(paletteNames)("%s emits light, system-dark and dark blocks", (name) => {
    const css = renderPaletteCss(name);
    expect(css).toMatch(/^:root\{color-scheme:light;--canvas:#[0-9a-f]{6};/);
    expect(css).toContain("@media (prefers-color-scheme:dark){:root[data-theme=system]{");
    expect(css).toContain(":root[data-theme=dark]{color-scheme:dark;");
  });

  it("contains only token declarations, never markup", () => {
    for (const name of paletteNames) expect(renderPaletteCss(name)).not.toMatch(/[<>&"']/);
  });
});
