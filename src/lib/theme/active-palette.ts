import { appConfig } from "@/config/app.config";

import { paletteFileName, renderPaletteCss } from "./palette-css";

const { palette } = appConfig.appearance;

/** Stylesheet of the configured palette, e.g. `/assets/palettes/ocean.12yqzh6.css`. */
export const paletteStylesheetHref = `/assets/palettes/${paletteFileName(palette, renderPaletteCss(palette))}`;
