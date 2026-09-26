"use client";

import { Download, Link2, Printer, Share2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

import { createInvoiceLinkAction } from "../actions";

interface InvoiceToolbarProps {
  locale: Locale;
  saleId: string;
  invoiceNo: string;
  lang: Locale;
  size: string;
  pdfHref: string;
  backHref: string;
  sizes: readonly { label: string; href: string; active: boolean }[];
  languages: readonly { label: string; href: string; active: boolean }[];
  autoPrint: boolean;
  labels: {
    toolbar: string;
    paperSize: string;
    language: string;
    print: string;
    download: string;
    share: string;
    copyLink: string;
    linkCopied: string;
    linkReady: string;
    linkFailed: string;
    shareFailed: string;
    back: string;
  };
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Print options, hidden on paper: size and language switch, browser print
 * (FR-INV-01), PDF download (FR-PDF-02), Web Share with a download fallback
 * (FR-PDF-03) and a signed download link (FR-PDF-04).
 */
export function InvoiceToolbar(props: InvoiceToolbarProps) {
  const { labels } = props;
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const printed = useRef(false);
  const filename = `${props.invoiceNo}.pdf`;

  useEffect(() => {
    if (props.autoPrint && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [props.autoPrint]);

  const share = () => {
    startTransition(async () => {
      const response = await fetch(props.pdfHref);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: "application/pdf" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: props.invoiceNo });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
      saveBlob(blob, filename);
      setMessage(labels.shareFailed);
    });
  };

  const copyLink = () => {
    startTransition(async () => {
      const result = await createInvoiceLinkAction(
        props.locale,
        props.saleId,
        props.lang,
        props.size,
      );
      if (!result) {
        setMessage(labels.linkFailed);
        return;
      }
      try {
        await navigator.clipboard.writeText(result.url);
        setLink(null);
        setMessage(labels.linkCopied);
      } catch {
        setLink(result.url);
        setMessage(labels.linkReady);
      }
    });
  };

  const choice = (option: { label: string; href: string; active: boolean }) => (
    <Link
      key={option.href}
      href={option.href}
      aria-current={option.active ? "true" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-ink-muted hover:text-ink",
        option.active && "bg-surface text-ink shadow-sm",
      )}
    >
      {option.label}
    </Link>
  );

  return (
    <div
      role="toolbar"
      aria-label={labels.toolbar}
      className="mx-auto mb-6 flex max-w-3xl flex-col gap-3 px-4 print:hidden"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost">
          <Link href={props.backHref}>{labels.back}</Link>
        </Button>
        <div
          role="group"
          aria-label={labels.paperSize}
          className="inline-flex rounded-full bg-surface-muted p-1"
        >
          {props.sizes.map(choice)}
        </div>
        <div
          role="group"
          aria-label={labels.language}
          className="inline-flex rounded-full bg-surface-muted p-1"
        >
          {props.languages.map(choice)}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            window.print();
          }}
        >
          <Printer aria-hidden="true" />
          {labels.print}
        </Button>
        <Button asChild variant="secondary">
          <a href={props.pdfHref} download={filename}>
            <Download aria-hidden="true" />
            {labels.download}
          </a>
        </Button>
        <Button variant="secondary" onClick={share} disabled={pending}>
          <Share2 aria-hidden="true" />
          {labels.share}
        </Button>
        <Button variant="secondary" onClick={copyLink} disabled={pending}>
          <Link2 aria-hidden="true" />
          {labels.copyLink}
        </Button>
      </div>
      {message ? (
        <p role="status" className="text-sm text-ink-muted">
          {message}
        </p>
      ) : null}
      {link ? (
        <Input
          readOnly
          value={link}
          aria-label={labels.copyLink}
          onFocus={(event) => {
            event.target.select();
          }}
        />
      ) : null}
    </div>
  );
}
