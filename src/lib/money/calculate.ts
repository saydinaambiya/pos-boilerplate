/**
 * Sale totals (PRD §5). One pure function shared by the POS preview in the
 * browser and the checkout service on the server; the server always
 * recomputes and ignores client totals. All money is integer rupiah, rates
 * are basis points (11 % = 1100). Rounding is half-up to the nearest rupiah
 * at every step that yields a fraction. See ADR-0009 for the inclusive-tax
 * interpretation.
 */

const BPS = 10_000n;

/** `amount × bps / 10000`, half-up, exact for amounts up to Rp 999 billion. */
export function applyRate(amount: number, bps: number): number {
  if (amount < 0 || bps < 0) throw new RangeError("applyRate expects non-negative inputs");
  return Number((BigInt(amount) * BigInt(bps) + BPS / 2n) / BPS);
}

/** `amount × 10000 / (10000 + bps)`, half-up: the pre-tax part of a tax-inclusive amount. */
export function removeRate(amount: number, bps: number): number {
  if (amount < 0 || bps < 0) throw new RangeError("removeRate expects non-negative inputs");
  const divisor = BPS + BigInt(bps);
  return Number((BigInt(amount) * BPS * 2n + divisor) / (divisor * 2n));
}

export type ItemDiscount = { type: "percent"; bps: number } | { type: "amount"; value: number };

export interface CartLine {
  unitPrice: number;
  qty: number;
  discount?: ItemDiscount | null;
}

export interface VoucherRule {
  type: "percent" | "amount";
  /** Basis points for `percent`, rupiah for `amount`. */
  value: number;
  minPurchase?: number | null;
  maxDiscount?: number | null;
}

export interface TaxRules {
  ppnEnabled: boolean;
  ppnRateBps: number;
  serviceEnabled: boolean;
  serviceRateBps: number;
  priceIncludesTax: boolean;
}

export interface LineTotals {
  gross: number;
  discount: number;
  total: number;
}

export interface SaleTotals {
  lines: LineTotals[];
  subtotal: number;
  itemDiscountTotal: number;
  voucherDiscount: number;
  /** Subtotal after the voucher. */
  net: number;
  serviceAmount: number;
  taxBase: number;
  ppnAmount: number;
  grandTotal: number;
}

/**
 * Line total = unit price × qty − discount. Percentage discounts apply to
 * the whole line, not per unit, so rounding happens once (PRD §5). A
 * discount never exceeds the line (BR-08).
 */
export function lineTotals(line: CartLine): LineTotals {
  const gross = line.unitPrice * line.qty;
  let discount = 0;
  if (line.discount?.type === "percent")
    discount = applyRate(gross, Math.min(line.discount.bps, 10_000));
  if (line.discount?.type === "amount") discount = line.discount.value;
  discount = Math.min(Math.max(discount, 0), gross);
  return { gross, discount, total: gross - discount };
}

/**
 * Voucher value for a subtotal: zero below the minimum purchase, capped by
 * the maximum discount and by the subtotal itself (BR-08, BR-09).
 */
export function voucherDiscount(subtotal: number, voucher: VoucherRule | null | undefined): number {
  if (!voucher || subtotal <= 0) return 0;
  if (voucher.minPurchase != null && subtotal < voucher.minPurchase) return 0;
  let discount =
    voucher.type === "percent"
      ? applyRate(subtotal, Math.min(voucher.value, 10_000))
      : voucher.value;
  if (voucher.maxDiscount != null) discount = Math.min(discount, voucher.maxDiscount);
  return Math.min(Math.max(discount, 0), subtotal);
}

export function calculateSale(
  lines: readonly CartLine[],
  tax: TaxRules,
  voucher?: VoucherRule | null,
): SaleTotals {
  const computed = lines.map(lineTotals);
  const subtotal = computed.reduce((sum, line) => sum + line.total, 0);
  const itemDiscountTotal = computed.reduce((sum, line) => sum + line.discount, 0);
  const voucherAmount = voucherDiscount(subtotal, voucher);
  const net = subtotal - voucherAmount;
  const ppnBps = tax.ppnEnabled ? tax.ppnRateBps : 0;
  const serviceBps = tax.serviceEnabled ? tax.serviceRateBps : 0;

  if (tax.ppnEnabled && tax.priceIncludesTax) {
    const preTax = removeRate(net, ppnBps);
    const serviceAmount = applyRate(preTax, serviceBps);
    const ppnOnService = applyRate(serviceAmount, ppnBps);
    return {
      lines: computed,
      subtotal,
      itemDiscountTotal,
      voucherDiscount: voucherAmount,
      net,
      serviceAmount,
      taxBase: preTax + serviceAmount,
      ppnAmount: net - preTax + ppnOnService,
      grandTotal: net + serviceAmount + ppnOnService,
    };
  }

  const serviceAmount = applyRate(net, serviceBps);
  const taxBase = net + serviceAmount;
  const ppnAmount = applyRate(taxBase, ppnBps);
  return {
    lines: computed,
    subtotal,
    itemDiscountTotal,
    voucherDiscount: voucherAmount,
    net,
    serviceAmount,
    taxBase,
    ppnAmount,
    grandTotal: taxBase + ppnAmount,
  };
}
