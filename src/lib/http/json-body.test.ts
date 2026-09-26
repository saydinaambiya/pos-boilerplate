import { describe, expect, it } from "vitest";
import { z } from "zod";

import { HttpProblemError, parseJsonBody } from "./json-body";

const schema = z.object({ name: z.string().max(10) }).strict();

function jsonRequest(body: string, contentType = "application/json"): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

async function problemOf(promise: Promise<unknown>) {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  if (!(error instanceof HttpProblemError)) throw new Error("expected HttpProblemError");
  return {
    status: error.response.status,
    body: (await error.response.json()) as Record<string, unknown>,
  };
}

describe("parseJsonBody", () => {
  it("returns the validated body", async () => {
    await expect(parseJsonBody(jsonRequest('{"name":"kopi"}'), schema)).resolves.toEqual({
      name: "kopi",
    });
  });

  it("rejects unknown fields with a pointer to each field (NFR-SEC-02)", async () => {
    const problem = await problemOf(
      parseJsonBody(jsonRequest('{"name":"a","role":"owner"}'), schema),
    );
    expect(problem.status).toBe(422);
    expect(problem.body.errors).toEqual([expect.objectContaining({ pointer: "/role" })]);
  });

  it("rejects non-JSON media types", async () => {
    expect(
      (await problemOf(parseJsonBody(jsonRequest("name=a", "text/plain"), schema))).status,
    ).toBe(415);
  });

  it("rejects malformed JSON", async () => {
    expect((await problemOf(parseJsonBody(jsonRequest("{"), schema))).status).toBe(400);
  });

  it("enforces the body size limit", async () => {
    const body = JSON.stringify({ name: "x".repeat(100) });
    expect((await problemOf(parseJsonBody(jsonRequest(body), schema, 32))).status).toBe(413);
  });
});
