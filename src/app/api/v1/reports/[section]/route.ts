import { hasLocale } from "next-intl";
import type { NextRequest } from "next/server";

import { reportCsv } from "@/features/reports/export";
import { reportSections, type ReportSection } from "@/features/reports/schemas";
import { getSalesReport } from "@/features/reports/service";
import { routing } from "@/i18n/routing";
import { ForbiddenError } from "@/lib/auth/authorize";
import { getSession } from "@/lib/auth/guard";
import { problemResponse, problems } from "@/lib/http/problem";
import { requestIdOf } from "@/lib/http/request-id";

function isSection(value: string): value is ReportSection {
  return (reportSections as readonly string[]).includes(value);
}

/**
 * One report section as CSV, streamed to the browser and never stored
 * (FR-RPT-05). Starts with a UTF-8 BOM so spreadsheet apps read names
 * correctly.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/v1/reports/[section]">,
) {
  try {
    const { section } = await context.params;
    if (!isSection(section)) return problemResponse(problems.notFound());
    const session = await getSession();
    if (!session) return problemResponse(problems.unauthorized());

    const params = request.nextUrl.searchParams;
    const lang = params.get("lang");
    const locale = lang && hasLocale(routing.locales, lang) ? lang : routing.defaultLocale;
    const report = await getSalesReport(session, {
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    });
    const lines = reportCsv(report, section, locale);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("﻿"));
      },
      pull(controller) {
        const next = lines.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      },
    });
    const filename = `rekap-${section}-${report.range.from}-${report.range.to}.csv`;
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
