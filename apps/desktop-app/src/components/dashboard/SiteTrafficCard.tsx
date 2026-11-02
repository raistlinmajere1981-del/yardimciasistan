import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Activity, BarChart3, MousePointerClick, RefreshCw, X } from "lucide-react";
import type { SiteTrafficResult, SiteTrafficSnapshot } from "../../../electron/web-traffic/snapshot";

const sources: Record<string, string> = { search: "Arama", social: "Sosyal", referral: "Diğer siteler", direct: "Doğrudan / bilinmiyor" };
const pages: Record<string, string> = { home: "Ana sayfa", about: "Hakkımızda", rooms: "Odalar", restaurant: "Restoran", menu: "Menü", catalog: "Katalog", gallery: "Galeri", announcements: "Duyurular", reviews: "Yorumlar", contact: "İletişim" };
const nf = new Intl.NumberFormat("tr-TR");
function count(value: number | undefined) { return nf.format(value ?? 0); }
function pageName(name: string) { const [part, item] = name.split(":", 2); const group = part || ""; return `${pages[group] || group}${item ? ` · ${item}` : ""}`; }

export function SiteTrafficCard() {
  const [period, setPeriod] = useState<7 | 30>(7);
  const [result, setResult] = useState<SiteTrafficResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const anchor = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const read = useCallback(async (days: 7 | 30, fresh = false) => {
    const current = ++seq.current;
    setBusy(true);
    try {
      const next = await window.yardimciDesktop?.getSiteTrafficSnapshot(days, fresh);
      if (current === seq.current) setResult(next ?? { ok: false, message: "Veri okunamadı.", stale: false });
    } catch { if (current === seq.current) setResult({ ok: false, message: "Veri okunamadı.", stale: false }); }
    finally { if (current === seq.current) setBusy(false); }
  }, []);
  useEffect(() => {
    void read(period);
    const handle = window.setInterval(() => { if (document.visibilityState === "visible") void read(period); }, 300_000);
    return () => { ++seq.current; window.clearInterval(handle); };
  }, [period, read]);
  const clearClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => { clearClose(); closeTimer.current = setTimeout(() => setOpen(false), 220); };
  useEffect(() => () => clearClose(), []);
  useLayoutEffect(() => {
    if (!open) return;
    const element = popup.current;
    if (!element) return;
    if (!element.matches(":popover-open")) element.showPopover();
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const p = popup.current?.getBoundingClientRect();
      if (!a || !p) return;
      const left = Math.max(8, Math.min(a.right - p.width, window.innerWidth - p.width - 8));
      const top = a.bottom + p.height + 8 > window.innerHeight ? Math.max(8, a.top - p.height - 8) : a.bottom + 8;
      setPosition({ position: "fixed", left, top, visibility: "visible" });
    };
    const frame = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const dismiss = (event: PointerEvent) => {
      if (anchor.current?.contains(event.target as Node) || element.contains(event.target as Node)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); setOpen(false); anchor.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", escape, true);
      if (element.matches(":popover-open")) element.hidePopover();
    };
  }, [open]);
  const value: SiteTrafficSnapshot | null = result?.ok ? result.value : null;
  const today = value?.daily.at(-1);
  const todayObserved = Boolean(today?.sessions || today?.views || today?.intents);
  const noData = !value?.has_data;
  const last = value?.last_collected_at ? new Date(value.last_collected_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "";
  return <section className="dashboard-site-traffic" aria-label="Site trafiği">
    <button ref={anchor} type="button" className="dashboard-site-traffic-trigger interactive-surface" aria-haspopup="dialog" aria-expanded={open}
      onMouseEnter={() => { clearClose(); setOpen(true); }} onMouseLeave={scheduleClose}
      onFocus={() => { clearClose(); setOpen(true); }} onClick={() => { clearClose(); setOpen(v => !v); }}>
      <span className="dashboard-site-traffic-symbol"><BarChart3 size={19} aria-hidden="true" /></span>
      <span className="dashboard-site-traffic-copy"><small>Site trafiği</small><strong>{busy && !value ? "Yükleniyor…" : value && !value.enabled ? "Site trafiği kapalı" : noData ? "Henüz ölçüm yok" : `${count(today?.sessions)} bugün`}</strong>
        <small>{value && !value.enabled ? "Ayarlar > Web bağlantısı" : noData ? "Ziyaretler ölçülmeye başlayınca görünür" : `${count(value.totals.sessions)} oturum · ${period} gün${result?.ok && result.stale ? " · güncel değil" : ""}`}</small></span>
      <Activity size={17} aria-hidden="true" />
    </button>
    {open && <div ref={popup} popover="manual" role="dialog" aria-label="Site trafiği ayrıntıları" className="dashboard-site-traffic-popup"
      style={position} onMouseEnter={clearClose} onMouseLeave={scheduleClose}>
      <header className="dashboard-site-traffic-header"><div><strong>Site trafiği</strong><small>{last ? `Son kayıt: ${last}` : "Henüz ziyaret kaydı yok"}{result?.ok && result.stale ? " · Güncel değil" : ""}</small></div>
        <button type="button" className="dashboard-site-traffic-icon-button" aria-label="Raporu kapat" onClick={() => setOpen(false)}><X size={17} /></button></header>
      <div className="dashboard-site-traffic-toolbar"><div role="group" aria-label="Rapor dönemi">
        {([7, 30] as const).map(days => <button key={days} type="button" aria-pressed={days === period} onClick={() => setPeriod(days)}>{days} gün</button>)}
        </div><button className="dashboard-site-traffic-icon-button" type="button" aria-label="Raporu yenile" disabled={busy} onClick={() => void read(period, true)}><RefreshCw size={16} /></button></div>
      {value && !value.enabled && <p className="dashboard-site-traffic-disabled"><Activity size={14} aria-hidden="true" /> Site trafiği ölçümü kapalı. Yalnız daha önce toplanan özet gösterilir.</p>}
      {value && value.has_data ? <>
        <div className="dashboard-site-traffic-metrics"><div><small>Oturum</small><strong>{count(value.totals.sessions)}</strong></div><div><small>Sayfa gösterimi</small><strong>{count(value.totals.views)}</strong></div><div><small>İletişim tıklaması</small><strong>{count(value.totals.intents)}</strong></div>
          {value.conversions && <><div><small>Onaylı web talebi</small><strong>{count(value.conversions.requests)}</strong></div><div><small>Onaylı web siparişi</small><strong>{count(value.conversions.orders)}</strong></div></>}</div>
        <div className="dashboard-site-traffic-chart" aria-label={`${period} günlük oturum grafiği`}>{value.daily.map(item => <div key={item.date} className="dashboard-site-traffic-bar" title={`${item.date}: ${item.sessions} yaklaşık oturum`}><span style={{ height: `${Math.max(3, Math.round(item.sessions / Math.max(1, ...value.daily.map(row => row.sessions)) * 100))}%` }} /></div>)}</div>
        <h4>En çok bakılan sayfalar</h4>
        {value.top_pages.length ? <ol>{value.top_pages.map(item => <li key={item.page}><span>{pageName(item.page)}</span><strong>{count(item.count)}</strong></li>)}</ol> : <small>Henüz sayfa kırılımı yok.</small>}
        <h4>Geliş kaynakları</h4>
        <div className="dashboard-site-traffic-sources">{value.sources.filter(item => item.count > 0).map(item => <span key={item.source}>{sources[item.source] || item.source}: <strong>{count(item.count)}</strong></span>)}</div>
        <p><MousePointerClick size={13} aria-hidden="true" /> İletişim tıklaması görüşme veya sipariş değildir. Onaylı talep/sipariş yalnız masaüstüne aktarılmış sunucu kayıtlarından sayılır; tıklamalar bunlara eklenmez.</p>
      </> : <p className="dashboard-site-traffic-empty">{result && !result.ok ? result.message : "Yeni ölçüm başlatıldı; henüz güvenilir bir ziyaret kaydı yok."}</p>}
      {todayObserved && <span className="sr-only">Bugün sayfa görüntülemesi: {count(today?.views)}</span>}
      <small className="dashboard-site-traffic-footnote">Oturumlar yaklaşık ölçülür; tekil kişi sayısı değildir.</small>
    </div>}
  </section>;
}
