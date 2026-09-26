import { expect, test } from "@playwright/test";

interface DiagnosticsResponse {
  data: { method: string; probeLength: number };
}

test.describe("HTTP QUERY (ADR-0002)", () => {
  test("QUERY and POST /search share one handler", async ({ request }) => {
    const body = { probe: "hello" };
    const viaQuery = await request.fetch("/api/v1/diagnostics", { method: "QUERY", data: body });
    const viaPost = await request.post("/api/v1/diagnostics/search", { data: body });

    expect(viaQuery.status()).toBe(200);
    expect(viaPost.status()).toBe(200);
    expect(((await viaQuery.json()) as DiagnosticsResponse).data).toMatchObject({
      method: "QUERY",
      probeLength: 5,
    });
    expect(((await viaPost.json()) as DiagnosticsResponse).data).toMatchObject({
      method: "POST",
      probeLength: 5,
    });
    expect(viaQuery.headers()["strict-transport-security"]).toBeTruthy();
  });

  test("rejects unknown fields with problem details", async ({ request }) => {
    const response = await request.fetch("/api/v1/diagnostics", {
      method: "QUERY",
      data: { probe: "x", role: "owner" },
    });
    expect(response.status()).toBe(422);
    expect(response.headers()["content-type"]).toBe("application/problem+json");
  });

  test("answers 405 for collections without QUERY", async ({ request }) => {
    const response = await request.fetch("/api/v1/products", { method: "QUERY", data: {} });
    expect(response.status()).toBe(405);
  });
});
