/**
 * Motifs and colours offered when entering products (FR-PRD-06, FR-VAR-01).
 * The lists are fixed in code; a new entry ships with a release, like the
 * sizes (ADR-0026).
 */
const PLAIN_MOTIFS = [
  "Jeruk Kecil",
  "Jeruk Besar",
  "Nappa",
  "Amplas",
  "Karbon",
  "Tusuk Jarum",
  "Mio Soul",
  "Mio Urat",
  "Biji Kopi",
  "Biji Kopi Cokelat",
  "Big Dot",
] as const;

/** Motif families: choosing one means choosing a child, stored as `3D Catur`. */
export const MOTIF_GROUPS = {
  "3D": [
    "Catur",
    "Catur Garis",
    "Wajik Garis",
    "Hexagon",
    "Abstract",
    "Army",
    "Diamond",
    "Glitter",
    "Luxe",
    "Kotak Kecil",
    "Bintang",
    "Wave",
  ],
} as const satisfies Record<string, readonly string[]>;

/** Every motif value that can be stored. */
export const MOTIFS: readonly string[] = [
  ...PLAIN_MOTIFS,
  ...Object.entries(MOTIF_GROUPS).flatMap(([group, children]) =>
    children.map((child) => `${group} ${child}`),
  ),
];

/** Listed motif matching `name` without regard to case, else `name` as typed (ADR-0034). */
export function canonicalMotif(name: string): string {
  return MOTIFS.find((motif) => motif.toLowerCase() === name.toLowerCase()) ?? name;
}

/** Motif options for the searchable dropdown, grouped by family. */
export const MOTIF_OPTIONS: readonly { value: string; label: string; group?: string }[] = [
  ...PLAIN_MOTIFS.map((motif) => ({ value: motif, label: motif })),
  ...Object.entries(MOTIF_GROUPS).flatMap(([group, children]) =>
    children.map((child) => ({ value: `${group} ${child}`, label: child, group })),
  ),
];

/** Colours with their swatch; the hex is filled in, never typed (FR-VAR-03). */
export const COLORS = [
  { name: "Red", hex: "#D32F2F" },
  { name: "Yellow", hex: "#FBC02D" },
  { name: "Green", hex: "#388E3C" },
  { name: "Blue", hex: "#1E88E5" },
  { name: "Navy", hex: "#1A237E" },
  { name: "Maroon", hex: "#800000" },
  { name: "Orange", hex: "#F57C00" },
  { name: "Pink", hex: "#EC407A" },
  { name: "Black", hex: "#212121" },
  { name: "Brown", hex: "#6D4C41" },
] as const;

export const COLOR_NAMES: readonly string[] = COLORS.map((color) => color.name);

/** Listed colour matching `name` without regard to case, else `name` as typed (ADR-0034). */
export function canonicalColor(name: string): string {
  return COLOR_NAMES.find((color) => color.toLowerCase() === name.trim().toLowerCase()) ?? name;
}

/** Swatch of a listed colour, matched without regard to case. */
export function colorHex(name: string): string | undefined {
  return COLORS.find((color) => color.name.toLowerCase() === name.trim().toLowerCase())?.hex;
}
