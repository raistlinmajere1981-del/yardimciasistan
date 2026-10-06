import { useEffect, useRef, useState } from "react";
import type { MessagingAudienceCounts, MessagingSegment, MessagingSegmentRule, SaveMessagingSegmentInput } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { SearchSelect } from "../ui/SearchSelect";
import { resultValue } from "./share-draft";

export function MarketingAudience({value, channels, onChange, onBusy}: {value: string; channels: Array<"sms" | "whatsapp">; onChange: (id: string, name: string) => void; onBusy: (busy: boolean) => void}) {
  const [audiences, setAudiences] = useState<MessagingSegment[]>([]);
  const [draft, setDraft] = useState<SaveMessagingSegmentInput>({name: "", description: "", filterDefinition: {version: 1, rules: []}});
  const [preview, setPreview] = useState<Array<{channel: string; counts: MessagingAudienceCounts}>>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const epoch = useRef(0), active = useRef(true), working = useRef(false);
  useEffect(() => {active.current = true; void window.yardimciDesktop!.listMessagingSegments().then(r => {if (active.current) setAudiences(resultValue(r));}).catch(e => {if(active.current) setError(e.message);}); return () => {active.current = false; epoch.current++;};}, []);
  const update = (field: MessagingSegmentRule["field"], value: string) => {
    const rules = draft.filterDefinition.rules.filter(r => r.field !== field);
    if (value) rules.push(field === "phone" ? {field, operator: value as "present" | "absent"} : {field, operator: "eq", value} as MessagingSegmentRule);
    setDraft({...draft, filterDefinition: {version: 1, rules}});
  };
  const fieldValue = (field: MessagingSegmentRule["field"]) => {const r = draft.filterDefinition.rules.find(r => r.field === field); return r ? r.field === "phone" ? r.operator : r.value : "";};
  async function run(work: () => Promise<void>) {if(working.current)return; working.current = true; setBusy(true); onBusy(true); setError("");try {await work();} catch(e) {if(active.current) setError(e instanceof Error ? e.message : "Hedef kitle işlemi tamamlanamadı.");} finally {working.current = false; if(active.current) {setBusy(false); onBusy(false);}}}
  return <section className="form-stack" aria-label="Hedef kitle seçimi">
    <p>WhatsApp ve SMS paylaşımlarını kimlerin alacağını seçin. Yalnız gönderim izni olan, geçerli telefonu bulunan müşteriler gönderime alınır.</p>
    <label className="form-field form-field--fluid">Kayıtlı hedef kitle<SearchSelect ariaLabel="Kayıtlı hedef kitle" value={value} options={audiences.map(a => ({id: a.id, label: a.name, description: a.description}))} placeholder="Hedef kitle seçin" disabled={busy} onChange={id => {epoch.current++; setPreview([]); onChange(id, audiences.find(a => a.id === id)?.name || "");}}/></label>
    <ActionButton variant="secondary" disabled={busy || !value} onClick={() => void run(async () => {
      const ticket = ++epoch.current;
      const values = await Promise.all(channels.map(async channel => ({channel, counts: resultValue(await window.yardimciDesktop!.previewMessagingSegment(value, channel))})));
      if(ticket === epoch.current) setPreview(values);
    })}>Uygun alıcıları kontrol et</ActionButton>
    <div className="marketing-audience-preview" aria-label="Hedef kitle önizlemesi">
      {!preview.length && <p>Kontrol sonucunda uygun alıcı sayıları burada görünür.</p>}
      {preview.map(({channel, counts}) => <div key={channel}><h3>{channel === "sms" ? "SMS" : "WhatsApp"}</h3><dl className="marketing-counts">
        <div><dt>Toplam</dt><dd>{counts.matchedCount}</dd></div><div><dt>Gönderime uygun</dt><dd>{counts.eligibleCount}</dd></div>
        <div><dt>İzni bilinmiyor</dt><dd>{counts.unknownConsentCount}</dd></div><div><dt>İzin vermeyen</dt><dd>{counts.optedOutCount}</dd></div><div><dt>Telefonu geçersiz</dt><dd>{counts.missingRecipientCount}</dd></div>
      </dl></div>)}
    </div>
    <section className="form-stack marketing-section" aria-label="Yeni hedef kitle"><h3>Yeni hedef kitle tanımla</h3>
      <label className="form-field form-field--fluid">Hedef kitle adı<input value={draft.name} disabled={busy} maxLength={120} placeholder="Örneğin: Aktif bayiler" onChange={e => setDraft({...draft, name: e.target.value})}/></label>
      <label className="form-field form-field--fluid">Bayi durumu<select value={fieldValue("dealerStatus")} disabled={busy} onChange={e => update("dealerStatus", e.target.value)}><option value="">Tüm müşteriler</option><option value="candidate">Bayi adayları</option><option value="active">Aktif bayiler</option><option value="inactive">Pasif bayiler</option></select></label>
      <label className="form-field form-field--fluid">Müşterinin kaynağı<select value={fieldValue("source")} disabled={busy} onChange={e => update("source", e.target.value)}><option value="">Tüm kaynaklar</option>{[["manual","Elle eklenen"],["web_form","Web formu"],["web_ai","Web asistanı"],["whatsapp","WhatsApp"],["phone","Telefon"],["android","Android"]].map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="form-field form-field--fluid">Telefon bilgisi<select value={fieldValue("phone")} disabled={busy} onChange={e => update("phone", e.target.value)}><option value="">Fark etmez</option><option value="present">Telefonu olanlar</option><option value="absent">Telefonu olmayanlar</option></select></label>
      <small>Seçtiğiniz koşulların tamamına uyan müşteriler alınır. Koşul seçmezseniz tüm müşteriler değerlendirilir.</small>
      <ActionButton disabled={busy || !draft.name.trim()} onClick={() => void run(async () => {const saved = resultValue(await window.yardimciDesktop!.saveMessagingSegment(draft)); const list = resultValue(await window.yardimciDesktop!.listMessagingSegments()); if(active.current) {setAudiences(list); onChange(saved.id, saved.name); setPreview([]);}})}>Hedef kitleyi kaydet ve seç</ActionButton>
    </section>
    <p role="status">{error}</p>
  </section>;
}
