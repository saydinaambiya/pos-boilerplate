/**
 * Navigation layouts selectable in `app.config.ts` (PRD §10.3, FR-UI-06).
 * Below the `md` breakpoint every layout falls back to its `mobile` variant.
 */

export interface LayoutDefinition {
  /** Desktop/tablet navigation placement. */
  navigation: "sidebar" | "topbar" | "rail";
  /** Mobile navigation (< 768 px, FR-UX-01). */
  mobile: "bottom-bar" | "drawer";
}

export const layouts = {
  sidebar: { navigation: "sidebar", mobile: "bottom-bar" },
  topbar: { navigation: "topbar", mobile: "drawer" },
  compact: { navigation: "rail", mobile: "bottom-bar" },
} as const satisfies Record<string, LayoutDefinition>;

export type LayoutName = keyof typeof layouts;

export const layoutNames = Object.keys(layouts) as [LayoutName, ...LayoutName[]];
