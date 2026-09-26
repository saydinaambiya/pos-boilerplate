import { appConfig } from "@/config/app.config";

import { renderPaletteCss } from "./palette-css";

export const paletteCss = renderPaletteCss(appConfig.appearance.palette);

/** FNV-1a hash of the stylesheet, used to bust caches when the palette changes. */
function fingerprint(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export const paletteStylesheetHref = `/assets/palette.css?v=${fingerprint(paletteCss)}`;
