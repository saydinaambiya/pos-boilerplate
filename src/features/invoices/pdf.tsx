import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  Document,
  Image as PdfImage,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import { formatCurrency } from "@/lib/format/currency";

import type { InvoiceDocument, InvoiceLabels, InvoiceSize } from "./types";

const MM = 72 / 25.4;
/** Built-in PDF fonts use WinAnsi, which lacks U+2212, so negatives use a hyphen. */
const MINUS = "-";

const styles = StyleSheet.create({
  thermal: { fontFamily: "Courier", fontSize: 7, color: "black", lineHeight: 1.35 },
  a4: { fontFamily: "Helvetica", fontSize: 10, color: "black", padding: 34, lineHeight: 1.4 },
  center: { textAlign: "center" },
  bold: { fontFamily: "Helvetica-Bold" },
  monoBold: { fontFamily: "Courier-Bold" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rule: { borderTopWidth: 0.5, borderTopColor: "black", borderStyle: "dashed", marginVertical: 4 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "gray",
    paddingVertical: 3,
  },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "black",
    paddingVertical: 3,
  },
  colItem: { flex: 1, paddingRight: 6 },
  colNumber: { width: 80, textAlign: "right" },
  colQty: { width: 36, textAlign: "right" },
  totals: { marginTop: 10, marginLeft: "auto", width: 230 },
});

/** Thermal PDFs are one continuous page; height grows with the content. */
function pageSize(size: InvoiceSize, doc: InvoiceDocument): "A4" | [number, number] {
  if (size === "a4") return "A4";
  const perLine = size === "58mm" ? 32 : 48;
  const lines =
    24 +
    doc.payments.length +
    doc.items.reduce(
      (count, item) =>
        count + 2 + (item.discount > 0 ? 1 : 0) + Math.floor(item.name.length / perLine),
      0,
    );
  return [(size === "58mm" ? 58 : 80) * MM, Math.max(lines * 10 + 40, 220)];
}

async function logoData(logo: string | null): Promise<Buffer | null> {
  if (!logo || !/^\/brand\/[\w.-]+\.(png|jpe?g)$/i.test(logo)) return null;
  try {
    return await readFile(path.join(process.cwd(), "public", logo));
  } catch {
    return null;
  }
}

