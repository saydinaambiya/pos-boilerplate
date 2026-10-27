import { hasLocale } from "next-intl";
import type { NextRequest } from "next/server";

import { exportPurchases } from "@/features/purchases/service";
import { purchaseExportQuery } from "@/features/purchases/schemas";
import { routing } from "@/i18n/routing";
import { ForbiddenError } from "@/lib/auth/authorize";
import { getSession } from "@/lib/auth/guard";
import { problemResponse, problems } from "@/lib/http/problem";
import { requestIdOf } from "@/lib/http/request-id";

/**
 * Supplier bills as CSV streamed to the browser (FR-PRB-04).
 * Starts with a UTF-8 BOM so spreadsheet apps read names correctly.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return problemResponse(problems.unauthorized());

    const params = request.nextUrl.searchParams;
    const query = purchaseExportQuery.parse({
      filter: params.get("filter") ?? undefined,
      q: params.get("q") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      archived: params.get("archived") ?? undefined,
      lang: params.get("lang") ?? undefined,
    });
    const locale =
      query.lang && hasLocale(routing.locales, query.lang) ? query.lang : routing.defaultLocale;

    const { lines, range } = await exportPurchases(
      session,
      {
        filter: query.filter,
        search: query.q,
        from: query.from,
        to: query.to,
        includeArchived: query.archived === "1",
      },
      locale,
    );

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("\uFEFF"));
      },
      pull(controller) {
        const next = lines.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      },
    });

    const rangeSlug =
      range.from && range.to
        ? `${range.from}-${range.to}`
        : range.from
          ? `dari-${range.from}`
          : range.to
            ? `sampai-${range.to}`
            : range.today;
    const filename = `rekap-pembelian-${rangeSlug}.csv`;

    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return problemResponse(problems.forbidden());
    console.error(
      JSON.stringify({ level: "error", requestId: requestIdOf(request), error: String(error) }),
    );
    return problemResponse(problems.internal(requestIdOf(request)));
  }
}
