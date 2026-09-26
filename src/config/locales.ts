/** Supported UI languages (PRD FR-UI-10). */
export const locales = ["id", "en"] as const;

export type Locale = (typeof locales)[number];

export const themes = ["light", "dark", "system"] as const;

export type Theme = (typeof themes)[number];
