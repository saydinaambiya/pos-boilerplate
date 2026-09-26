import { describe, expect, it } from "vitest";

import { dispatchQuery } from "./query-method";

const request = new Request("http://localhost/api/v1/things", { method: "QUERY", body: "{}" });

describe("dispatchQuery", () => {
  it("delegates to the handler registered for the collection", async () => {
    const response = await dispatchQuery(request, "/api/v1/things", {
      "/api/v1/things": () => Promise.resolve(() => Promise.resolve(Response.json({ ok: true }))),
    });
    expect(await response.json()).toEqual({ ok: true });
  });

  it("answers 405 with an Allow header for unregistered collections", async () => {
    const response = await dispatchQuery(request, "/api/v1/unknown", {});
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toContain("GET");
    expect(response.headers.get("Content-Type")).toBe("application/problem+json");
  });
});
