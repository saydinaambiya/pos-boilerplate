import { HttpProblemError } from "./json-body";
import { problemResponse, problems } from "./problem";
import { requestIdOf } from "./request-id";

export type ApiHandler = (request: Request) => Promise<Response>;

/**
 * Wraps a route handler so expected failures become Problem Details and
 * unexpected ones are logged server-side with a generic 500 (NFR-SEC-11).
 */
export function apiHandler(handler: ApiHandler): ApiHandler {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpProblemError) return error.response;
      const requestId = requestIdOf(request);
      console.error(JSON.stringify({ level: "error", requestId, error: String(error) }));
      return problemResponse(problems.internal(requestId));
    }
  };
}
