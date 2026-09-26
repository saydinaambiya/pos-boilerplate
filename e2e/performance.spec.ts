import { gzipSync } from "node:zlib";

import { expect, test } from "@playwright/test";

/**
 * First-load JavaScript budget per route, gzip (PRD NFR-PERF-02). The
 * framework alone accounts for ~179 KB, so each budget leaves ~60 KB for
 * application code.
 */
const budgets: Record<string, number> = {
  "/id": 240 * 1024,
  "/id/ui": 240 * 1024,
};

test.describe("performance budget", () => {
  for (const [path, budget] of Object.entries(budgets)) {
    test(`${path} ships at most ${budget / 1024} KB of JS`, async ({ request }) => {
      const html = await (await request.get(path)).text();
      const sources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
        (match) => match[1] ?? "",
      );
      const sizes = await Promise.all(
        sources.map(async (src) => gzipSync(await (await request.get(src)).body()).byteLength),
      );
      const total = sizes.reduce((sum, size) => sum + size, 0);
      test.info().annotations.push({ type: "js-gzip-bytes", description: String(total) });
      expect(total).toBeLessThanOrEqual(budget);
    });
  }
});
