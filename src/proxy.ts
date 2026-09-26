import createIntlMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { dispatchQuery, QUERY_METHOD } from "@/lib/http/query-method";
import { queryRoutes } from "@/lib/http/query-routes";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/http/request-id";
import {
  apiContentSecurityPolicy,
  createNonce,
  pageContentSecurityPolicy,
  staticSecurityHeaders,
} from "@/lib/security/headers";

const intl = createIntlMiddleware(routing);

/**
 * Network boundary for every non-asset request:
 * request id tracing, QUERY dispatch, locale routing and the nonce-based CSP.
 */
export async function proxy(request: NextRequest): Promise<Response> {
  const requestId = resolveRequestId(request.headers);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (request.method === QUERY_METHOD) {
      const response = await dispatchQuery(
        new Request(request, { headers: requestHeaders }),
        request.nextUrl.pathname,
        queryRoutes,
      );
      // Responses produced here bypass next.config headers, so apply them directly.
      for (const { key, value } of staticSecurityHeaders) response.headers.set(key, value);
      response.headers.set("Content-Security-Policy", apiContentSecurityPolicy);
      response.headers.set(REQUEST_ID_HEADER, requestId);
      return response;
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", apiContentSecurityPolicy);
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }

  const nonce = createNonce();
  const csp = pageContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = intl(new NextRequest(request, { headers: requestHeaders }));
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|assets/|brand/|favicon.ico|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
