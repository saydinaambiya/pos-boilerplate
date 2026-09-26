import {
  palettes,
  statusTokens,
  type PaletteName,
  type SchemeTokens,
  type StatusTokens,
} from "@/config/palettes";

const HEX = /^#[0-9a-f]{6}$/i;

function toKebab(name: string): string {
  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function declarations(tokens: SchemeTokens & StatusTokens): string {
  return (Object.keys(tokens) as (keyof typeof tokens)[])
    .map((name) => {
      const value = tokens[name];
      if (!HEX.test(value)) throw new Error(`Palette token ${name} is not a 6-digit hex color`);
      return `--${toKebab(name)}:${value};`;
    })
    .join("");
}

/**
 * Builds the CSS custom properties for the active palette.
 *
 * `system` follows `prefers-color-scheme` in pure CSS, so theming needs no
 * client script and never flashes (PRD FR-UI-09). Served as a static file
 * by `app/assets/palette.css/route.ts`.
 */
export function renderPaletteCss(name: PaletteName): string {
  const palette = palettes[name];
  const light = declarations({ ...palette.light, ...statusTokens.light });
  const dark = declarations({ ...palette.dark, ...statusTokens.dark });

  return [
    `:root{color-scheme:light;${light}}`,
    `@media (prefers-color-scheme:dark){:root[data-theme=system]{color-scheme:dark;${dark}}}`,
    `:root[data-theme=dark]{color-scheme:dark;${dark}}`,
  ].join("");
}
