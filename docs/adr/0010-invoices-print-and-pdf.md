# ADR-0010: Invoice printing, PDF and signed download links

- Status: Accepted
- Date: 2026-09-26
- Requirements: PRD §6, FR-INV-01..05, FR-PDF-01..06, BR-16, BR-22

## Context

Invoices print on 58 mm and 80 mm thermal printers and on A4 through the
browser print dialog, and are shared as PDF files that are never stored.
The pages run under a nonce-based CSP, and receipts must never overflow with
long names or billion-rupiah amounts.

## Decision

- One `InvoiceDocument` (sale snapshot, store profile, brand) is built on the
  server for a chosen locale and feeds both the print view and the PDF, so
  their content cannot drift apart. Labels follow the language picked at
  print time, independent of the UI language (FR-INV-05).
- **Print view** `/[locale]/print/invoices/[id]` lives outside the app shell.
  Paper sizes are CSS named pages (`@page thermal58 { size: 58mm auto }`)
  selected with `page:` on the paper element, so no inline styles are needed.
  Thermal receipts use 9.4 px monospace on 48 / 72 mm, which gives the
  32 / 48 characters per line of PRD §6.1. Text wraps anywhere, amounts never
  break, and the A4 table header repeats on each page.
- Cash tendered and change are passed to the print view only right after
  checkout (`tendered` query parameter); reprints and PDFs omit them because
  they are not stored (BR-22).
- **PDF** is rendered on demand with `@react-pdf/renderer` in the route
  handler and streamed with `Content-Disposition: attachment` and
  `Cache-Control: private, no-store`. Built-in PDF fonts (WinAnsi) are used;
  negative amounts use an ASCII hyphen because U+2212 is not available.
  Thermal PDFs are one continuous page whose height follows the content.
- **Share** uses the Web Share API with the PDF file where supported and falls
  back to downloading it.
- **Download links** are stateless tokens `saleId.expiry.hmac` signed with
  `INVOICE_LINK_SECRET` (HMAC-SHA256, 7 days). Nothing is stored; rotating the
  secret revokes every outstanding link (FR-PDF-06). The public route is rate
  limited per client address (30 per 10 minutes), sends `X-Robots-Tag:
noindex` and `no-store`, and can only reveal the one invoice in the token.
- **Tests**: a deterministic "extreme" sale (50 lines, 120-character names,
  Rp 98 billion) is seeded for E2E. DOM checks assert that no element
  overflows and no amount leaves the paper in all three formats; these run
  everywhere. Screenshot baselines are platform-specific and are kept for
  macOS; CI on Linux skips the image comparison (`ignoreSnapshots`).

## Consequences

- Deployments need `INVOICE_LINK_SECRET` (at least 32 characters).
- Visual regressions on Linux are caught only by the DOM checks until Linux
  baselines are generated in the Playwright container.
