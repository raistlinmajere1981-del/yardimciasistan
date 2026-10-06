import { useEffect, useRef, useState } from "react";
import type { MarketingChannelRegistry, MessagingCampaignDetail } from "@yardimci-asistan/shared";
import { WorkspaceFrame } from "../workspace/WorkspaceFrame";
import { ActionButton } from "../ui/ActionButton";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { StatusBadge } from "../ui/StatusBadge";
import { MarketingEntityAnalytics } from "./MarketingEntityAnalytics";
import { resultValue } from "./share-draft";

export const deliveryStatuses = {draft: "Taslak", prepared: "Gönderime hazır", running: "Gönderim sürüyor", paused: "Duraklatıldı", cancelled: "İptal edildi", completed: "Tamamlandı"};
const deliveryIssues: Record<string, string> = {submission_uncertain: "Sağlayıcı sonucu belirsiz; tekrar gönderilmedi", provider_failed: "Sağlayıcı gönderimi kabul etmedi", max_attempts: "Gönderim denemeleri tamamlanamadı", transient: "Geçici bağlantı sorunu", rate_limit: "Sağlayıcının gönderim sınırına ulaşıldı"};
export function MarketingDeliveryWorkspace({id, channels, onClose, onReload, onPlan}: {id: string; channels: MarketingChannelRegistry; onClose: () => void; onReload: () => Promise<void>; onPlan?: (detail: MessagingCampaignDetail) => void}) {
  const [detail, setDetail] = useState<MessagingCampaignDetail | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [cancel, setCancel] = useState(false), [analytics, setAnalytics] = useState(false);
  const epoch = useRef(0), working = useRef(false);
  useEffect(() => {let live = true; const bridge = window.yardimciDesktop!;
    const load = async () => {const ticket = ++epoch.current; try {const current = resultValue(await bridge.getMessagingCampaign(id)); if(live && ticket === epoch.current) setDetail(current);} catch(e) {if(live) setMessage(e instanceof Error ? e.message : "Gönderim okunamadı.");}};
    void load(); const dispose = bridge.onMessagingCampaignsChanged?.(() => void load());
    return () => {live = false; epoch.current++; dispose?.();};
  }, [id]);
  async function action(kind: "prepare" | "start" | "pause" | "resume" | "cancel") {
    if(working.current)return; working.current = true; setBusy(true); setMessage(""); const ticket = ++epoch.current;
    try {const b = window.yardimciDesktop!; const op = {prepare: b.prepareMessagingCampaign, start: b.startMessagingCampaign, pause: b.pauseMessagingCampaign, resume: b.resumeMessagingCampaign, cancel: b.cancelMessagingCampaign}[kind];
      const next = resultValue(await op(id)); if(ticket === epoch.current) {setDetail(next); setCancel(false);} await onReload();
    } catch(e) {setMessage(e instanceof Error ? e.message : "Gönderim işlemi tamamlanamadı.");} finally {working.current = false; setBusy(false);}
  }
  const c = detail?.campaign;
  const available = channels.some(channel => channel.id === c?.channel && channel.enabled && channel.configured);
  return <WorkspaceFrame title={c?.name || "Gönderim ayrıntıları"} context="WhatsApp / SMS gönderimi" className="marketing-management-workspace" presentation="centered" closeBlocked={busy} onClose={onClose}
    footer={<ActionButton variant="secondary" disabled={busy} onClick={onClose}>Kapat</ActionButton>}
    overlay={cancel && <ConfirmDialog withinModal tone="danger" title="Gönderim iptal edilsin mi?" description="Henüz işleme alınmamış alıcılar iptal edilir. Gönderilen mesajlar geri alınamaz." confirmLabel="Gönderimi iptal et" busy={busy} onConfirm={() => action("cancel")} onCancel={() => setCancel(false)}/>}>
    <p role="status">{message}</p>
    {c && detail ? <section className="form-stack" aria-label="Gönderim ayrıntıları"><div className="marketing-actions"><StatusBadge tone={c.status === "running" ? "info" : "neutral"}>{deliveryStatuses[c.status]}</StatusBadge><strong>{c.channel === "sms" ? "SMS" : "WhatsApp Business"}</strong></div>
      <p>{c.channel === "sms" ? c.text : `Onaylı şablon: ${c.templateName} · ${c.templateLanguage}`}</p>
      <dl className="marketing-counts"><div><dt>Hedef kitle</dt><dd>{detail.matchedCount}</dd></div><div><dt>Uygun</dt><dd>{detail.eligibleCount}</dd></div><div><dt>Bekleyen</dt><dd>{detail.pendingOutboxCount}</dd></div><div><dt>İşleniyor</dt><dd>{detail.claimedOutboxCount}</dd></div><div><dt>Kabul edilen</dt><dd>{detail.dispatchedCount}</dd></div><div><dt>Atlanan</dt><dd>{detail.skippedCount}</dd></div><div><dt>Başarısız</dt><dd>{detail.failedCount}</dd></div><div><dt>İptal edilen</dt><dd>{detail.cancelledCount}</dd></div></dl>
      <p>Kabul edilen gönderim teslim edildiği anlamına gelmez. Gönderim öncesinde izinler yeniden kontrol edilir.</p>
      <label>Gönderim ilerlemesi<progress aria-label="Gönderim ilerlemesi" max={Math.max(1, detail.matchedCount)} value={detail.matchedCount - detail.pendingOutboxCount - detail.claimedOutboxCount}/></label>
      {!available && <p>Bu gönderim kanalı şu anda kullanılamıyor. Gönderim bilgileri korunuyor.</p>}
      <div className="marketing-actions"><ActionButton variant="secondary" disabled={busy || !available || c.status !== "draft"} onClick={() => void action("prepare")}>Gönderime hazırla</ActionButton><ActionButton disabled={busy || !available || c.status !== "prepared"} onClick={() => void action("start")}>Gönderimi başlat</ActionButton><ActionButton variant="secondary" disabled={busy || c.status === "paused" && !available || !["running","paused"].includes(c.status)} onClick={() => void action(c.status === "paused" ? "resume" : "pause")}>{c.status === "paused" ? "Gönderimi devam ettir" : "Gönderimi duraklat"}</ActionButton><ActionButton variant="danger" disabled={busy || ["cancelled","completed"].includes(c.status)} onClick={() => setCancel(true)}>Gönderimi iptal et</ActionButton><ActionButton variant="secondary" disabled={busy || !available || c.status !== "prepared" || !onPlan} onClick={() => onPlan?.(detail)}>Gönderimi planla</ActionButton></div>
      {detail.errorCounts.length > 0 && <section aria-label="Gönderim sorunları"><h3>Gönderim sorunları</h3>{detail.errorCounts.map(e => <p key={e.category}>{deliveryIssues[e.category] || "Gönderim tamamlanamadı"}: {e.count}</p>)}</section>}
      <ActionButton variant="quiet" onClick={() => setAnalytics(!analytics)}>{analytics ? "Gönderim bilgilerine dön" : "Teslim ve okunma sonuçları"}</ActionButton>
      {analytics && <MarketingEntityAnalytics kind="campaign" id={id} revision={c.updatedAt}/>}
    </section> : <p>Gönderim yükleniyor…</p>}
  </WorkspaceFrame>;
}
