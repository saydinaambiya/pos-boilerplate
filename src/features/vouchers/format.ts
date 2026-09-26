import { formatCurrency } from "@/lib/format/currency";
import { basisPointsToPercent } from "@/lib/settings/rates";

/** "10%" or "Rp 5.000" for a voucher's stored value (basis points or rupiah). */
export function voucherValueText(type: "PERCENT" | "FIXED", value: number, locale: string): string {
  return type === "PERCENT" ? `${basisPointsToPercent(value)}%` : formatCurrency(value, locale);
}

/** Store-local `YYYY-MM-DD` for a date input. */
export function dateInput(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(instant);
}

/** Last valid day for an exclusive end instant (stored as the start of the following day). */
export function lastDayInput(exclusiveEnd: Date, timeZone: string): string {
  return dateInput(new Date(exclusiveEnd.getTime() - 1), timeZone);
}
