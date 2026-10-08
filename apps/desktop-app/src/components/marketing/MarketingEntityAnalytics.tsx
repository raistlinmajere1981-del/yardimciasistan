import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketingCampaignAnalytics, MarketingPublicationAnalytics } from "@yardimci-asistan/shared";
import { ActionButton } from "../ui/ActionButton";
import { AnalyticsMetricList } from "./MarketingAnalyticsMetrics";

/** A read-only section inside the existing canonical workspace, never a second editor. */
export function MarketingEntityAnalytics({ kind, id, revision }: { kind: "campaign" | "publication"; id: string; revision: string }) {
  const [data, setData] = useState<MarketingCampaignAnalytics | MarketingPublicationAnalytics | null>(null);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [clock, setClock] = useState(Date.now);
  const epoch = useRef(0);
  const invalidateEpoch = useCallback(() => { ++epoch.current; }, []);
  useEffect(() => {
    const bridge = window.yardimciDesktop;
    let active = true;
    async function load() {
      const ticket = ++epoch.current;
      const read = kind === "campaign" ? bridge?.getMarketingCampaignAnalytics : bridge?.getMarketingPublicationAnalytics;
      if (!read) return;
      try {
        const result = await read(id);
        if (!active || ticket !== epoch.current) return;
        if (!result.ok) throw new Error(result.message);
        setData(result.value); setMessage("");
      } catch { if (active && ticket === epoch.current) setMessage("Analitik verisi alınamadı."); }
    }
    setData(null); setMessage(""); setBusy(false); void load();
    const campaign = bridge?.onMessagingCampaignsChanged?.(() => void load());
    const provider = bridge?.onBusinessMessagingChanged?.(() => void load());
    return () => { active = false; invalidateEpoch(); campaign?.(); provider?.(); };
  }, [kind, id, revision, invalidateEpoch]);
  const publication = data && "canRefresh" in data ? data : null;
  useEffect(() => {
    if (!publication?.canRefresh || !publication.nextRefreshAt) return;
    const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer);
  }, [publication?.canRefresh, publication?.nextRefreshAt]);
  async function refresh() {
    if (busy) return;
    const ticket = ++epoch.current; setBusy(true); setMessage("");
    try {
      const result = await window.yardimciDesktop!.refreshMarketingPublicationMetrics(id);
      if (ticket !== epoch.current) return;
      if (!result.ok) throw new Error(result.message); setData(result.value); setClock(Date.now());
    } catch { if (ticket === epoch.current) setMessage("Metrikler yenilenemedi. Önceki ölçüm korunuyor."); }
    finally { if (ticket === epoch.current) setBusy(false); }
  }
  return <section className="marketing-analytics-detail" aria-label={kind === "campaign" ? "Kampanya analitiği" : "Yayın analitiği"} aria-busy={busy}>
    <h3>Paylaşım sonuçları</h3><p className="muted">{kind === "campaign" ? "Hazırlanan tüm alıcıların güncel sonuçları. Gönderilen mesaj servise ulaşmıştır; teslim ve okunma ayrıca doğrulanır." : "Yayının tüm yaşam süresi · seçili genel tarih aralığından bağımsız."}</p>
    {message && <p role="status">{message}</p>}
    {data ? <AnalyticsMetricList metrics={data.metrics} label={kind === "campaign" ? "Kampanya metrikleri" : "Yayın metrikleri"}/> : !message && <p>Henüz analitik veri yok.</p>}
    {publication && <p>Durum: {publication.status === "published" ? "Yayınlandı" : publication.status === "publishing" ? "Yayın onayı bekleniyor" : publication.status === "failed" ? "Başarısız" : publication.status === "unpublished" ? "Yayından kaldırıldı" : "Taslak"} · Yayın zamanı: {publication.publishedAt ? new Date(publication.publishedAt).toLocaleString("tr-TR") : "—"} · Son güncelleme: {new Date(publication.updatedAt).toLocaleString("tr-TR")}</p>}
    {publication?.channel === "website" && <p>Ziyaret verisi toplanmıyor.</p>}
    {publication?.canRefresh && <><ActionButton variant="secondary" disabled={busy || Boolean(publication.nextRefreshAt && Date.parse(publication.nextRefreshAt) > clock)} onClick={() => void refresh()}>Sağlayıcı metriklerini yenile</ActionButton>
      {publication.nextRefreshAt && Date.parse(publication.nextRefreshAt) > clock && <small>Bir sonraki yenileme: {new Date(publication.nextRefreshAt).toLocaleTimeString("tr-TR")}</small>}</>}
  </section>;
}
