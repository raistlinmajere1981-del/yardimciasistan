import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Globe, Plus, RefreshCw, Send } from "lucide-react";
import type { MarketingAnalyticsRangeInput, MarketingPublication, MarketingScheduleDetail, MarketingScheduleInput, MarketingScheduleSnapshot, MarketingShareDetail, MarketingStudioSnapshot } from "@yardimci-asistan/shared";
import type { RegisterPageLeaveGuard } from "../app/page-navigation-guard";
import { usePageViewState } from "../app/page-view-state";
import { FeatureViewSelector } from "../components/workspace/FeatureViewSelector";
import { FeatureWorkspacePage } from "../components/workspace/FeatureWorkspacePage";
import { WorkspaceFrame } from "../components/workspace/WorkspaceFrame";
import { ActionButton } from "../components/ui/ActionButton";
import { Panel } from "../components/ui/Panel";
import { StatusBadge } from "../components/ui/StatusBadge";
import { MarketingAnalytics } from "../components/marketing/MarketingAnalytics";
import { MarketingShareWorkspace } from "../components/marketing/MarketingShareWorkspace";
import { MarketingRecordManager, MarketingThumbnail, publicationLabel } from "../components/marketing/MarketingRecordManager";
import { MarketingDeliveryWorkspace, deliveryStatuses } from "../components/marketing/MarketingDeliveryWorkspace";
import { MarketingScheduleDialog } from "../components/marketing/MarketingScheduleDialog";
import { channelNames, newShare, resultValue } from "../components/marketing/share-draft";

