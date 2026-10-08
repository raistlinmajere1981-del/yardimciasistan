import type { MarketingRecurrenceRule, MarketingScheduleInput } from "@yardimci-asistan/shared";
import { MarketingError } from "./validation";
const DAY = 86400000;
const formatters = new Map<string, Intl.DateTimeFormat>();
export function scheduleTimezone(value: unknown): string {
  if (typeof value !== "string" || value.length > 100 || !value || /^[+-]/.test(value)) invalid();
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; } catch { return invalid(); }
}
function invalid(): never { throw new MarketingError("invalid_schedule", "Planın tarih, saat, saat dilimi ve tekrar alanlarını kontrol edin."); }
function formatter(timezone: string) {
  let f = formatters.get(timezone);
  if (!f) { f = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23" }); if (formatters.size >= 64) formatters.clear(); formatters.set(timezone,f); }
  return f;
}
function wall(instant: number, timezone: string): number {
  const parts = Object.fromEntries(formatter(timezone).formatToParts(instant).map(p => [p.type,p.value]));
  return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
}
export function scheduleLocalTime(instant: string, timezone: string): string { return new Date(wall(Date.parse(instant),timezone)).toISOString().slice(0,16); }
/** Compatible DST: first instant in folds, shift by the gap in nonexistent local times. */
export function resolveScheduleLocal(local: string, timezone: string): string {
  if (typeof local !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) invalid();
  const desired = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(desired) || new Date(desired).toISOString().slice(0,16) !== local || desired < Date.UTC(2000,0,1) || desired >= Date.UTC(2200,0,1)) invalid();
  const offsets = new Set([-2,-1,0,1,2].map(d => { const t=desired+d*DAY; return wall(t,timezone)-t; }));
  const candidates = [...offsets].map(o => desired-o).sort((a,b)=>a-b);
  const exact = candidates.find(t => wall(t,timezone) === desired);
  const shifted = candidates.filter(t=>wall(t,timezone)>desired).sort((a,b)=>(wall(a,timezone)-desired)-(wall(b,timezone)-desired))[0];
  if (exact === undefined && shifted === undefined) invalid();
  const next = exact ?? shifted;
  if (next === undefined) invalid();
  return new Date(next).toISOString();
}
export function validateScheduleTiming(input: MarketingScheduleInput) {
  const timezone = scheduleTimezone(input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const startsAt = resolveScheduleLocal(input.startsLocal,timezone);
  if (!["once","recurring"].includes(input.scheduleType) || !["run_once_when_resumed","skip"].includes(input.missedRunPolicy)) invalid();
  if (input.scheduleType === "once") { if (input.recurrenceRule !== undefined) invalid(); return {timezone,startsAt}; }
  const r = input.recurrenceRule;
  if (!r || !["daily","weekly","monthly"].includes(r.frequency) || !Number.isSafeInteger(r.interval) || r.interval<1 || r.interval>365 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.localTime)) invalid();
  const allowed = ["frequency","interval","localTime",...(r.frequency==="weekly"?["weekdays"]:r.frequency==="monthly"?["dayOfMonth"]:[])];
  if (Object.keys(r).some(k=>!allowed.includes(k))) invalid();
  if (r.frequency === "weekly" && (!Array.isArray(r.weekdays) || !r.weekdays.length || r.weekdays.length>7 || new Set(r.weekdays).size!==r.weekdays.length || r.weekdays.some(d=>!Number.isInteger(d)||d<1||d>7))) invalid();
  if (r.frequency === "monthly" && (!Number.isInteger(r.dayOfMonth) || r.dayOfMonth<1 || r.dayOfMonth>31)) invalid();
  // startsAt is a lower bound/anchor; the first run must match the rule as well.
  return {timezone,startsAt,recurrenceRule:r};
}
/** Seek near the requested wall date rather than enumerating a missed backlog. */
export function nextScheduleOccurrence(startsAt: string, timezone: string, rule: MarketingRecurrenceRule | undefined, after: string): string {
  const start = Date.parse(startsAt), threshold = Date.parse(after);
  if (!rule) return start > threshold ? startsAt : "";
  const anchor = new Date(wall(start,timezone)), current = new Date(wall(Math.max(start,threshold),timezone));
  const anchorDay = Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth(),anchor.getUTCDate());
  let day = Date.UTC(current.getUTCFullYear(),current.getUTCMonth(),current.getUTCDate());
  const anchorMonth = anchor.getUTCFullYear()*12+anchor.getUTCMonth();
  // A 365-month interval is the widest permitted rule. Bound the search and fail closed.
  for (let i=0;i<11350;i++,day+=DAY) {
    if(new Date(day).getUTCFullYear()>=2200)return "";
    const date = new Date(day), days = Math.round((day-anchorDay)/DAY), weekday = date.getUTCDay() || 7;
    const months = date.getUTCFullYear()*12+date.getUTCMonth()-anchorMonth;
    const matches = rule.frequency === "daily" ? days>=0 && days%rule.interval===0
      : rule.frequency === "weekly" ? Math.floor((days+(anchor.getUTCDay()||7)-1)/7)%rule.interval===0 && rule.weekdays.includes(weekday)
      : months>=0 && months%rule.interval===0 && date.getUTCDate()===Math.min(rule.dayOfMonth,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate());
    if (!matches) continue;
    const instant = resolveScheduleLocal(`${date.toISOString().slice(0,10)}T${rule.localTime}`,timezone);
    if (Date.parse(instant)>=start && Date.parse(instant)>threshold) return instant;
  }
  throw new MarketingError("recurrence_out_of_range","Sonraki plan tarihi hesaplanamadı.");
}
