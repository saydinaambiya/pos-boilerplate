import { type PaletteName, paletteNames } from "@/config/palettes";
import { paletteFileName, renderPaletteCss } from "@/lib/theme/palette-css";

/**
 * Every palette as a static, fingerprinted stylesheet (ADR-0003). The layout
 * links the one chosen in `app.config.ts`; this route never reads the config,
 * so it cannot serve an outdated choice. Served as files rather than inline
 * `<style>` so they are cacheable and need no CSP nonce across client-side
 * navigations. A name whose fingerprint does not match the current tokens is
 * a 404, so stale content is never cached under a new URL.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

const files = new Map<string, PaletteName>(
  paletteNames.map((name) => [paletteFileName(name, renderPaletteCss(name)), name]),
);

export function generateStaticParams() {
  return [...files.keys()].map((file) => ({ file }));
}

export async function GET(
  _request: Request,
  context: RouteContext<"/assets/palettes/[file]">,
): Promise<Response> {
  const name = files.get((await context.params).file);
  if (!name) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(renderPaletteCss(name), {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
