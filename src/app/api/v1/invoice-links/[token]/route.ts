import { hasLocale } from "next-intl";
import type { NextRequest } from "next/server";

import { getInvoiceDocumentByToken, invoiceLabels } from "@/features/invoices/service";
import { pdfDisposition, renderInvoicePdf } from "@/features/invoices/pdf";
import { isInvoiceSize } from "@/features/invoices/types";
import { routing } from "@/i18n/routing";
import { problemResponse, problems } from "@/lib/http/problem";
import { requestContextFrom } from "@/lib/http/request-context";
import { requestIdOf } from "@/lib/http/request-id";
import { failureCounter } from "@/lib/security/rate-limit";

const LIMIT = 30;
const WINDOW_SECONDS = 10 * 60;

const publicHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

/**
 * Public, signed invoice download (FR-PDF-04/05). The token is the only
 * credential; it reveals exactly one invoice and expires. Requests are rate
 * limited per client address and never cached or indexed.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/v1/invoice-links/[token]">,
) {
  try {
    const ip = requestContextFrom(request.headers).ip ?? "unknown";
    const key = `invoice-link:${ip}`;
    const usage = await failureCounter.get(key);
    if (usage.count >= LIMIT) {
      const retryAfter = Math.max(usage.resetSeconds, 1);
      return problemResponse(problems.tooManyRequests(retryAfter), {
        headers: { ...publicHeaders, "Retry-After": String(retryAfter) },
      });
    }
    await failureCounter.increment(key, WINDOW_SECONDS);

    const { token } = await context.params;
    const lang = request.nextUrl.searchParams.get("lang");
    const locale = lang && hasLocale(routing.locales, lang) ? lang : routing.defaultLocale;
    const size = request.nextUrl.searchParams.get("size");
    const document = await getInvoiceDocumentByToken(token, locale);
    if (!document) return problemResponse(problems.notFound(), { headers: publicHeaders });

    const pdf = await renderInvoicePdf(
      document,
      invoiceLabels(locale, document),
      isInvoiceSize(size) ? size : "a4",
    );
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...publicHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfDisposition(document.invoiceNo),
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({ level: "error", requestId: requestIdOf(request), error: String(error) }),
    );
    return problemResponse(problems.internal(requestIdOf(request)), { headers: publicHeaders });
  }
}
