import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/lib/color/contrast";

import { palettes, statusTokens, type SchemeTokens, type StatusTokens } from "./palettes";

const TEXT = 4.5;
const NON_TEXT = 3;

type Pair = [
  foreground: keyof (SchemeTokens & StatusTokens),
  background: keyof (SchemeTokens & StatusTokens),
  minimum: number,
];

const pairs: Pair[] = [
  ["ink", "canvas", TEXT],
  ["ink", "surface", TEXT],
  ["ink", "surfaceMuted", TEXT],
  ["inkMuted", "canvas", TEXT],
  ["inkMuted", "surface", TEXT],
  ["inkMuted", "surfaceMuted", TEXT],
  ["primaryInk", "primary", TEXT],
  ["focus", "surface", NON_TEXT],
  ["focus", "canvas", NON_TEXT],
  ["successInk", "successBg", TEXT],
  ["warningInk", "warningBg", TEXT],
  ["dangerInk", "dangerBg", TEXT],
  ["infoInk", "infoBg", TEXT],
  ["neutralInk", "neutralBg", TEXT],
];

describe("palettes meet WCAG 2.2 AA (PRD FR-UI-04)", () => {
  for (const [name, palette] of Object.entries(palettes)) {
    for (const scheme of ["light", "dark"] as const) {
      const tokens = { ...palette[scheme], ...statusTokens[scheme] };
      it.each(pairs)(`${name}/${scheme}: %s on %s`, (foreground, background, minimum) => {
        expect(contrastRatio(tokens[foreground], tokens[background])).toBeGreaterThanOrEqual(
          minimum,
        );
      });
    }
  }
});