type Surface = {kind: "share"; initial?: MarketingShareDetail; publication?: MarketingPublication} | {kind: "website" | "drafts" | "publications"; selectedId?: string} | {kind: "recent"} | {kind: "delivery"; id: string} | {kind: "schedule"; detail?: MarketingScheduleDetail; initial?: MarketingScheduleInput};
export function MarketingPage({enabled, registerPageLeaveGuard, onMessage, onCalendar}: {
  enabled: boolean; registerPageLeaveGuard?: RegisterPageLeaveGuard; onMessage?: (message: string) => void; onCalendar?: () => void;
}) {
  const [snapshot, setSnapshot] = useState<MarketingStudioSnapshot | null>(null), [plans, setPlans] = useState<MarketingScheduleSnapshot | null>(null);
  const [view, setView] = usePageViewState<"workspace" | "analytics">("marketing.view", "workspace");
  const [analyticsRange, setAnalyticsRange] = usePageViewState<MarketingAnalyticsRangeInput>("marketing.analytics.range", {preset: "30d"});
  const [surface, setSurface] = useState<Surface | null>(null), [loading, setLoading] = useState(false), [message, setMessage] = useState("");
  const epoch = useRef(0), mounted = useRef(true), opening = useRef(false);
  const invalidateMarketingEpoch = useCallback(() => { ++epoch.current; }, []);
  const reload = useCallback(async () => {
    const ticket = ++epoch.current, bridge = window.yardimciDesktop!;
    const [studio, calendar] = await Promise.all([bridge.getMarketingStudio(), bridge.getMarketingSchedules?.()]);
    if(!mounted.current || ticket !== epoch.current)return;
    setSnapshot(resultValue(studio)); if(calendar) setPlans(resultValue(calendar));
  }, []);
  useEffect(() => {mounted.current = true; if(!enabled)return;
    setLoading(true); void reload().catch(e => setMessage(e instanceof Error ? e.message : "Pazarlama verileri alınamadı.")).finally(() => setLoading(false));
    const bridge = window.yardimciDesktop!;
    const refresh = () => void reload().catch(() => {});
    const disposeCampaign = bridge.onMessagingCampaignsChanged?.(refresh), disposeSchedules = bridge.onMarketingSchedulesChanged?.(refresh), disposeProviders = bridge.onBusinessMessagingChanged?.(refresh);
    const timer = setInterval(refresh, 5000);
    return () => {mounted.current = false; invalidateMarketingEpoch(); clearInterval(timer); disposeCampaign?.(); disposeSchedules?.(); disposeProviders?.();};
  }, [enabled, reload, invalidateMarketingEpoch]);
  async function openContent(id: string, publication?: MarketingPublication) {
    if(opening.current)return; opening.current = true; setLoading(true); setMessage("");
    try {const detail = resultValue(await window.yardimciDesktop!.getMarketingShare(id)); if(mounted.current) setSurface({kind: "share", initial: detail, publication});}
    catch(e) {if(mounted.current) setMessage(e instanceof Error ? e.message : "İçerik açılamadı.");}
    finally {opening.current = false; if(mounted.current) setLoading(false);}
  }
  if(!enabled) return <FeatureWorkspacePage label="Pazarlama" bodyLabel="Pazarlama çalışma alanı" layout="fill">
    <div className="panel empty-state"><strong>Pazarlama bu işletmede etkin değil.</strong></div>
  </FeatureWorkspacePage>;
  const drafts = snapshot?.contents.filter(c => c.content.status !== "archived" && !snapshot.shares?.some(s => s.contentId === c.content.id && s.submitted) && !snapshot.publications.some(p => p.contentId === c.content.id) && !snapshot.campaigns?.some(d => d.campaign.contentId === c.content.id)) || [];
  const activeWebsite = snapshot?.publications.filter(p => p.channel === "website" && (p.desiredPublished || Boolean(p.publishedAt) && p.status !== "unpublished")) || [];
  const recent = [
    ...(snapshot?.publications || []).map(p => ({id: p.id, contentId: p.contentId, title: p.title, channel: p.channel, date: p.createdAt, images: p.mediaAssetIds,
      label: plans?.schedules.some(s => s.schedule.targetId === p.id && ["active","paused"].includes(s.schedule.status)) ? "Planlandı" : publicationLabel(p), publication: p, campaign: false})),
    ...(snapshot?.campaigns || []).map(d => ({id: d.campaign.id, contentId: d.campaign.contentId, title: d.campaign.name, channel: d.campaign.channel, date: d.campaign.createdAt, images: [],
      label: plans?.schedules.some(s => s.schedule.targetId === d.campaign.id && ["active","paused"].includes(s.schedule.status)) ? "Planlandı" : deliveryStatuses[d.campaign.status], publication: undefined, campaign: true}))
  ].sort((a,b) => b.date.localeCompare(a.date));
  const openRecent = (row: typeof recent[number]) => row.campaign ? setSurface({kind: "delivery", id: row.id}) : setSurface({kind: "publications", selectedId: row.id});
  const recentRow = (row: typeof recent[number]) => <button type="button" className="marketing-record" key={row.id} onClick={() => openRecent(row)}><MarketingThumbnail snapshot={snapshot!} ids={row.images}/><span><strong>{row.title}</strong><small>{channelNames[row.channel]} · {new Date(row.date).toLocaleDateString("tr-TR")}</small></span><StatusBadge tone={row.label === "Yayında" || row.label === "Tamamlandı" ? "success" : row.label === "Planlandı" ? "info" : "neutral"}>{row.label}</StatusBadge></button>;
  return <FeatureWorkspacePage label="Pazarlama" bodyLabel="Pazarlama çalışma alanı" layout="fill" toolbar={<>
    <FeatureViewSelector label="Pazarlama görünümü" value={view} items={[{id: "workspace", label: "Çalışma Alanı"}, {id: "analytics", label: "Analitik"}]} onChange={setView}/>
    <div className="page-toolbar__actions"><ActionButton variant="quiet" disabled={loading} onClick={() => {setMessage(""); setLoading(true); void reload().catch(e => setMessage(e.message)).finally(() => setLoading(false));}}><RefreshCw size={16}/>Durumu yenile</ActionButton></div>
  </>}>
    <div className="marketing-page" aria-busy={loading}>
      {message && <p role="alert">{message}</p>}
      {view === "analytics" ? <div className="marketing-body"><MarketingAnalytics range={analyticsRange} onRange={setAnalyticsRange} onCampaign={id => setSurface({kind: "delivery", id})} onPublication={id => setSurface({kind: "publications", selectedId: id})}/></div> : <>
        <Panel as="section" surfaceRole="communication" className="marketing-welcome"><div><h2>Merhaba!</h2><p>Markanızı daha görünür hale getirin. İçeriğinizi oluşturun,<br className="marketing-welcome-break"/> kanallarınızı seçin ve paylaşın.</p></div><Send className="marketing-welcome-icon" size={66} strokeWidth={1} aria-hidden="true"/><ActionButton disabled={loading || !snapshot} onClick={() => setSurface({kind: "share"})}><Plus size={18}/>Yeni paylaşım</ActionButton></Panel>
        <div className="marketing-dashboard">
          <Panel as="section" className="marketing-summary-card" aria-label="Taslaklar"><header><div><h3><FileText size={17}/>Taslaklar</h3><p>Tamamlanmayı bekleyen içerikleriniz.</p></div><ActionButton variant="quiet" size="sm" disabled={!snapshot} onClick={() => setSurface({kind: "drafts"})}>Tümünü gör</ActionButton></header><div className="marketing-card-list">
            {drafts.slice(0,5).map(c => <button className="marketing-record" type="button" key={c.content.id} disabled={loading} onClick={() => void openContent(c.content.id)}><MarketingThumbnail snapshot={snapshot!} ids={c.media.map(m => m.mediaAssetId)}/><span><strong>{c.content.title}</strong><small>Son düzenleme: {new Date(c.content.updatedAt).toLocaleDateString("tr-TR")}</small></span><StatusBadge tone="warning">Taslak</StatusBadge></button>)}
            {!drafts.length && <div className="marketing-card-empty"><FileText size={30}/><strong>Yeni fikirler için yer var.</strong><p>Yeni paylaşım oluşturup taslak olarak kaydedin.</p></div>}
          </div></Panel>
          <Panel as="section" className="marketing-summary-card" aria-label="Son paylaşımlar"><header><div><h3><Send size={17}/>Son paylaşımlar</h3><p>Yayınlanan ve planlanan paylaşımlarınız.</p></div><ActionButton variant="quiet" size="sm" disabled={!snapshot} onClick={() => setSurface({kind: "recent"})}>Tümünü gör</ActionButton></header><div className="marketing-card-list">{recent.slice(0,5).map(recentRow)}{!recent.length && <div className="marketing-card-empty"><Send size={30}/><strong>İlk paylaşımınızı hazırlayın.</strong><p>Yayın ve gönderim durumlarını burada izleyin.</p></div>}</div></Panel>
          <Panel as="section" className="marketing-summary-card" aria-label="Aktif web içerikleri"><header><div><h3><Globe size={17}/>Aktif web içerikleri</h3><p>Sitenizde yayında olan içerikler.</p></div><ActionButton variant="quiet" size="sm" disabled={!snapshot} onClick={() => setSurface({kind: "website"})}>Tümünü gör</ActionButton></header><div className="marketing-card-list">{activeWebsite.slice(0,5).map(p => <button className="marketing-record" type="button" key={p.id} onClick={() => setSurface({kind: "website", selectedId: p.id})}><MarketingThumbnail snapshot={snapshot!} ids={p.mediaAssetIds}/><span><strong>{p.title}</strong><small>{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("tr-TR") : "Yayın onayı bekleniyor"}</small></span><StatusBadge tone={p.status === "published" ? "success" : "info"}>{publicationLabel(p)}</StatusBadge></button>)}{!activeWebsite.length && <div className="marketing-card-empty"><Globe size={30}/><strong>Henüz aktif içerik yok.</strong><p>Web sitesine gönderdiğiniz içerikleri buradan yönetin.</p></div>}</div></Panel>
        </div>
      </>}
    </div>
    {snapshot && surface?.kind === "share" && <MarketingShareWorkspace key={surface.publication?.id || surface.initial?.content.content.id || "new"} snapshot={snapshot} initial={surface.initial} publication={surface.publication} onClose={() => setSurface(null)} onReload={reload} onMessage={onMessage} registerPageLeaveGuard={registerPageLeaveGuard} onCalendar={onCalendar}/>}
    {snapshot && surface && ["website","drafts","publications"].includes(surface.kind) && <MarketingRecordManager kind={surface.kind as "website" | "drafts" | "publications"} snapshot={snapshot} publications={surface.kind === "website" ? activeWebsite : surface.kind === "publications" ? snapshot.publications : []} contents={surface.kind === "drafts" ? drafts : []} selectedId={"selectedId" in surface ? surface.selectedId : undefined} onClose={() => setSurface(null)} onEditContent={id => void openContent(id)} onEditPublication={p => void openContent(p.contentId, p)} onReload={reload} onMessage={onMessage}/>}
    {snapshot && surface?.kind === "recent" && <WorkspaceFrame presentation="centered" className="marketing-management-workspace" title="Tüm paylaşımlar" context="Yayın ve gönderim durumlarını izleyin." onClose={() => setSurface(null)}><section className="form-stack">{recent.map(recentRow)}{!recent.length && <p>Henüz paylaşım yok.</p>}</section></WorkspaceFrame>}
    {surface?.kind === "delivery" && <MarketingDeliveryWorkspace id={surface.id} channels={snapshot?.channels || []} onClose={() => setSurface(null)} onReload={reload} onPlan={detail => {
      const c = detail.campaign, existing = plans?.schedules.find(p => p.schedule.targetId === c.id && ["active","paused"].includes(p.schedule.status)), options = newShare().options;
      setSurface({kind: "schedule", detail: existing, initial: {name: c.name, targetType: "audience_campaign", targetId: c.id, channel: c.channel, scheduleType: "once", timezone: options.timezone, startsLocal: options.startsLocal, missedRunPolicy: "run_once_when_resumed"}});
    }}/>}
    {surface?.kind === "schedule" && <MarketingScheduleDialog detail={surface.detail} initial={surface.initial} onClose={() => setSurface(null)} onReload={reload} onMessage={onMessage} registerPageLeaveGuard={registerPageLeaveGuard}/>}
  </FeatureWorkspacePage>;
}
