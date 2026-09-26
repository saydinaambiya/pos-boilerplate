import type { z } from "zod";

/**
 * RFC 9457 Problem Details (PRD §8.2).
 * `type` URIs are relative to the deployment origin and documented in
 * docs/api/problems.md.
 */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: { pointer: string; detail: string }[];
}

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

export function problemResponse(problem: Problem, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", PROBLEM_CONTENT_TYPE);
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(problem), { ...init, status: problem.status, headers });
}

export const problems = {
  badRequest: (detail: string): Problem => ({
    type: "/problems/bad-request",
    title: "Bad Request",
    status: 400,
    detail,
  }),
  unauthorized: (): Problem => ({
    type: "/problems/unauthorized",
    title: "Unauthorized",
    status: 401,
    detail: "Sign in to access this resource.",
  }),
  forbidden: (): Problem => ({ type: "/problems/forbidden", title: "Forbidden", status: 403 }),
  notFound: (): Problem => ({ type: "/problems/not-found", title: "Not Found", status: 404 }),
  tooManyRequests: (retryAfterSeconds: number): Problem => ({
    type: "/problems/too-many-requests",
    title: "Too Many Requests",
    status: 429,
    detail: `Retry after ${String(retryAfterSeconds)} seconds.`,
  }),
  methodNotAllowed: (method: string): Problem => ({
    type: "/problems/method-not-allowed",
    title: "Method Not Allowed",
    status: 405,
    detail: `${method} is not supported for this resource.`,
  }),
  payloadTooLarge: (limitBytes: number): Problem => ({
    type: "/problems/payload-too-large",
    title: "Payload Too Large",
    status: 413,
    detail: `Request body exceeds ${limitBytes} bytes.`,
  }),
  unsupportedMediaType: (): Problem => ({
    type: "/problems/unsupported-media-type",
    title: "Unsupported Media Type",
    status: 415,
    detail: "Request body must be application/json.",
  }),
  validation: (error: z.ZodError): Problem => ({
    type: "/problems/validation-error",
    title: "Validation Failed",
    status: 422,
    errors: error.issues.flatMap((issue) => {
      const base = issue.path.map(String);
      // Point at each rejected field rather than at its parent object.
      const paths =
        issue.code === "unrecognized_keys" ? issue.keys.map((key) => [...base, key]) : [base];
      return paths.map((path) => ({ pointer: `/${path.join("/")}`, detail: issue.message }));
    }),
  }),
  internal: (requestId: string): Problem => ({
    type: "/problems/internal-error",
    title: "Internal Server Error",
    status: 500,
    detail: `Reference: ${requestId}`,
  }),
};
