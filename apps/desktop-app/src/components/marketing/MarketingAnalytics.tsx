import { useEffect, useRef, useState } from "react";
import type { MarketingAnalyticsRangeInput, MarketingAnalyticsSnapshot } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { AnalyticsMetricList, analyticsAvailabilityLabels } from "./MarketingAnalyticsMetrics";

const campaignStatuses = {draft:"Taslak",prepared:"Hazırlandı",running:"Gönderim sürüyor",paused:"Duraklatıldı",cancelled:"İptal edildi",completed:"Tamamlandı"};
const publicationStatuses = {draft:"Taslak",publishing:"Yayın onayı bekleniyor",published:"Yayınlandı",unpublished:"Kaldırıldı",failed:"Başarısız"};
const channelNames = { website: "Website", whatsapp: "WhatsApp", sms: "SMS", instagram: "Instagram" };
function count(value: number | null) { return value === null ? "—" : value.toLocaleString("tr-TR"); }
function rate(value: number | null) { return value === null ? "—" : `${(value * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`; }
function AnalyticsTrends({ data }: { data: MarketingAnalyticsSnapshot }) {
  const max = Math.max(1, ...data.trends.flatMap(t => [t.accepted ?? 0, t.failed ?? 0, t.published ?? 0]));
  const width = Math.max(420, data.trends.length * 8);
  return <section aria-label="Analitik trendleri"><h3>Sonuç trendi</h3>
    <p className="muted">Hazırlanan alıcının / oluşturulan yayının gününe göre güncel sonuçlar. Günlük gönderim olay sayısı değildir.</p>
    {data.trends.every(t=>t.accepted===null && t.failed===null && t.published===null) && <p>Bu aralıkta henüz trend verisi yok.</p>}
    <figure className="marketing-analytics-chart"><figcaption>Kabul edilen · Başarısız · Yayınlanan</figcaption>
      <svg viewBox={`0 0 ${width} 120`} aria-hidden="true" focusable="false">{data.trends.map((t, i) => <g key={t.date}>{(["accepted", "failed", "published"] as const).map((key, j) => t[key] === null ? null : <rect key={key} className={`marketing-analytics-bar-${key}`} x={i * width / data.trends.length + j * 2} y={110 - t[key] / max * 100} width={2} height={t[key] / max * 100}/>)}</g>)}</svg>
    </figure>
    <details><summary>Günlük değerleri tablo olarak göster</summary><div className="marketing-analytics-table"><table><caption>Hazırlama / oluşturma gününe göre sonuçlar</caption><thead><tr><th scope="col">Tarih</th><th scope="col">Kabul</th><th scope="col">Başarısız</th><th scope="col">Yayınlanan</th></tr></thead><tbody>{data.trends.map(t => <tr key={t.date}><th scope="row">{t.date}</th><td>{count(t.accepted)}</td><td>{count(t.failed)}</td><td>{count(t.published)}</td></tr>)}</tbody></table></div></details>
    <h3>Kanal sonuçları</h3><div className="marketing-analytics-table"><table><caption>Kanal bazında doğrulanmış kabul / yayın</caption><thead><tr><th scope="col">Kanal</th><th scope="col">Kabul</th><th scope="col">Teslim</th><th scope="col">Yayın</th></tr></thead><tbody>{data.channels.map(c => <tr key={c.channel}><th scope="row">{channelNames[c.channel]}</th>{(["accepted", "delivered", "published"] as const).map(name => <td key={name}>{count(c.metrics.find(m => m.metric === name)?.value ?? null)}</td>)}</tr>)}</tbody></table></div>
  </section>;
}
export function MarketingAnalytics({ range, onRange, onCampaign, onPublication }: { range: MarketingAnalyticsRangeInput; onRange: (range: MarketingAnalyticsRangeInput) => void; onCampaign: (id: string) => void; onPublication: (id: string) => void }) {
  const [data, setData] = useState<MarketingAnalyticsSnapshot | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [refreshVersion, setRefreshVersion] = useState(0);
  const [custom, setCustom] = useState(range.preset === "custom"), [startDate, setStartDate] = useState(range.preset === "custom" ? range.startDate : ""), [endDate, setEndDate] = useState(range.preset === "custom" ? range.endDate : "");
  const epoch = useRef(0), opened = useRef(false);
  useEffect(() => {
    const bridge = window.yardimciDesktop; let active = true;
    async function load() {
      const ticket = ++epoch.current; setBusy(true);
      try {
        if (!bridge?.getMarketingAnalytics) throw new Error();
        const result = await bridge.getMarketingAnalytics(range, !opened.current); opened.current = true;
        if (!active || ticket !== epoch.current) return;
        if (!result.ok) throw new Error(result.message); setData(result.value); setMessage("");
      } catch { if (active && ticket === epoch.current) setMessage("Analitik verisi alınamadı. Tarih aralığını kontrol edip yeniden deneyin."); }
      finally { if (active && ticket === epoch.current) setBusy(false); }
    }
    void load();
    const campaign = bridge?.onMessagingCampaignsChanged?.(() => void load()), provider = bridge?.onBusinessMessagingChanged?.(() => void load()), schedule = bridge?.onMarketingSchedulesChanged?.(() => void load());
    // Read local canonical records only. External metrics are refreshed explicitly in publication detail.
    return () => { active = false; epoch.current++; campaign?.(); provider?.(); schedule?.(); };
  }, [range, refreshVersion]);
  const summary = data?.summary;
  return <section className="marketing-analytics" aria-label="Pazarlama analitiği" aria-busy={busy}>
    <div className="marketing-actions"><h2>Analitik</h2><label className="form-field">Tarih aralığı<select aria-label="Tarih aralığı" value={custom ? "custom" : range.preset} onChange={e => { const preset = e.target.value as MarketingAnalyticsRangeInput["preset"]; setCustom(preset === "custom"); if (preset !== "custom") onRange({ preset }); }}><option value="7d">Son 7 gün</option><option value="30d">Son 30 gün</option><option value="90d">Son 90 gün</option><option value="custom">Özel aralık</option></select></label>
      {custom && <><label className="form-field">Başlangıç tarihi<input aria-label="Başlangıç tarihi" type="date" lang="tr-TR" value={startDate} onChange={e => setStartDate(e.target.value)}/></label><label className="form-field">Bitiş tarihi<input aria-label="Bitiş tarihi" type="date" lang="tr-TR" value={endDate} onChange={e => setEndDate(e.target.value)}/></label><ActionButton variant="secondary" disabled={!startDate || !endDate || busy} onClick={() => onRange({ preset: "custom", startDate, endDate })}>Aralığı uygula</ActionButton></>}
      <ActionButton variant="secondary" disabled={busy} onClick={() => setRefreshVersion(v => v + 1)}>Yerel verileri yenile</ActionButton>
    </div>
    {message && <p role="alert">{message}</p>}
    {!data && !message && <p role="status">Analitik yükleniyor…</p>}
    {data && summary && <>
      <p className="muted">{data.range.startDate} – {data.range.endDate} · {data.range.timezone}. Hazırlanan alıcılar ve oluşturulan kampanya/yayınlar bu aralığa göre seçilir. Sonuçlar güncel yerel durumdur. Aktif Website yayınları şu anki onaylı durumu gösterir.</p>
      <p className="muted">— veri mevcut değil; 0 ölçülmüş sıfırdır. Toplamlar mevcut sinyalleri içerir. Kabul, teslim ve okunma birbirinden ayrıdır.</p>
      <dl className="campaign-counts marketing-analytics-summary" aria-label="Analitik genel özet">{([["Aktif kampanya", summary.activeCampaigns], ["Bitmiş kampanya", summary.completedCampaigns], ["Kabul edilen", summary.accepted], ["Teslim edilen", summary.delivered], ["Okunan", summary.read], ["Başarısız", summary.failed], ["Yayınlanan içerik", summary.published]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{count(value)}</dd>{value === null && <small>Henüz veri yok</small>}</div>)}</dl>
      <div className="marketing-analytics-channels">{data.channels.map(c => <section className="marketing-editor" aria-label={`${channelNames[c.channel]} analitiği`} key={c.channel}><h3>{channelNames[c.channel]}</h3>
        <p className="muted">{c.serviceState === "ready" ? "Servis yapılandırılmış" : c.serviceState === "unconfigured" ? "Servis yapılandırılmamış" : "Servis kapalı"}</p>
        <AnalyticsMetricList metrics={c.metrics.filter(m => !["audience", "eligible", "prepared", "pending", "read"].includes(m.metric) || m.metric === "read" && c.channel === "whatsapp")} label={`${channelNames[c.channel]} metrikleri`}/>
        {(c.channel === "whatsapp" || c.channel === "sms") && <p>Teslim oranı (teslim / kabul): {rate(c.deliveryRate)}{c.channel === "whatsapp" ? ` · Okunma oranı (okunan / teslim): ${rate(c.readRate)}` : ""}</p>}
        {c.channel === "website" && <p>Ziyaret verisi toplanmıyor.</p>}
        {c.channel === "instagram" && <p>{c.providerCapabilities.some(m => m.availability === "available") ? "Etkileşim ölçümleri yayın ayrıntısında; yayın yaşam süresini kapsar. Erişim farklı yayınlar arasında toplanmaz." : `Etkileşim: ${analyticsAvailabilityLabels[c.serviceState === "ready" ? (c.providerCapabilities.find(m=>["permission_denied","permission_unverified"].includes(m.availability))?.availability ?? c.providerCapabilities[0]?.availability ?? "unsupported") : c.serviceState]}.`}</p>}
      </section>)}</div>
      <AnalyticsTrends data={data}/>
      <section aria-label="Son kampanyalar"><h3>Son kampanyalar</h3><p className="muted">Bu aralıkta oluşturulan kampanyalar · satır sayıları tüm hazırlanan kitleyi kapsar.</p>{!data.recentCampaigns.length && <p>Bu aralıkta henüz kampanya yok.</p>}{data.recentCampaigns.map(c => <div className="campaign-list-row" key={c.id}><span>{channelNames[c.channel]} kampanyası · {new Date(c.createdAt).toLocaleDateString("tr-TR")} · {campaignStatuses[c.status]}</span><span>{count(c.metrics.find(m => m.metric === "accepted")?.value ?? null)} kabul</span><ActionButton variant="secondary" onClick={() => onCampaign(c.id)}>Kampanyayı aç</ActionButton></div>)}</section>
      <section aria-label="Son yayınlar"><h3>Son yayınlar</h3>{!data.recentPublications.length && <p>Bu aralıkta henüz yayın yok.</p>}{data.recentPublications.map(p => <div className="campaign-list-row" key={p.id}><span>{channelNames[p.channel]} yayını · {new Date(p.createdAt).toLocaleDateString("tr-TR")} · {publicationStatuses[p.status]}</span><ActionButton variant="secondary" onClick={() => onPublication(p.id)}>Yayını aç</ActionButton></div>)}</section>
      <small>Yerel okuma: {new Date(data.measuredAt).toLocaleString("tr-TR")}</small>
    </>}
  </section>;
}
