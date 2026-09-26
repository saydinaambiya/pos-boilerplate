import type { ReactNode } from "react";

import { formatCurrency } from "@/lib/format/currency";
import { cn } from "@/lib/utils/cn";

import type { InvoiceDocument, InvoiceLabels, InvoiceSize } from "../types";

interface InvoicePaperProps {
  document: InvoiceDocument;
  labels: InvoiceLabels;
  size: InvoiceSize;
  /** Cash tendered, only right after checkout; never stored (BR-22, FR-INV-04). */
  tendered?: { received: number; change: number } | null;
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: ReactNode;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={cn("flex justify-between gap-2", strong && "font-bold")}>
      <span className="min-w-0">{label}</span>
      <span className="amount">{value}</span>
    </div>
  );
}

/** Thermal receipt, 58 or 80 mm: stacked lines, amounts right-aligned (PRD §6.1). */
function Thermal({ document: doc, labels, tendered }: Omit<InvoicePaperProps, "size">) {
  const money = (amount: number) => formatCurrency(amount, doc.locale);
  return (
    <>
      <header className="text-center">
        {doc.store.printLogo ? (
          // eslint-disable-next-line @next/next/no-img-element -- static brand asset, printed as-is
          <img
            src={doc.store.printLogo}
            alt={doc.store.name}
            className="mx-auto mb-1 max-h-12 w-auto"
          />
        ) : null}
        <p className="font-bold">{doc.store.name}</p>
        {doc.store.address ? <p>{doc.store.address}</p> : null}
        {doc.store.phone ? <p>{doc.store.phone}</p> : null}
        {doc.store.email ? <p>{doc.store.email}</p> : null}
        {doc.store.npwp ? <p>{`${labels.npwp} ${doc.store.npwp}`}</p> : null}
      </header>
      {doc.voided ? <p className="my-1 text-center font-bold">{labels.voided}</p> : null}
      <div className="rule" />
      <Row label={labels.number} value={doc.invoiceNo} />
      <Row label={labels.date} value={doc.issuedAtText} />
      <Row label={labels.cashier} value={doc.cashierName} />
      <div className="rule" />
      <ul>
        {doc.items.map((item, index) => (
          <li key={index} className="mb-1">
            <p>{item.name}</p>
            <Row
              label={`${String(item.qty)} × ${money(item.unitPrice)}`}
              value={money(item.qty * item.unitPrice)}
            />
            {item.discount > 0 ? (
              <Row label={labels.discount} value={`−${money(item.discount)}`} />
            ) : null}
          </li>
        ))}
      </ul>
      <div className="rule" />
      <Row label={labels.subtotal} value={money(doc.subtotal)} />
      {doc.itemDiscountTotal > 0 ? (
        <Row label={labels.itemDiscounts} value={`−${money(doc.itemDiscountTotal)}`} />
      ) : null}
      {doc.voucherDiscount > 0 ? (
        <Row
          label={doc.voucherCode ? `${labels.voucher} ${doc.voucherCode}` : labels.voucher}
          value={`−${money(doc.voucherDiscount)}`}
        />
      ) : null}
      {doc.service ? <Row label={labels.service} value={money(doc.service.amount)} /> : null}
      {doc.ppn ? (
        <Row
          label={doc.ppn.included ? labels.ppnIncluded : labels.ppn}
          value={money(doc.ppn.amount)}
        />
      ) : null}
      <Row label={labels.total} value={money(doc.grandTotal)} strong />
      <div className="rule" />
      <p>{labels.payments}</p>
      {doc.payments.map((payment, index) => (
        <Row key={index} label={payment.label} value={money(payment.amount)} />
      ))}
      {doc.kasbon ? (
        <>
          <Row label={labels.kasbonBalance} value={money(doc.kasbon.balance)} strong />
          <Row label={labels.customer} value={doc.kasbon.customerName} />
        </>
      ) : null}
      {tendered ? (
        <>
          <Row label={labels.cashReceived} value={money(tendered.received)} />
          <Row label={labels.change} value={money(tendered.change)} strong />
        </>
      ) : null}
      {doc.store.footer ? (
        <>
          <div className="rule" />
          <p className="text-center">{doc.store.footer}</p>
        </>
      ) : null}
    </>
  );
}

