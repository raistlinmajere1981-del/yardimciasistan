import type { MarketingMetric, MarketingMetricName, MarketingMetricAvailability } from "@yardimci-asistan/shared";

const labels: Record<MarketingMetricName, string> = { audience: "Kitle", eligible: "Gönderime uygun", prepared: "Hazırlanan", pending: "Gönderilmeyi bekleyen", attempted: "Gönderimi denenen", accepted: "Gönderilen", delivered: "Teslim edilen", read: "Okunan", failed: "Başarısız", skipped: "Atlanan", publishing: "Yayın onayı bekleyen", published: "Yayınlanan", unpublished: "Kaldırılan", active_publications: "Aktif yayın · şu an", total_publications: "Toplam yayın kaydı", impressions: "Gösterim", reach: "Erişim", views: "Görüntülenme", likes: "Beğeni", comments: "Yorum", saves: "Kaydetme", shares: "Paylaşım", clicks: "Tıklama" };
export const analyticsAvailabilityLabels: Record<MarketingMetricAvailability, string> = { available: "", no_data: "Henüz veri yok", unsupported: "Bu servis ölçmüyor", unconfigured: "Kanal henüz bağlı değil", disabled: "Kanal kapalı", permission_denied: "Ölçüm izni yok", permission_unverified: "Ölçüm izni doğrulanmadı", refresh_failed: "Metrik yenilenemedi" };
export function AnalyticsMetricList({ metrics, label }: { metrics: MarketingMetric[]; label: string }) {
  return <dl className="marketing-counts marketing-analytics-metrics" aria-label={label}>{metrics.map(m => <div key={m.metric}>
    <dt>{labels[m.metric]}</dt><dd>{m.value === null ? "—" : m.value.toLocaleString("tr-TR")}</dd>
    {m.availability !== "available" && <small>{analyticsAvailabilityLabels[m.availability]}</small>}
    {m.source === "provider_snapshot" && m.measuredAt && <small>Son ölçüm: {new Date(m.measuredAt).toLocaleString("tr-TR")}{m.freshness === "stale" ? " · Eski ölçüm" : ""}</small>}
  </div>)}</dl>;
}
