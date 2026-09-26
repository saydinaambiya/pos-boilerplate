/** Paper formats (PRD §6.1). */
export const invoiceSizes = ["58mm", "80mm", "a4"] as const;
export type InvoiceSize = (typeof invoiceSizes)[number];

export function isInvoiceSize(value: unknown): value is InvoiceSize {
  return typeof value === "string" && (invoiceSizes as readonly string[]).includes(value);
}

/**
 * Everything an invoice shows (FR-INV-04), already resolved for one locale.
 * Shared by the print view and the PDF so both always agree.
 */
export interface InvoiceDocument {
  locale: string;
  store: {
    name: string;
    address: string;
    phone: string;
    email: string;
    /** Only when PPN was charged (FR-SET-01). */
    npwp: string;
    footer: string;
    printLogo: string | null;
  };
  invoiceNo: string;
  issuedAt: Date;
  /** Formatted in the store time zone and the document locale. */
  issuedAtText: string;
  cashierName: string;
  voided: boolean;
  items: { name: string; qty: number; unitPrice: number; discount: number; total: number }[];
  subtotal: number;
  itemDiscountTotal: number;
  voucherDiscount: number;
  voucherCode: string | null;
  service: { rateBps: number; amount: number } | null;
  ppn: { rateBps: number; amount: number; included: boolean } | null;
  grandTotal: number;
  payments: { label: string; amount: number; method: string }[];
  /** Store credit on this sale with its current balance (FR-INV-04). */
  kasbon: { customerName: string; balance: number } | null;
}

/** Translated labels; resolved on the server for the locale chosen at print time (FR-INV-05). */
export interface InvoiceLabels {
  invoice: string;
  number: string;
  date: string;
  cashier: string;
  item: string;
  qty: string;
  price: string;
  discount: string;
  amount: string;
  subtotal: string;
  itemDiscounts: string;
  voucher: string;
  service: string;
  ppn: string;
  ppnIncluded: string;
  total: string;
  payments: string;
  cashReceived: string;
  change: string;
  customer: string;
  kasbonBalance: string;
  npwp: string;
  voided: string;
}