function InvoicePdf({
  doc,
  labels,
  size,
  logo,
}: {
  doc: InvoiceDocument;
  labels: InvoiceLabels;
  size: InvoiceSize;
  logo: Buffer | null;
}) {
  const money = (amount: number) => formatCurrency(amount, doc.locale);
  const minus = (amount: number) => `${MINUS}${money(amount)}`;
  const thermal = size !== "a4";
  const line = (label: string, value: string, strong = false) => (
    <View style={styles.row}>
      <Text style={strong ? (thermal ? styles.monoBold : styles.bold) : {}}>{label}</Text>
      <Text style={strong ? (thermal ? styles.monoBold : styles.bold) : {}}>{value}</Text>
    </View>
  );
  const totals = (
    <>
      {line(labels.subtotal, money(doc.subtotal))}
      {thermal && doc.itemDiscountTotal > 0
        ? line(labels.itemDiscounts, minus(doc.itemDiscountTotal))
        : null}
      {doc.voucherDiscount > 0
        ? line(
            doc.voucherCode ? `${labels.voucher} ${doc.voucherCode}` : labels.voucher,
            minus(doc.voucherDiscount),
          )
        : null}
      {doc.service ? line(labels.service, money(doc.service.amount)) : null}
      {doc.ppn
        ? line(doc.ppn.included ? labels.ppnIncluded : labels.ppn, money(doc.ppn.amount))
        : null}
      {line(labels.total, money(doc.grandTotal), true)}
      <Text style={{ marginTop: 6 }}>{labels.payments}</Text>
      {doc.payments.map((payment, index) => (
        <View key={index}>{line(payment.label, money(payment.amount))}</View>
      ))}
    </>
  );
  const storeLines = [
    doc.store.address,
    [doc.store.phone, doc.store.email].filter(Boolean).join(" · "),
    doc.store.npwp ? `${labels.npwp} ${doc.store.npwp}` : "",
  ].filter(Boolean);

  if (thermal) {
    return (
      <Document title={doc.invoiceNo}>
        <Page
          size={pageSize(size, doc)}
          style={[styles.thermal, { padding: (size === "58mm" ? 5 : 4) * MM }]}
        >
          {logo ? (
            <PdfImage src={logo} style={{ height: 30, objectFit: "contain", marginBottom: 4 }} />
          ) : null}
          <Text style={[styles.center, styles.monoBold]}>{doc.store.name}</Text>
          {storeLines.map((text, index) => (
            <Text key={index} style={styles.center}>
              {text}
            </Text>
          ))}
          {doc.voided ? (
            <Text style={[styles.center, styles.monoBold]}>{labels.voided}</Text>
          ) : null}
          <View style={styles.rule} />
          {line(labels.number, doc.invoiceNo)}
          {line(labels.date, doc.issuedAtText)}
          {line(labels.cashier, doc.cashierName)}
          <View style={styles.rule} />
          {doc.items.map((item, index) => (
            <View key={index} wrap={false} style={{ marginBottom: 2 }}>
              <Text>{item.name}</Text>
              {line(
                `${String(item.qty)} × ${money(item.unitPrice)}`,
                money(item.qty * item.unitPrice),
              )}
              {item.discount > 0 ? line(labels.discount, minus(item.discount)) : null}
            </View>
          ))}
          <View style={styles.rule} />
          {totals}
          {doc.store.footer ? (
            <>
              <View style={styles.rule} />
              <Text style={styles.center}>{doc.store.footer}</Text>
            </>
          ) : null}
        </Page>
      </Document>
    );
  }

  return (
    <Document title={doc.invoiceNo}>
      <Page size="A4" style={styles.a4}>
        <View style={[styles.row, { marginBottom: 16 }]}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            {logo ? (
              <PdfImage
                src={logo}
                style={{ height: 40, width: 120, objectFit: "contain", marginBottom: 6 }}
              />
            ) : null}
            <Text style={[styles.bold, { fontSize: 13 }]}>{doc.store.name}</Text>
            {storeLines.map((text, index) => (
              <Text key={index}>{text}</Text>
            ))}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.bold, { fontSize: 18 }]}>{labels.invoice.toUpperCase()}</Text>
            {doc.voided ? <Text style={styles.bold}>{labels.voided}</Text> : null}
            <Text>{`${labels.number} ${doc.invoiceNo}`}</Text>
            <Text>{`${labels.date} ${doc.issuedAtText}`}</Text>
            <Text>{`${labels.cashier} ${doc.cashierName}`}</Text>
          </View>
        </View>
        <View style={styles.tableHead} fixed>
          <Text style={[styles.colItem, styles.bold]}>{labels.item}</Text>
          <Text style={[styles.colQty, styles.bold]}>{labels.qty}</Text>
          <Text style={[styles.colNumber, styles.bold]}>{labels.price}</Text>
          <Text style={[styles.colNumber, styles.bold]}>{labels.discount}</Text>
          <Text style={[styles.colNumber, styles.bold]}>{labels.amount}</Text>
        </View>
        {doc.items.map((item, index) => (
          <View key={index} style={styles.tableRow} wrap={false}>
            <Text style={styles.colItem}>{item.name}</Text>
            <Text style={styles.colQty}>{String(item.qty)}</Text>
            <Text style={styles.colNumber}>{money(item.unitPrice)}</Text>
            <Text style={styles.colNumber}>{item.discount > 0 ? minus(item.discount) : ""}</Text>
            <Text style={styles.colNumber}>{money(item.total)}</Text>
          </View>
        ))}
        <View style={styles.totals} wrap={false}>
          {totals}
        </View>
        {doc.store.footer ? (
          <Text style={[styles.center, { marginTop: 24 }]}>{doc.store.footer}</Text>
        ) : null}
      </Page>
    </Document>
  );
}

/**
 * Renders the invoice PDF on demand; nothing is stored (FR-PDF-01). Cash
 * tendered and change are never included because they are not persisted
 * (FR-INV-04).
 */
export async function renderInvoicePdf(
  doc: InvoiceDocument,
  labels: InvoiceLabels,
  size: InvoiceSize,
): Promise<Buffer> {
  const logo = await logoData(doc.store.printLogo);
  return renderToBuffer(<InvoicePdf doc={doc} labels={labels} size={size} logo={logo} />);
}

/** `Content-Disposition` for a download named after the invoice (FR-PDF-02). */
export function pdfDisposition(invoiceNo: string): string {
  const safe = invoiceNo.replace(/[^\w.-]+/g, "-");
  return `attachment; filename="${safe}.pdf"`;
}
