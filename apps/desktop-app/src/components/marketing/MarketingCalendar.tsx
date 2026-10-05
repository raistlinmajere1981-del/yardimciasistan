import { useState } from "react";
import type { MarketingScheduleDetail, MarketingScheduleSnapshot, MarketingChannelRegistry } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { executionStatuses, scheduleStatuses, scheduleLocal, scheduleDate } from "./MarketingScheduleWorkspace";
export function MarketingCalendar({snapshot,channels,month,onMonth,onOpen}:{snapshot:MarketingScheduleSnapshot|null;channels:MarketingChannelRegistry;month:string;onMonth:(m:string)=>void;onOpen:(d:MarketingScheduleDetail)=>void}) {
  const [mode,setMode]=useState<"month"|"list">("list"),[filter,setFilter]=useState("all");
  const timezone=snapshot?.defaultTimezone??Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rows=snapshot?.schedules.filter(d=>filter==="recurring"?d.schedule.scheduleType==="recurring":filter==="all"?true:d.schedule.status===filter)??[];
  const date=new Date(`${month}-01T00:00:00Z`),days=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate(),offset=(date.getUTCDay()+6)%7;
  function move(delta:number){const d=new Date(date);d.setUTCMonth(d.getUTCMonth()+delta);onMonth(d.toISOString().slice(0,7));}
  function summary(detail:MarketingScheduleDetail,instant=detail.schedule.nextRunAt) {const s=detail.schedule;return <><strong>{s.name}</strong><span>{channels.find(c=>c.id===s.channel)?.displayName} · {scheduleDate(instant,s.timezone)} · {s.timezone}</span><small>{s.scheduleType==="recurring"?"Tekrarlı · ":""}{scheduleStatuses[s.status]}</small></>;}
  return <section className="marketing-calendar" aria-label="Pazarlama takvimi">
    <div className="marketing-actions"><h2>Takvim</h2><ActionButton variant={mode==="month"?"primary":"secondary"} aria-pressed={mode==="month"} onClick={()=>setMode("month")}>Ay</ActionButton><ActionButton variant={mode==="list"?"primary":"secondary"} aria-pressed={mode==="list"} onClick={()=>setMode("list")}>Liste / Yaklaşan</ActionButton>
      <label>Plan filtresi<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tüm planlar</option><option value="active">Aktif</option><option value="paused">Duraklatılmış</option><option value="recurring">Otomasyonlar · Tekrarlı</option><option value="completed">Tamamlanmış</option><option value="cancelled">İptal edilmiş</option></select></label>
    </div>
    {!rows.length && <p>Henüz bu görünümde plan yok. Yayın veya hazırlanmış kampanya üzerinden Planla’yı seçin.</p>}
    {mode==="list"?<div className="marketing-list" aria-label="Yaklaşan planlar">{rows.map(d=><button key={d.schedule.id} onClick={()=>onOpen(d)}>{summary(d)}<small>Son çalışma: {scheduleDate(d.schedule.lastRunAt,d.schedule.timezone)} · {d.executions[0]?executionStatuses[d.executions[0].status]:"Henüz çalışmadı"}</small></button>)}</div>:<>
      <div className="marketing-actions"><label>Takvim ayı<input type="month" value={month} onChange={e=>{if(e.target.value)onMonth(e.target.value);}}/></label><ActionButton variant="secondary" aria-label="Önceki ay" onClick={()=>move(-1)}>‹</ActionButton><h3>{date.toLocaleDateString("tr-TR",{timeZone:"UTC",month:"long",year:"numeric"})}</h3><ActionButton variant="secondary" aria-label="Sonraki ay" onClick={()=>move(1)}>›</ActionButton><span>Takvim saat dilimi: {timezone}</span></div>
      <div className="marketing-calendar-grid" aria-label="Ay takvimi">{["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"].map(d=><strong key={d}>{d}</strong>)}{Array.from({length:offset},(_,i)=><div key={`blank${i}`}/>)}{Array.from({length:days},(_,i)=>{
        const key=`${month}-${String(i+1).padStart(2,"0")}`;
        const events=rows.flatMap(d=>[...snapshot!.occurrences.filter(o=>o.scheduleId===d.schedule.id).map(o=>({instant:o.plannedAt,detail:d})),...d.executions.map(e=>({instant:e.plannedAt,detail:d}))]).filter(e=>scheduleLocal(e.instant,timezone).slice(0,10)===key);
        return <div className="marketing-calendar-day" key={key}><time dateTime={key}>{i+1}</time>{events.map(e=><button key={`${e.detail.schedule.id}:${e.instant}`} onClick={()=>onOpen(e.detail)}>{summary(e.detail,e.instant)}</button>)}</div>;
      })}</div>
    </>}
  </section>;
}
