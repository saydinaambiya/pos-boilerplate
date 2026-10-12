import { formatMeters, parseDecimal, parseMetersToCm } from "./length";

/**
 * How a stock row is counted (ADR-0023, ADR-0045): a roll in meters stored
 * as cm, goods sold by weight in kg stored as grams, everything else in
 * whole units (pcs, ml).
 */
export type StockMeasure = "meter" | "kg" | "count";

/** Grams in a kilogram; kg goods keep stock and weights in grams (ADR-0045). */
export const GRAMS_PER_KG = 1000;

export function stockMeasure(item: { isRoll: boolean; unit: string }): StockMeasure {
  if (item.isRoll) return "meter";
  return item.unit === "kg" ? "kg" : "count";
}

/** Weight in kilograms, e.g. `2,5kg`; units go without a space like meters (ADR-0045). */
export function formatKg(grams: number, locale: string): string {
  const value = new Intl.NumberFormat(locale.startsWith("en") ? "en-US" : "id-ID", {
    maximumFractionDigits: 3,
  }).format(grams / GRAMS_PER_KG);
  return `${value}kg`;
}

/** Kilograms typed by the user as whole grams, e.g. "0,25" → 250 (ADR-0045). */
export function parseKgToGrams(input: string): number | null {
  const kg = parseDecimal(input, 3);
  return kg === null ? null : Math.round(kg * GRAMS_PER_KG);
}

/** A stock amount as people read it: `38,5m`, `2,5kg` or `12`. */
export function formatStock(measure: StockMeasure, value: number, locale: string): string {
  if (measure === "meter") return formatMeters(value, locale);
  if (measure === "kg") return formatKg(value, locale);
  return String(value);
}

/** A typed stock amount in stored units: cm, grams or whole units; null when invalid. */
export function parseStock(measure: StockMeasure, input: string): number | null {
  if (measure === "meter") return parseMetersToCm(input);
  if (measure === "kg") return parseKgToGrams(input);
  const text = input.trim();
  return /^\d{1,7}$/.test(text) ? Number(text) : null;
}

/** A stored amount shown in an input in the user's locale, e.g. `2,5` for 2500 g. */
export function stockInputValue(measure: StockMeasure, value: number, locale: string): string {
  const scaled =
    measure === "meter" ? value / 100 : measure === "kg" ? value / GRAMS_PER_KG : value;
  return locale.startsWith("en") ? String(scaled) : String(scaled).replace(".", ",");
}
