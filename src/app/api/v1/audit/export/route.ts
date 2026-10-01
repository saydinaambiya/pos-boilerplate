import type { NextRequest } from "next/server";

import { exportAuditRange, purgeRange } from "@/features/audit/service";
import { ForbiddenError } from "@/lib/auth/authorize";
import { getSession } from "@/lib/auth/guard";
import { problemResponse, problems } from "@/lib/http/problem";
import { currentRequestContext } from "@/lib/http/request-context";
import { requestIdOf } from "@/lib/http/request-id";

/** A past range of the audit log as a streamed CSV, the step before deleting it (FR-AUD-05). */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return problemResponse(problems.unauthorized());
    const params = request.nextUrl.searchParams;
    const range = await purgeRange(params.get("from") ?? "", params.get("to") ?? "");
    if (!range) return problemResponse(problems.badRequest("Choose whole days before today."));
    const stream = exportAuditRange(session, range, await currentRequestContext());
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-log-${range.from}-${range.to}.csv"`,
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
