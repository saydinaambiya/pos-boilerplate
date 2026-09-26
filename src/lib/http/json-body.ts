import type { z } from "zod";

import { problemResponse, problems } from "./problem";

/** Default request body cap; routes that accept more pass their own limit. */
export const DEFAULT_BODY_LIMIT_BYTES = 64 * 1024;

export class HttpProblemError extends Error {
  constructor(readonly response: Response) {
    super(`HTTP ${response.status}`);
  }
}

/**
 * Reads and validates a JSON body. Schemas are expected to be `.strict()`,
 * which rejects unknown fields and prevents mass assignment (NFR-SEC-02).
 */
export async function parseJsonBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
  limitBytes = DEFAULT_BODY_LIMIT_BYTES,
): Promise<z.infer<Schema>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(contentType)) {
    throw new HttpProblemError(problemResponse(problems.unsupportedMediaType()));
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > limitBytes) {
    throw new HttpProblemError(problemResponse(problems.payloadTooLarge(limitBytes)));
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > limitBytes) {
    throw new HttpProblemError(problemResponse(problems.payloadTooLarge(limitBytes)));
  }

  let json: unknown;
  try {
    json = text === "" ? {} : JSON.parse(text);
  } catch {
    throw new HttpProblemError(problemResponse(problems.badRequest("Body is not valid JSON.")));
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new HttpProblemError(problemResponse(problems.validation(result.error)));
  }
  return result.data;
}
