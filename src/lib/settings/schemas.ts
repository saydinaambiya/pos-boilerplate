import { z } from "zod";

import { operationalDefaults } from "@/config/operational-defaults";
import { plainText } from "@/lib/validation/text";

/** Store time zones offered in settings (Indonesia: WIB, WITA, WIT). */
export const storeTimeZones = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] as const;

export const paperSizes = ["58mm", "80mm", "a4"] as const;

const optional = <T extends z.ZodType>(schema: T) => z.union([z.literal(""), schema]);

/** Store profile shown on invoices (FR-SET-01). Empty strings mean "not set". */
export const storeProfileSchema = z
  .object({
    address: plainText(200, 0),
    phone: optional(z.string().regex(/^\+[1-9]\d{7,14}$/)),
    email: optional(z.email().max(254)),
    npwp: optional(z.string().regex(/^\d{16}$/)),
    invoiceFooterId: plainText(120, 0),
    invoiceFooterEn: plainText(120, 0),
  })
  .strict();

const rate = z.int().min(0).max(10_000);

/** Tax and service charge (FR-SET-04); rates in basis points. */
export const taxSchema = z
  .object({
    ppnEnabled: z.boolean(),
    ppnRateBps: rate,
    serviceEnabled: z.boolean(),
    serviceRateBps: rate,
    priceIncludesTax: z.boolean(),
  })
  .strict()
  .refine((value) => !value.ppnEnabled || value.ppnRateBps > 0, {
    path: ["ppnRateBps"],
    error: "required",
  })
  .refine((value) => !value.serviceEnabled || value.serviceRateBps > 0, {
    path: ["serviceRateBps"],
    error: "required",
  });

/** Operational settings (FR-SET-07, FR-AUTH-05, FR-UI-11, BR-18). */
export const operationsSchema = z
  .object({
    timeZone: z.enum(storeTimeZones),
    invoicePrefix: z.string().regex(/^[A-Z0-9-]{1,10}$/),
    invoiceSequenceDigits: z.int().min(3).max(6),
    paperSize: z.enum(paperSizes),
    allowNegativeStock: z.boolean(),
    heldOrderHours: z.int().min(1).max(720),
    housekeepingRetentionMonths: z.int().min(1).max(60),
    sessionIdleMinutes: z.int().min(15).max(1440),
    /** Devices one account may be signed in on at the same time (FR-AUTH-09). */
    maxDevicesPerUser: z.int().min(1).max(10),
  })
  .strict();

/** Days of the store week, Monday first (FR-SET-09). */
export const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof weekdays)[number];

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Opening hours of one day; `closed` keeps the times so the form remembers them. */
const dayHoursSchema = z
  .object({ closed: z.boolean(), open: clockTime, close: clockTime })
  .strict()
  .refine((day) => day.closed || day.close > day.open, { path: ["close"], error: "after-open" });

/**
 * Store opening hours (FR-SET-09, BR-24): outside them employees cannot use
 * the POS; the Owner always can. Off until the owner turns it on.
 */
export const storeHoursSchema = z
  .object({
    enabled: z.boolean(),
    days: z.tuple([
      dayHoursSchema,
      dayHoursSchema,
      dayHoursSchema,
      dayHoursSchema,
      dayHoursSchema,
      dayHoursSchema,
      dayHoursSchema,
    ]),
  })
  .strict();

const defaultDay = { closed: false, open: "08:00", close: "21:00" };

/**
 * Every settings key with its schema and default. Defaults apply until the
 * owner saves the section, so a fresh install works without seeding.
 */
export const settingDefinitions = {
  "store.profile": {
    schema: storeProfileSchema,
    defaults: {
      address: "",
      phone: "",
      email: "",
      npwp: "",
      invoiceFooterId: "",
      invoiceFooterEn: "",
    },
  },
  tax: {
    schema: taxSchema,
    defaults: {
      ppnEnabled: false,
      ppnRateBps: 0,
      serviceEnabled: false,
      serviceRateBps: 0,
      priceIncludesTax: false,
    },
  },
  operations: {
    schema: operationsSchema,
    defaults: {
      timeZone: operationalDefaults.timeZone,
      invoicePrefix: "INV-",
      invoiceSequenceDigits: 4,
      paperSize: "80mm",
      allowNegativeStock: false,
      heldOrderHours: 48,
      housekeepingRetentionMonths: 12,
      sessionIdleMinutes: 8 * 60,
      maxDevicesPerUser: 3,
    },
  },
  "store.hours": {
    schema: storeHoursSchema,
    defaults: {
      enabled: false,
      days: [defaultDay, defaultDay, defaultDay, defaultDay, defaultDay, defaultDay, defaultDay],
    },
  },
} as const satisfies Record<string, { schema: z.ZodType; defaults: unknown }>;

export type SettingKey = keyof typeof settingDefinitions;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingDefinitions)[K]["schema"]>;

/** Example invoice number for the operations form, e.g. `INV-20260926-0001`. */
export function sampleInvoiceNumber(prefix: string, digits: number, date: string): string {
  return `${prefix}${date}-${"1".padStart(digits, "0")}`;
}
