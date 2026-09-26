import "server-only";

import { z } from "zod";

import { env } from "@/config/env";
import { apiHandler } from "@/lib/http/api-handler";
import { parseJsonBody } from "@/lib/http/json-body";
import { problemResponse, problems } from "@/lib/http/problem";
import { requestIdOf } from "@/lib/http/request-id";

const diagnosticsQuery = z
  .object({
    probe: z.string().trim().min(1).max(64),
  })
  .strict();

/**
 * Verifies that `QUERY` requests survive the hosting edge (ADR-0002).
 * Served as `QUERY /api/v1/diagnostics` and `POST /api/v1/diagnostics/search`.
 * It reports metadata only and never echoes the request body back.
 */
export const queryDiagnostics = apiHandler(async (request) => {
  if (!env.ENABLE_DIAGNOSTICS) return problemResponse(problems.notFound());

  const query = await parseJsonBody(request, diagnosticsQuery);
  return Response.json(
    {
      data: {
        method: request.method,
        probeLength: query.probe.length,
        requestId: requestIdOf(request),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
