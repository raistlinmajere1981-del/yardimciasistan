import type { MarketingAnalyticsRange, MarketingAnalyticsRangeInput } from "@yardimci-asistan/shared";
import { resolveScheduleLocal, scheduleLocalTime, scheduleTimezone } from "./schedule-recurrence";
import { MarketingError } from "./validation";

export function analyticsDay(instant: string, timezone: string): string { return scheduleLocalTime(instant, timezone).slice(0, 10); }
export function analyticsDateOffset(date: string, days: number): string { return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
export function resolveAnalyticsRange(input: MarketingAnalyticsRangeInput, now: Date): MarketingAnalyticsRange {
  try {
    if (!input || !["7d", "30d", "90d", "custom"].includes(input.preset)) throw new Error();
    const timezone = scheduleTimezone(input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    const today = analyticsDay(now.toISOString(), timezone);
    const startDate = input.preset === "custom" ? input.startDate : analyticsDateOffset(today, 1 - Number(input.preset.slice(0, -1)));
    const endDate = input.preset === "custom" ? input.endDate : today;
    const validDate = (date: string) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate || Date.parse(`${endDate}T00:00Z`) - Date.parse(`${startDate}T00:00Z`) >= 366 * 86400000) throw new Error();
    return { startDate, endDate, timezone, startAt: resolveScheduleLocal(`${startDate}T00:00`, timezone), endAt: resolveScheduleLocal(`${analyticsDateOffset(endDate, 1)}T00:00`, timezone) };
  } catch { throw new MarketingError("invalid_analytics_range", "Geçerli bir tarih aralığı ve saat dilimi seçin (en fazla 366 gün)."); }
}