/** A4 invoice: full store header and a table whose header repeats on each page (FR-INV-02). */
function A4({ document: doc, labels, tendered }: Omit<InvoicePaperProps, "size">) {
  const money = (amount: number) => formatCurrency(amount, doc.locale);
  return (
    <>
      <header className="mb-6 flex items-start justify-between gap-6">
        <div className="min-w-0">
          {doc.store.printLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- static brand asset, printed as-is
            <img src={doc.store.printLogo} alt={doc.store.name} className="mb-2 max-h-16 w-auto" />
          ) : null}
          <p className="text-lg font-bold">{doc.store.name}</p>
          {doc.store.address ? <p>{doc.store.address}</p> : null}
          <p>{[doc.store.phone, doc.store.email].filter(Boolean).join(" · ")}</p>
          {doc.store.npwp ? <p>{`${labels.npwp} ${doc.store.npwp}`}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tracking-wide uppercase">{labels.invoice}</p>
          {doc.voided ? <p className="font-bold">{labels.voided}</p> : null}
          <p>{`${labels.number} ${doc.invoiceNo}`}</p>
          <p>{`${labels.date} ${doc.issuedAtText}`}</p>
          <p>{`${labels.cashier} ${doc.cashierName}`}</p>
        </div>
      </header>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left whitespace-nowrap">
            <th className="py-1 pr-2">{labels.item}</th>
            <th className="py-1 pr-2 text-right">{labels.qty}</th>
            <th className="py-1 pr-2 text-right">{labels.price}</th>
            <th className="py-1 pr-2 text-right">{labels.discount}</th>
            <th className="py-1 text-right">{labels.amount}</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((item, index) => (
            <tr key={index} className="border-b border-black/20 align-top">
              <td className="py-1 pr-2">{item.name}</td>
              <td className="amount py-1 pr-2 text-right">{item.qty}</td>
              <td className="amount py-1 pr-2 text-right">{money(item.unitPrice)}</td>
              <td className="amount py-1 pr-2 text-right">
                {item.discount > 0 ? `−${money(item.discount)}` : ""}
              </td>
              <td className="amount py-1 text-right">{money(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 ml-auto flex w-80 max-w-full flex-col gap-0.5">
        <Row label={labels.subtotal} value={money(doc.subtotal)} />
        {doc.voucherDiscount > 0 ? (
          <Row
            label={doc.voucherCode ? `${labels.voucher} ${doc.voucherCode}` : labels.voucher}
            value={`−${money(doc.voucherDiscount)}`}
          />
        ) : null}
        {doc.service ? <Row label={labels.service} value={money(doc.service.amount)} /> : null}
        {doc.ppn ? (
          <Row
            label={doc.ppn.included ? labels.ppnIncluded : labels.ppn}
            value={money(doc.ppn.amount)}
          />
        ) : null}
        <div className="my-1 border-t border-black" />
        <Row label={labels.total} value={money(doc.grandTotal)} strong />
        <p className="mt-3 font-bold">{labels.payments}</p>
        {doc.payments.map((payment, index) => (
          <Row key={index} label={payment.label} value={money(payment.amount)} />
        ))}
        {doc.kasbon ? (
          <>
            <Row label={labels.kasbonBalance} value={money(doc.kasbon.balance)} strong />
            <Row label={labels.customer} value={doc.kasbon.customerName} />
          </>
        ) : null}
        {tendered ? (
          <>
            <Row label={labels.cashReceived} value={money(tendered.received)} />
            <Row label={labels.change} value={money(tendered.change)} strong />
          </>
        ) : null}
      </div>
      {doc.store.footer ? <p className="mt-8 text-center">{doc.store.footer}</p> : null}
    </>
  );
}

/**
 * Printable invoice in one of three formats (PRD §6.1, FR-INV-01..05).
 * Long text wraps anywhere and amounts never break (FR-INV-02).
 */
export function InvoicePaper({ size, ...props }: InvoicePaperProps) {
  return (
    <article
      data-size={size}
      data-testid="invoice"
      aria-label={`${props.labels.invoice} ${props.document.invoiceNo}`}
      className="invoice mx-auto shadow-card"
    >
      {size === "a4" ? <A4 {...props} /> : <Thermal {...props} />}
    </article>
  );
}
