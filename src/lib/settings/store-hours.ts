import { type SettingValue, type Weekday, weekdays } from "./schemas";

type StoreHours = SettingValue<"store.hours">;

export interface StoreHoursState {
  open: boolean;
  weekday: Weekday;
  /** Today's hours, or null when the store is closed all day. */
  today: { open: string; close: string } | null;
}

/** Store-local weekday and `HH:MM` of an instant (FR-UI-11). */
function localClock(now: Date, timeZone: string): { weekday: Weekday; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const weekday = part("weekday").toLowerCase().slice(0, 3) as Weekday;
  return { weekday, time: `${part("hour")}:${part("minute")}` };
}

/**
 * Whether the store is open at `now` in its time zone (FR-SET-09). Opening
 * is inclusive and closing exclusive, so 08:00–21:00 accepts 20:59 but not
 * 21:00. With the schedule turned off the store is always open.
 */
export function storeHoursState(hours: StoreHours, now: Date, timeZone: string): StoreHoursState {
  const { weekday, time } = localClock(now, timeZone);
  const day = hours.days[weekdays.indexOf(weekday)];
  const today = day && !day.closed ? { open: day.open, close: day.close } : null;
  if (!hours.enabled) return { open: true, weekday, today };
  const open = today !== null && time >= today.open && time < today.close;
  return { open, weekday, today };
}
