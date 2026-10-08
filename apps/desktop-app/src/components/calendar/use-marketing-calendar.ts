import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketingScheduleDetail, MarketingScheduleSnapshot } from "@yardimci-asistan/shared";
import { channelNames, resultValue } from "../marketing/share-draft";
import { calendarLocalDateKey } from "./calendar-page-state";

export interface MarketingCalendarEntry {scheduleId: string; date: string; time: string; title: string; meta: string; detail: string; outcome: "active" | "paused" | "completed" | "cancelled" | "pending" | "claimed" | "succeeded" | "skipped" | "failed"}
/** Projection of the existing durable scheduler. No second calendar or timer engine. */
export function useMarketingCalendar(enabled: boolean, dates: string[]) {
  const months = [...new Set(dates.map(d => d.slice(0,7)))].sort().join(",");
  const [snapshot, setSnapshot] = useState<MarketingScheduleSnapshot | null>(null), [message, setMessage] = useState("");
  const epoch = useRef(0), mounted = useRef(true);
  const invalidateCalendarEpoch = useCallback(() => { ++epoch.current; }, []);
  const reload = useCallback(async () => {
    if(!enabled || !window.yardimciDesktop?.getMarketingSchedules)return;
    const ticket = ++epoch.current;
    const snapshots = await Promise.all(months.split(",").map(async month => resultValue(await window.yardimciDesktop!.getMarketingSchedules(month))));
    if(!mounted.current || ticket !== epoch.current)return;
    const first = snapshots[0];
    if (!first) return;
    const occurrences = [...new Map(snapshots.flatMap(s => s.occurrences).map(o => [`${o.scheduleId}:${o.plannedAt}`, o])).values()];
    setSnapshot({...first, occurrences}); setMessage("");
  }, [enabled, months]);
  useEffect(() => {mounted.current = true; if(!enabled) {setSnapshot(null); return;}
    const load = () => void reload().catch(e => {if(mounted.current) setMessage(e instanceof Error ? e.message : "Pazarlama planları alınamadı.");});
    load(); const dispose = window.yardimciDesktop?.onMarketingSchedulesChanged?.(load);
    return () => {mounted.current = false; invalidateCalendarEpoch(); dispose?.();};
  }, [enabled, reload, invalidateCalendarEpoch]);
  const entries = new Map<string, MarketingCalendarEntry>();
  const add = (d: MarketingScheduleDetail, instant: string, outcome: MarketingCalendarEntry["outcome"], error = "") => {
    const date = new Date(instant); if(!Number.isFinite(date.getTime()))return;
    const key = calendarLocalDateKey(date); if(!dates.includes(key))return;
    entries.set(`${d.schedule.id}:${instant}`, {scheduleId: d.schedule.id, date: key, time: date.toLocaleTimeString("tr-TR", {hour: "2-digit", minute: "2-digit"}), title: d.schedule.name,
      meta: `${channelNames[d.schedule.channel]} · ${d.schedule.timezone}${d.schedule.scheduleType === "recurring" ? " · Tekrarlı" : ""}`,
      detail: error ? `İşlem sonucu: ${error}` : d.schedule.targetType === "audience_campaign" ? "Planlanan müşteri gönderimi" : "Planlanan içerik yayını", outcome});
  };
  if(enabled && snapshot) {
    for(const occurrence of snapshot.occurrences) {const d = snapshot.schedules.find(d => d.schedule.id === occurrence.scheduleId); if(d) add(d, occurrence.plannedAt, d.schedule.status);}
    for(const d of snapshot.schedules) {
      if(d.schedule.status === "cancelled" && d.schedule.startsAt) add(d, d.schedule.startsAt, "cancelled");
      for(const e of d.executions) add(d, e.plannedAt, e.status, e.lastError);
    }
  }
  return {entries: [...entries.values()], schedules: snapshot?.schedules || [], message, reload};
}
