import { useCallback, useEffect, useRef, useState } from "react";
import { ChartNoAxesCombined, CircleHelp, Globe, Send } from "lucide-react";
import type { MarketingAnalyticsRangeInput, MarketingAnalyticsSnapshot, MarketingMetricName } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { DataListItem } from "../ui/DataList";
import { DatePicker } from "../ui/DateTimePicker";
import { MetricCard } from "../ui/MetricCard";
import { Panel } from "../ui/Panel";
import { StatusBadge } from "../ui/StatusBadge";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { AnalyticsMetricList, analyticsAvailabilityLabels } from "./MarketingAnalyticsMetrics";
import { channelNames } from "./share-draft";

const campaignStatuses = { draft: "Taslak", prepared: "Gönderime hazır", running: "Gönderiliyor", paused: "Duraklatıldı", cancelled: "İptal edildi", completed: "Gönderim işlemi bitti" };
const publicationStatuses = { draft: "Taslak", publishing: "Yayın onayı bekleniyor", published: "Yayınlandı", unpublished: "Kaldırıldı", failed: "Yayınlanamadı" };
const channelMetrics: Record<string, MarketingMetricName[]> = {
  website: ["published", "publishing", "failed"], instagram: ["published", "publishing", "failed"],
  whatsapp: ["accepted", "delivered", "read", "failed"], sms: ["accepted", "delivered", "failed"]
};
function count(value: number | null) { return value === null ? "—" : value.toLocaleString("tr-TR"); }
function date(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }); }

/** Each series has its own scale: publications and messages have different units. */
function AnalyticsTrends({ data, publishing, messaging }: { data: MarketingAnalyticsSnapshot; publishing: string; messaging: string }) {
  const series = [
    { key: "published", label: "Onaylanan yayın", detail: publishing, enabled: Boolean(publishing) },
    { key: "accepted", label: "Gönderilen mesaj", detail: messaging + " · gönderim servisine ulaşan", enabled: Boolean(messaging) }
  ] as const;
  const visibleSeries = series.filter(s => s.enabled);
  return <Panel as="section" className="marketing-analytics-results" aria-label="Zaman içindeki sonuçlar">
    <header><h3>Zaman içindeki sonuçlar</h3><p className="muted">Seçilen günlerde hazırlanan gönderimlerin ve oluşturulan yayınların bugünkü sonuçları.</p></header>
    <div className="marketing-analytics-trends">{visibleSeries.map(({ key, label, detail }) => {
      const observedMaximum = Math.max(0, ...data.trends.map(t => t[key] ?? 0));
      const maximum = Math.max(1, observedMaximum);
      const step = 600 / data.trends.length;
      const available = data.trends.some(t => t[key] !== null);
      return <figure className="marketing-analytics-chart" key={key}>
        <figcaption><strong>{label}</strong><span className="muted">{detail}</span></figcaption>
        {available ? <><div className="marketing-analytics-axis"><small>Günlük en yüksek: {count(observedMaximum)}</small></div>
          <svg viewBox="0 0 600 110" preserveAspectRatio="none" aria-hidden="true" focusable="false">{data.trends.map((t, i) => t[key] === null ? null : <rect key={t.date} className="marketing-analytics-bar" x={i * step + step * .15} y={105 - t[key] / maximum * 100} width={step * .7} height={t[key] / maximum * 100}/>)}</svg>
          <div className="marketing-analytics-axis"><small>{date(data.range.startDate)}</small><small>{date(data.range.endDate)}</small></div></>
          : <div className="marketing-card-empty"><p>Bu aralıkta {key === "published" ? "yayın" : "gönderim"} verisi yok.</p></div>}
      </figure>;
    })}</div>
    {visibleSeries.length > 0 && data.trends.some(t => visibleSeries.some(s => t[s.key] !== null)) && <details className="record-disclosure"><summary>Günlük değerleri tablo olarak göster</summary><div className="marketing-analytics-table"><table><caption>Hazırlama / oluşturma gününe göre sonuçlar</caption><thead><tr><th scope="col">Tarih</th>{visibleSeries.map(s => <th key={s.key} scope="col">{s.label}</th>)}</tr></thead><tbody>{data.trends.map(t => <tr key={t.date}><th scope="row">{t.date}</th>{visibleSeries.map(s => <td key={s.key}>{count(t[s.key])}</td>)}</tr>)}</tbody></table></div></details>}
  </Panel>;
}

