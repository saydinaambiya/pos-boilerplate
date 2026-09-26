import "server-only";

import { appConfig } from "@/config/app.config";
import { env } from "@/config/env";
import type { Locale } from "@/config/locales";
import { getSale, getSaleForVerifiedLink } from "@/features/checkout/service";
import type { Session } from "@/lib/auth/session";
import { translatorFor } from "@/lib/i18n/translator";
import { variantLabel } from "@/lib/format/variant-label";
import { signToken, verifyToken } from "@/lib/security/signed-token";
import { basisPointsToPercent } from "@/lib/settings/rates";
import { readSetting } from "@/lib/settings/store";

import type { InvoiceDocument, InvoiceLabels } from "./types";

type SaleDetail = NonNullable<Awaited<ReturnType<typeof getSaleForVerifiedLink>>>;

const LINK_PURPOSE = "invoice-download";
export const INVOICE_LINK_DAYS = 7;

async function buildDocument(sale: SaleDetail, locale: Locale): Promise<InvoiceDocument> {
  const [profile, operations] = await Promise.all([
    readSetting("store.profile"),
    readSetting("operations"),
  ]);
  const t = translatorFor(locale, "Invoice");
  const ppnCharged = sale.ppnRateBps > 0;
  return {
    locale,
    store: {
      name: appConfig.brand.storeName,
      address: profile.address,
      phone: profile.phone,
      email: profile.email,
      npwp: ppnCharged ? profile.npwp : "",
      footer: locale === "en" ? profile.invoiceFooterEn : profile.invoiceFooterId,
      printLogo: appConfig.brand.logo.print,
    },
    invoiceNo: sale.invoiceNo,
    issuedAt: sale.createdAt,
    issuedAtText: new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: operations.timeZone,
    }).format(sale.createdAt),
    cashierName: sale.cashierName,
    voided: sale.status === "VOIDED",
    items: sale.items.map((item) => ({
      name: variantLabel(item.nameSnapshot, item.variantSnapshot),
      qty: item.qty,
      unitPrice: item.unitPrice,
      discount: item.discountAmount,
      total: item.lineTotal,
    })),
    subtotal: sale.subtotal,
    itemDiscountTotal: sale.itemDiscountTotal,
    voucherDiscount: sale.voucherDiscount,
    voucherCode: sale.voucherCode,
    service:
      sale.serviceAmount > 0 ? { rateBps: sale.serviceRateBps, amount: sale.serviceAmount } : null,
    ppn: ppnCharged
      ? { rateBps: sale.ppnRateBps, amount: sale.ppnAmount, included: sale.priceIncludesTax }
      : null,
    grandTotal: sale.grandTotal,
    payments: sale.payments.map((payment) => ({
      method: payment.method,
      label:
        payment.method === "TRANSFER" && payment.bankName
          ? t("transferTo", { bank: payment.bankName })
          : t(`methods.${payment.method}`),
      amount: payment.amount,
    })),
  };
}

/** Invoice for a signed-in viewer allowed to see the sale (NFR-SEC-07). */
export async function getInvoiceDocument(session: Session, saleId: string, locale: Locale) {
  const sale = await getSale(session, saleId);
  return sale ? buildDocument(sale, locale) : undefined;
}

/** Labels in the chosen print language, with rates filled in (FR-INV-05). */
export function invoiceLabels(locale: Locale, document: InvoiceDocument): InvoiceLabels {
  const t = translatorFor(locale, "Invoice");
  const rate = (bps: number) => `${basisPointsToPercent(bps)}%`;
  return {
    invoice: t("invoice"),
    number: t("number"),
    date: t("date"),
    cashier: t("cashier"),
    item: t("item"),
    qty: t("qty"),
    price: t("price"),
    discount: t("discount"),
    amount: t("amount"),
    subtotal: t("subtotal"),
    itemDiscounts: t("itemDiscounts"),
    voucher: t("voucher"),
    service: t("service", { rate: rate(document.service?.rateBps ?? 0) }),
    ppn: t("ppn", { rate: rate(document.ppn?.rateBps ?? 0) }),
    ppnIncluded: t("ppnIncluded", { rate: rate(document.ppn?.rateBps ?? 0) }),
    total: t("total"),
    payments: t("payments"),
    cashReceived: t("cashReceived"),
    change: t("change"),
    npwp: t("npwp"),
    voided: t("voided"),
  };
}

/**
 * Signed, stateless download link valid for seven days (FR-PDF-04). Only
 * someone who may see the sale can mint one.
 */
export async function createInvoiceLink(session: Session, saleId: string, now = new Date()) {
  const sale = await getSale(session, saleId);
  if (!sale) return undefined;
  const expiresAt = new Date(now.getTime() + INVOICE_LINK_DAYS * 24 * 60 * 60 * 1000);
  return { token: signToken(env.INVOICE_LINK_SECRET, LINK_PURPOSE, sale.id, expiresAt), expiresAt };
}

/** Resolves a public link to exactly one invoice, or nothing (FR-PDF-05). */
export async function getInvoiceDocumentByToken(token: string, locale: Locale, now = new Date()) {
  const saleId = verifyToken(env.INVOICE_LINK_SECRET, LINK_PURPOSE, token, now);
  if (!saleId || !/^[0-9a-f-]{36}$/.test(saleId)) return undefined;
  const sale = await getSaleForVerifiedLink(saleId);
  return sale ? buildDocument(sale, locale) : undefined;
}
