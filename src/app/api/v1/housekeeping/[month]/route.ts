import type { NextRequest } from "next/server";

import { exportMonthArchive } from "@/features/housekeeping/service";
import { ForbiddenError } from "@/lib/auth/authorize";
import { getSession } from "@/lib/auth/guard";
import { problemResponse, problems } from "@/lib/http/problem";
import { currentRequestContext } from "@/lib/http/request-context";
import { requestIdOf } from "@/lib/http/request-id";

/** A month's archive as a streamed ZIP of CSV files (FR-HK-02, FR-HK-06, FR-HK-07). */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/v1/housekeeping/[month]">,
) {
  try {
    const { month } = await context.params;
    const session = await getSession();
    if (!session) return problemResponse(problems.unauthorized());
    const stream = await exportMonthArchive(session, month, await currentRequestContext());
    if (!stream) return problemResponse(problems.notFound());
    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="arsip-${month}.zip"`,
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
