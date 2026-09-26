import { operationalDefaults } from "@/config/operational-defaults";

const formatters = new Map<string, Intl.NumberFormat>();

/** Formats an integer rupiah amount for display (PRD §5, FR-UI-11). */
export function formatCurrency(amount: number, locale: string): string {
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: operationalDefaults.currency,
      maximumFractionDigits: 0,
    });
    formatters.set(locale, formatter);
  }
  return formatter.format(amount);
}
