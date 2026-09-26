import { paletteCss } from "@/lib/theme/active-palette";

/**
 * Active palette as a static stylesheet, generated at build time. Served as a
 * file rather than an inline `<style>` so it is cacheable and needs no CSP
 * nonce across client-side navigations (ADR-0003).
 */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(paletteCss, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
