import { cn } from "@/lib/utils/cn";

import type { VariantColor } from "../schemas";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Colour swatch rendered as an SVG `fill` attribute, never an inline style,
 * so it works under the nonce-based CSP (FR-VAR-03). The hex is validated by
 * `hexColor` before it is stored. Without a hex, a neutral circle shows the
 * colour's initials. Decorative: the colour name is always shown as text.
 */
export function ColorSwatch({
  color,
  className,
}: {
  color: VariantColor | null;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-6 shrink-0", className)}>
      {color?.hex ? (
        <circle cx="12" cy="12" r="11" fill={color.hex} strokeWidth="1" className="stroke-border" />
      ) : (
        <>
          <circle cx="12" cy="12" r="11" strokeWidth="1" className="fill-neutral stroke-border" />
          <text
            x="12"
            y="12"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="9"
            className="fill-neutral-ink font-semibold"
          >
            {initials(color?.name ?? "")}
          </text>
        </>
      )}
    </svg>
  );
}
