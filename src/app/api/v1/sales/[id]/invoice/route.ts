import { hasLocale } from "next-intl";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { getInvoiceDocument, invoiceLabels } from "@/features/invoices/service";
import { pdfDisposition, renderInvoicePdf } from "@/features/invoices/pdf";
import { isInvoiceSize } from "@/features/invoices/types";
import { routing } from "@/i18n/routing";
import { ForbiddenError } from "@/lib/auth/authorize";
import { getSession } from "@/lib/auth/guard";
import { problemResponse, problems } from "@/lib/http/problem";
import { requestIdOf } from "@/lib/http/request-id";

/**
 * Invoice PDF for a signed-in viewer allowed to see the sale, generated on
 * demand and never stored (FR-PDF-01/02, NFR-SEC-07).
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/v1/sales/[id]/invoice">,
) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) return problemResponse(problems.notFound());
    const session = await getSession();
    if (!session) return problemResponse(problems.unauthorized());

    const lang = request.nextUrl.searchParams.get("lang");
    const locale = lang && hasLocale(routing.locales, lang) ? lang : routing.defaultLocale;
    const size = request.nextUrl.searchParams.get("size");
    const document = await getInvoiceDocument(session, id, locale);
    if (!document) return problemResponse(problems.notFound());

    const pdf = await renderInvoicePdf(
      document,
      invoiceLabels(locale, document),
      isInvoiceSize(size) ? size : "a4",
    );
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfDisposition(document.invoiceNo),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return problemResponse(problems.forbidden());
    console.error(
      JSON.stringify({ level: "error", requestId: requestIdOf(request), error: String(error) }),
    );
    return problemResponse(problems.internal(requestIdOf(request)));
  }
}
