import pkg from "../../../../package.json" with { type: "json" };

/** Liveness probe (PRD NFR-REL-03). A database check is added in Milestone 1. */
export function GET(): Response {
  return Response.json(
    { status: "ok", version: pkg.version, time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
