/**
 * Color palettes selectable in `app.config.ts` (PRD §10.3, FR-UI-02).
 *
 * Every palette defines the same semantic tokens for light and dark schemes.
 * Components consume the tokens through CSS variables only (FR-UI-01), and
 * `palettes.test.ts` enforces WCAG 2.2 AA contrast for every pair (FR-UI-04).
 * Status colors are shared across palettes so a state reads the same in
 * every store.
 */

export interface SchemeTokens {
  /** Page background behind cards. */
  canvas: string;
  /** Cards, sidebar, dialogs. */
  surface: string;
  /** Inputs, hovered rows, secondary buttons. */
  surfaceMuted: string;
  border: string;
  ink: string;
  inkMuted: string;
  /** Active navigation item and primary buttons. */
  primary: string;
  primaryInk: string;
  focus: string;
}

export interface StatusTokens {
  successBg: string;
  successInk: string;
  warningBg: string;
  warningInk: string;
  dangerBg: string;
  dangerInk: string;
  infoBg: string;
  infoInk: string;
  neutralBg: string;
  neutralInk: string;
}

export interface PaletteDefinition {
  light: SchemeTokens;
  dark: SchemeTokens;
}

/** Derived from the "Kitchen" reference design (#dff4ce, #fff1d8). */
export const statusTokens = {
  light: {
    successBg: "#dff4ce",
    successInk: "#2f5a1c",
    warningBg: "#fff1d8",
    warningInk: "#7a4b0c",
    dangerBg: "#fde2e1",
    dangerInk: "#a3302a",
    infoBg: "#dbeefa",
    infoInk: "#1f5f8b",
    neutralBg: "#eef0f1",
    neutralInk: "#4a4a48",
  },
  dark: {
    successBg: "#2c3d24",
    successInk: "#c7e8b0",
    warningBg: "#3d3222",
    warningInk: "#f3d9a6",
    dangerBg: "#43292a",
    dangerInk: "#f4b8b4",
    infoBg: "#1f3445",
    infoInk: "#aed5f2",
    neutralBg: "#2e3033",
    neutralInk: "#d0cfcb",
  },
} as const satisfies Record<"light" | "dark", StatusTokens>;

export const palettes = {
  sage: {
    light: {
      canvas: "#f5f6f7",
      surface: "#ffffff",
      surfaceMuted: "#eef0f1",
      border: "#e3e5e8",
      ink: "#323130",
      inkMuted: "#5f5e5b",
      primary: "#323130",
      primaryInk: "#ffffff",
      focus: "#4d7c3a",
    },
    dark: {
      canvas: "#1c1d1f",
      surface: "#252628",
      surfaceMuted: "#2e3033",
      border: "#3a3c40",
      ink: "#ecebe8",
      inkMuted: "#b1b0ab",
      primary: "#e8e7e4",
      primaryInk: "#1c1d1f",
      focus: "#a9d68c",
    },
  },
  sand: {
    light: {
      canvas: "#f7f3ee",
      surface: "#fffdfa",
      surfaceMuted: "#f0e9e0",
      border: "#e6ddd1",
      ink: "#3a2f28",
      inkMuted: "#6b5c50",
      primary: "#8a4b2f",
      primaryInk: "#ffffff",
      focus: "#a85a33",
    },
    dark: {
      canvas: "#1f1a17",
      surface: "#29231f",
      surfaceMuted: "#332c27",
      border: "#433a33",
      ink: "#f1e9e1",
      inkMuted: "#bfb2a5",
      primary: "#e8b999",
      primaryInk: "#2a1c14",
      focus: "#e8b999",
    },
  },
  ocean: {
    light: {
      canvas: "#f2f6f8",
      surface: "#ffffff",
      surfaceMuted: "#e8eff3",
      border: "#dce5eb",
      ink: "#1f2d36",
      inkMuted: "#51636f",
      primary: "#1f5f73",
      primaryInk: "#ffffff",
      focus: "#237a91",
    },
    dark: {
      canvas: "#161d22",
      surface: "#1e272d",
      surfaceMuted: "#263138",
      border: "#334049",
      ink: "#e5eef2",
      inkMuted: "#a5b5bf",
      primary: "#9fd3e0",
      primaryInk: "#10232b",
      focus: "#9fd3e0",
    },
  },
  slate: {
    light: {
      canvas: "#f4f5f7",
      surface: "#ffffff",
      surfaceMuted: "#eceef2",
      border: "#dfe2e8",
      ink: "#1e2430",
      inkMuted: "#545c6b",
      primary: "#2f3a4d",
      primaryInk: "#ffffff",
      focus: "#4a66a0",
    },
    dark: {
      canvas: "#171a1f",
      surface: "#1f232a",
      surfaceMuted: "#282d35",
      border: "#353b45",
      ink: "#e6e9ee",
      inkMuted: "#a9b0bc",
      primary: "#c9d3e3",
      primaryInk: "#171a1f",
      focus: "#9fb4dc",
    },
  },
} as const satisfies Record<string, PaletteDefinition>;

export type PaletteName = keyof typeof palettes;

export const paletteNames = Object.keys(palettes) as [PaletteName, ...PaletteName[]];
