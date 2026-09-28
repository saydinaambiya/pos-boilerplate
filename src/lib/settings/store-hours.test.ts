import { describe, expect, it } from "vitest";

import { type SettingValue, settingDefinitions, storeHoursSchema } from "./schemas";
import { storeHoursState } from "./store-hours";

const defaults = settingDefinitions["store.hours"].defaults;
const day = { closed: false, open: "08:00", close: "21:00" };
const hours: SettingValue<"store.hours"> = {
  enabled: true,
  days: [day, day, day, day, day, day, { ...day, closed: true }],
};

describe("storeHoursState (FR-SET-09)", () => {
  it("is open inside the day's hours in the store time zone", () => {
    // Monday 2026-09-28 08:00 WIB = 01:00 UTC
    expect(storeHoursState(hours, new Date("2026-09-28T01:00:00Z"), "Asia/Jakarta")).toEqual({
      open: true,
      weekday: "mon",
      today: { open: "08:00", close: "21:00" },
    });
    // 20:59 WIB
    expect(storeHoursState(hours, new Date("2026-09-28T13:59:00Z"), "Asia/Jakarta").open).toBe(
      true,
    );
  });

  it("is closed before opening, from closing time and on closed days", () => {
    expect(storeHoursState(hours, new Date("2026-09-28T00:59:00Z"), "Asia/Jakarta").open).toBe(
      false,
    );
    expect(storeHoursState(hours, new Date("2026-09-28T14:00:00Z"), "Asia/Jakarta").open).toBe(
      false,
    );
    // Sunday 2026-09-27 12:00 WIB
    expect(storeHoursState(hours, new Date("2026-09-27T05:00:00Z"), "Asia/Jakarta")).toEqual({
      open: false,
      weekday: "sun",
      today: null,
    });
  });

  it("follows the store time zone, not UTC", () => {
    // 2026-09-28 13:30 UTC = 20:30 WIB (open) but 22:30 WIT (closed)
    const instant = new Date("2026-09-28T13:30:00Z");
    expect(storeHoursState(hours, instant, "Asia/Jakarta").open).toBe(true);
    expect(storeHoursState(hours, instant, "Asia/Jayapura").open).toBe(false);
  });

  it("is always open while the schedule is off", () => {
    expect(
      storeHoursState(
        { ...hours, enabled: false },
        new Date("2026-09-27T20:00:00Z"),
        "Asia/Jakarta",
      ).open,
    ).toBe(true);
  });

  it("rejects a closing time that is not after opening", () => {
    const reversed = { closed: false, open: "21:00", close: "08:00" };
    const days = [reversed, day, day, day, day, day, day];
    expect(storeHoursSchema.safeParse({ enabled: true, days }).success).toBe(false);
    days[0] = { ...reversed, closed: true };
    expect(storeHoursSchema.safeParse({ enabled: true, days }).success).toBe(true);
    expect(storeHoursSchema.safeParse(defaults).success).toBe(true);
  });
});