export function MarketingAnalytics({ range, onRange, onCampaign, onPublication }: { range: MarketingAnalyticsRangeInput; onRange: (range: MarketingAnalyticsRangeInput) => void; onCampaign: (id: string) => void; onPublication: (id: string) => void }) {
  const [data, setData] = useState<MarketingAnalyticsSnapshot | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [refreshVersion, setRefreshVersion] = useState(0), [help, setHelp] = useState(false);
  const [custom, setCustom] = useState(range.preset === "custom"), [startDate, setStartDate] = useState(range.preset === "custom" ? range.startDate : ""), [endDate, setEndDate] = useState(range.preset === "custom" ? range.endDate : "");
  const epoch = useRef(0), opened = useRef(false);
  const invalidateAnalyticsEpoch = useCallback(() => { ++epoch.current; }, []);
  useEffect(() => {
    const bridge = window.yardimciDesktop; let active = true;
    async function load() {
      const ticket = ++epoch.current; setBusy(true);
      try {
        if (!bridge?.getMarketingAnalytics) throw new Error();
        const result = await bridge.getMarketingAnalytics(range, !opened.current); opened.current = true;
        if (!active || ticket !== epoch.current) return;
        if (!result.ok) throw new Error(result.message); setData(result.value); setMessage("");
      } catch { if (active && ticket === epoch.current) { setData(null); setMessage("Sonuçlar alınamadı. Tarih aralığını kontrol edip yeniden deneyin."); } }
      finally { if (active && ticket === epoch.current) setBusy(false); }
    }
    setData(null); setMessage(""); void load();
    const campaign = bridge?.onMessagingCampaignsChanged?.(() => void load()), provider = bridge?.onBusinessMessagingChanged?.(() => void load()), schedule = bridge?.onMarketingSchedulesChanged?.(() => void load());
    return () => { active = false; invalidateAnalyticsEpoch(); campaign?.(); provider?.(); schedule?.(); };
  }, [range, refreshVersion, invalidateAnalyticsEpoch]);
  // Main-owned registry state is authoritative; disabled providers are not pending setup tasks.
  const activeChannels = data?.channels.filter(c => c.serviceState !== "disabled") ?? [];
  const publishing = activeChannels.filter(c => c.channel === "website" || c.channel === "instagram").map(c => channelNames[c.channel]).join(" + ");
  const messaging = activeChannels.filter(c => c.channel === "whatsapp" || c.channel === "sms").map(c => channelNames[c.channel]).join(" + ");
  const activeIds = new Set(activeChannels.map(c => c.channel));
  return <section className="marketing-analytics" aria-label="Pazarlama analitiği" aria-busy={busy}>
    <header className="marketing-analytics-heading"><div><h2>Paylaşımlarınızın sonuçları</h2><p className="muted">Etkin kanallarınızın yayın ve gönderim sonuçlarını izleyin.</p></div><ActionButton variant="quiet" onClick={() => setHelp(true)}><CircleHelp size={16}/>Ölçümler nasıl okunur?</ActionButton></header>
    <div className="marketing-actions marketing-analytics-filters"><label className="form-field form-field--fluid">Tarih aralığı<select aria-label="Tarih aralığı" value={custom ? "custom" : range.preset} disabled={busy} onChange={e => {
      const preset = e.target.value as MarketingAnalyticsRangeInput["preset"]; setCustom(preset === "custom");
      if (preset !== "custom") onRange({ preset });
      else { setStartDate(startDate || data?.range.startDate || ""); setEndDate(endDate || data?.range.endDate || ""); }
    }}><option value="7d">Son 7 gün</option><option value="30d">Son 30 gün</option><option value="90d">Son 90 gün</option><option value="custom">Özel aralık</option></select></label>
      {custom && <><label className="form-field form-field--fluid">Başlangıç tarihi<DatePicker ariaLabel="Başlangıç tarihi" presets={[]} clearable={false} value={startDate} onChange={setStartDate}/></label><label className="form-field form-field--fluid">Bitiş tarihi<DatePicker ariaLabel="Bitiş tarihi" presets={[]} clearable={false} value={endDate} onChange={setEndDate}/></label><ActionButton variant="secondary" disabled={!startDate || !endDate || busy} onClick={() => onRange({ preset: "custom", startDate, endDate })}>Aralığı uygula</ActionButton></>}
      <ActionButton variant="secondary" disabled={busy} onClick={() => setRefreshVersion(v => v + 1)}>Sonuçları yenile</ActionButton>
    </div>
    {message && <p role="alert">{message}</p>}
    {data && <>
      <p className="muted marketing-analytics-period">{date(data.range.startDate)} – {date(data.range.endDate)} · {data.range.timezone} · Bu aralıkta hazırlanan gönderimler ve oluşturulan yayınlar</p>
      <div className="marketing-analytics-summary" aria-label="Analitik genel özet">
        {publishing && <MetricCard title="Onaylanan yayın" value={count(data.summary.published)} detail={data.summary.published === null ? "Bu aralıkta yayın verisi yok" : publishing + " · kanal başına yayın"} tone="neutral" icon={Globe}/>}
        {messaging && <MetricCard title="Gönderilen mesaj" value={count(data.summary.accepted)} detail={data.summary.accepted === null ? "Bu aralıkta gönderim verisi yok" : messaging + " · gönderim servisine ulaştı"} tone="neutral" icon={Send}/>}
        {activeChannels.length > 0 && <MetricCard title="Kullanılan kanal" value={count(data.summary.usedChannels)} detail={data.summary.usedChannels === null ? "Bu aralıkta kullanım verisi yok" : "Yayın veya gönderim yapılan kanallar"} tone="neutral" icon={ChartNoAxesCombined}/>}
      </div>
      {(publishing || messaging) && <AnalyticsTrends data={data} publishing={publishing} messaging={messaging}/>}
      {activeChannels.length > 0 && <section aria-label="Kanal sonuçları" className="marketing-analytics-results"><header><h3>Kanal sonuçları</h3><p className="muted">Her kanal kendi ölçümleriyle gösterilir. Yayın ve mesaj sayıları farklı şeyleri ölçer.</p></header>
        <div className="marketing-analytics-channels">{activeChannels.map(c => {
          const metrics = c.metrics.filter(m => (channelMetrics[c.channel] ?? []).includes(m.metric));
          return <Panel as="section" className="marketing-analytics-channel" key={c.channel} aria-label={`${channelNames[c.channel]} analitiği`}>
          <h3>{channelNames[c.channel]}</h3>
          {metrics.some(m => m.value !== null) ? <AnalyticsMetricList metrics={metrics} label={`${channelNames[c.channel]} metrikleri`}/>
            : <p aria-label={`${channelNames[c.channel]} metrikleri`}>Bu aralıkta {c.channel === "website" || c.channel === "instagram" ? "yayın" : "gönderim"} verisi yok.</p>}
          {(c.channel === "whatsapp" || c.channel === "sms") && <p className="muted">Gönderilen, servisin aldığı mesajdır. Teslim bilgisi {c.channel === "whatsapp" ? "ve okunma bilgisi" : ""} ayrıca doğrulanır.</p>}
          {c.channel === "website" && <p className="muted">Ziyaret verisi toplanmıyor.</p>}
          {c.channel === "instagram" && <p className="muted">{c.serviceState === "ready" && c.providerCapabilities.some(m => m.availability === "available") ? "Varsa görüntülenme ve etkileşim ölçümleri yayın ayrıntısında gösterilir." : "Görüntülenme ve etkileşim verisi alınamıyor. " + analyticsAvailabilityLabels[c.serviceState === "ready" ? (c.providerCapabilities.find(m => ["permission_denied", "permission_unverified"].includes(m.availability))?.availability ?? c.providerCapabilities[0]?.availability ?? "unsupported") : c.serviceState] + "."}</p>}
        </Panel>; })}</div>
      </section>}
      <Panel as="section" className="marketing-analytics-results" aria-label="Son sonuçlar"><header><h3>Son sonuçlar</h3><p className="muted">Bu aralıkta oluşturulan paylaşımlar · her paylaşımın tüm süresindeki güncel durumu.</p></header>
        {!data.recentResults.some(row => activeIds.has(row.result.channel)) && <div className="marketing-card-empty"><Send size={30}/><strong>Bu aralıkta henüz sonuç yok.</strong><p>Farklı bir tarih aralığı seçerek önceki paylaşımlarınızı görebilirsiniz.</p></div>}
        {data.recentResults.filter(row => activeIds.has(row.result.channel)).map(row => {
          const result = row.result;
          const status = row.kind === "campaign" ? campaignStatuses[row.result.status] : publicationStatuses[row.result.status];
          const measurements = result.metrics.filter(m => ["accepted", "delivered", "read", "failed", "views", "likes"].includes(m.metric) && m.value !== null);
          return <DataListItem twoLine key={result.id} title={`${channelNames[result.channel]} ${row.kind === "campaign" ? "gönderimi" : "yayını"}`} meta={<>{new Date(result.createdAt).toLocaleDateString("tr-TR")} · <StatusBadge tone="neutral">{status}</StatusBadge>{measurements.length > 0 && <AnalyticsMetricList metrics={measurements} label={`${channelNames[result.channel]} paylaşım sonucu`}/>}</>} actions={<ActionButton variant="quiet" onClick={() => row.kind === "campaign" ? onCampaign(result.id) : onPublication(result.id)}>Sonucu aç</ActionButton>}/>;
        })}
        <p className="muted">İçeriklerin başarısını karşılaştırmak için ortak bir etkileşim ölçümü bulunmuyor.</p>
      </Panel>
      <small className="muted">Son kontrol: {new Date(data.measuredAt).toLocaleString("tr-TR")}</small>
    </>}
    {help && <WorkspaceFrame presentation="centered" className="marketing-task-workspace" title="Ölçümler nasıl okunur?" closeLabel="Açıklamayı kapat" onClose={() => setHelp(false)}><div className="form-stack">
      <section><h3>Tarih aralığı neyi seçer?</h3><p>Seçilen günlerde hazırlanan mesaj gönderimleri ve oluşturulan yayınlar gösterilir. Sayılar onların bugünkü sonuçlarıdır; o gün gerçekleşen olayların sayısı değildir. Grafikler de hazırlama ve oluşturma gününü kullanır. Sonuç ayrıntısı, paylaşımın tüm süresini kapsar.</p></section>
      <section><h3>Yayın ile mesaj arasındaki fark</h3><p>Website ve Instagram için kanalın onayladığı yayınlar sayılır. Aynı içerik iki kanalda yayınlanırsa iki yayın sayılır. Sonradan kaldırılan bir yayın da daha önce onaylanan yayın sayısına dahildir.</p><p>WhatsApp ve SMS için gönderim servisine ulaşan mesajlar sayılır. Bu, müşteriye teslim edildiği veya okunduğu anlamına gelmez. Daha sonra başarısız olan bir mesaj, gönderilen ve başarısız sayılarında birlikte yer alabilir. Gönderim işleminin bitmesi de tüm mesajların teslim edildiğini göstermez.</p></section>
      <section><h3>Eksik veri neden sıfır değil?</h3><p>— ölçümün bulunmadığını belirtir. 0 ise kayıtların doğruladığı sıfırdır. Website ziyaretleri ölçülmez; SMS okunma bilgisi sağlamaz. Instagram yayın bağlantısı tek başına etkileşim ölçümlerine erişim sağlamaz.</p><p>Instagram ayrıntısındaki ölçümler varsa yayının tüm süresini kapsar. Eski bir ölçüm, ölçüldüğü zamanla birlikte gösterilir. Farklı kanalların erişimi veya etkileşimi toplanmaz; güvenilir bir içerik başarı sıralaması üretilmez.</p></section>
    </div></WorkspaceFrame>}
  </section>;
}
