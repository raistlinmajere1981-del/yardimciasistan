import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CloudUpload, ExternalLink, RefreshCw, Save, Waves, Image as ImageIcon, Link2Off, Layers3 } from "lucide-react";
import { effectSiteDeployTarget } from "../shared/contracts";
import type { DeploymentTargetSnapshot, EffectScene, EffectStudioProject } from "../shared/contracts";
import "./effect-studio.css";

type StudioPacket = {
  type: string;
  requestId?: number;
  scene?: EffectScene;
  message?: string;
};
type Pending = { resolve: (value: StudioPacket) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
type StoredSelection = { siteId: string; imageId: string };

const SELECTION_KEY = "effect-studio.selection";

function readStoredSelection(): StoredSelection {
  try {
    const raw = sessionStorage.getItem(SELECTION_KEY);
    if (!raw) return { siteId: "", imageId: "" };
    const value = JSON.parse(raw) as Partial<StoredSelection>;
    return {
      siteId: typeof value.siteId === "string" ? value.siteId : "",
      imageId: typeof value.imageId === "string" ? value.imageId : ""
    };
  } catch {
    return { siteId: "", imageId: "" };
  }
}

export function EffectStudio({ onOpenDeploy }: { onOpenDeploy?: (targetId: string) => void }) {
  const [projects, setProjects] = useState<EffectStudioProject[]>([]);
  const [selected, setSelected] = useState("");
  const [siteId, setSiteId] = useState("");
  const [deployTargets, setDeployTargets] = useState<DeploymentTargetSnapshot[]>([]);
  const storedSelection = useRef(readStoredSelection());
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("Projeler okunuyor…");
  const [error, setError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef(new Map<number, Pending>());
  const counter = useRef(0);
  const changeCount = useRef(0);
  const savedCount = useRef(0);
  const activeTarget = useRef("");
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const loadToken = useRef(0);
  const saveCurrent = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(async () => {
    try {
      const data = await window.adminControlCenter.listEffectProjects();
      const stored = storedSelection.current;
      const hasImage = (id: string) => data.some(site => site.images.some(image => image.id === id && image.available));
      setProjects(data);
      setSelected((old) => hasImage(old) ? old
        : hasImage(stored.imageId) ? stored.imageId
          : data.flatMap(item => item.images).find(image => image.available)?.id || "");
      setSiteId(old => data.some(site => site.id === old) ? old
        : data.some(site => site.id === stored.siteId) ? stored.siteId
          : data.find(site => site.images.some(image => image.available))?.id || data[0]?.id || "");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("Proje listesi alınamadı.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!siteId || !selected) return;
    storedSelection.current = { siteId, imageId: selected };
    try {
      sessionStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId, imageId: selected }));
    } catch {
      // Selection persistence only affects returning to the staged image.
    }
  }, [siteId, selected]);

  // A project refresh or a fallback image must never leave the site dropdown
  // pointing at a different site than the selected image.
  useEffect(() => {
    if (!selected) return;
    const owner = projects.find(project => project.images.some(image => image.id === selected));
    if (owner && owner.id !== siteId) setSiteId(owner.id);
  }, [projects, selected, siteId]);

  useEffect(() => {
    let active = true;
    void window.adminControlCenter.getDeploymentTargets()
      .then((targets) => { if (active) setDeployTargets(Array.isArray(targets) ? targets : []); })
      .catch(() => { if (active) setDeployTargets([]); });
    return () => { active = false; };
  }, []);

  const request = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    return new Promise<StudioPacket>((resolve, reject) => {
      const target = frame.current?.contentWindow;
      if (!target || !ready) { reject(new Error("Düzenleyici henüz hazır değil.")); return; }
      const requestId = ++counter.current;
      const timer = setTimeout(() => {
        pending.current.delete(requestId);
        reject(new Error("Düzenleyici yanıt vermedi."));
      }, 15000);
      pending.current.set(requestId, { resolve, reject, timer });
      target.postMessage({ type, requestId, ...payload }, "*");
    });
  }, [ready]);

  const save = useCallback(async () => {
    if (!activeTarget.current || !loaded) return;
    if (saving.current) return saving.current;
    const targetId = activeTarget.current;
    const revision = changeCount.current;
    const operation = (async () => {
      setWorking(true);
      try {
        const packet = await request("studio:get");
        if (!packet.scene) throw new Error("Düzenlenecek sahne bulunamadı.");
        await window.adminControlCenter.saveEffectScene(targetId, packet.scene);
        if (activeTarget.current === targetId) {
          savedCount.current = revision;
          setDirty(changeCount.current !== savedCount.current);
          setStatus("Yerel taslak kaydedildi.");
          setError("");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("Taslak kaydedilemedi.");
        throw e;
      } finally { setWorking(false); }
    })();
    saving.current = operation;
    let success = false;
    try { await operation; success = true; }
    finally {
      saving.current = null;
      if (success && activeTarget.current === targetId && changeCount.current > savedCount.current) {
        if (autoTimer.current) clearTimeout(autoTimer.current);
        autoTimer.current = setTimeout(() => { void saveCurrent.current().catch(() => {}); }, 1200);
      }
    }
  }, [request, loaded]);
  saveCurrent.current = save;

  useEffect(() => {
    const handler = (event: MessageEvent<StudioPacket>) => {
      if (event.source !== frame.current?.contentWindow || !event.data || typeof event.data.type !== "string") return;
      const data = event.data;
      if (data.type === "studio:ready") { setReady(true); return; }
      if (data.type === "studio:dirty") {
        changeCount.current++;
        setDirty(true);
        setStatus("Düzenleniyor…");
        if (autoTimer.current) clearTimeout(autoTimer.current);
        autoTimer.current = setTimeout(() => { void saveCurrent.current().catch(() => {}); }, 1600);
        return;
      }
      if (data.requestId !== undefined) {
        const task = pending.current.get(data.requestId);
        if (task) {
          pending.current.delete(data.requestId);
          clearTimeout(task.timer);
          if (data.type === "studio:error") task.reject(new Error(data.message || "Düzenleyici hatası"));
          else task.resolve(data);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (autoTimer.current) clearTimeout(autoTimer.current);
      for (const task of pending.current.values()) { clearTimeout(task.timer); task.reject(new Error("Atölye kapandı.")); }
      pending.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!ready || !selected) { setLoaded(false); return; }
    const token = ++loadToken.current;
    setLoaded(false);
    setDirty(false);
    setError("");
    setStatus("Görsel ve sahne açılıyor…");
    changeCount.current = 0;
    savedCount.current = 0;
    void (async () => {
      try {
        const data = await window.adminControlCenter.loadEffectScene(selected);
        if (token !== loadToken.current) return;
        await request("studio:load", { scene: data.scene });
        if (token !== loadToken.current) return;
        activeTarget.current = selected;
        setLoaded(true);
        setStatus(data.source === "draft" ? "Kayıtlı taslak açıldı." : data.source === "new" ? "Yeni sahne hazır." : "Site sahnesi açıldı.");
      } catch (e) {
        if (token !== loadToken.current) return;
        activeTarget.current = "";
        setError(e instanceof Error ? e.message : String(e));
        setStatus("Görsel açılamadı.");
      }
    })();
  }, [ready, selected, request]);

  // Wait for an in-flight save and, if edits arrived meanwhile, save the latest
  // revision before switching targets or preparing/publishing a scene.
  const flushSave = useCallback(async () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    await save();
    while (saving.current) await saving.current;
    if (activeTarget.current && loaded && changeCount.current !== savedCount.current) await save();
    if (autoTimer.current) clearTimeout(autoTimer.current);
  }, [save, loaded]);

  const target = useMemo(() => projects.flatMap((project) => project.images).find((image) => image.id === selected), [projects, selected]);
  const selectedProject = useMemo(() => projects.find(project => project.id === siteId), [projects, siteId]);
  // Only first-time local bindings wait for a site deploy. A staged image with
  // its own publish route keeps the direct publish action instead.
  const stagedImages = useMemo(() => selectedProject?.images.filter(image => image.bindingStatus === "staged" && !image.canPublish) ?? [], [selectedProject]);
  const mappedTargetId = selectedProject ? effectSiteDeployTarget(selectedProject.id) : null;
  const mappedDeployTarget = mappedTargetId ? deployTargets.find(item => item.id === mappedTargetId) : undefined;
  const stagedImage = stagedImages[0];

  const choose = async (newId: string) => {
    if (!newId || newId === selected) return;
    try { if (dirty || saving.current) await flushSave(); }
    catch { return; }
    setSelected(newId);
    const nextSite = projects.find(site => site.images.some(image => image.id === newId));
    if (nextSite) setSiteId(nextSite.id);
  };
  const chooseSite = async (newSite: string) => {
    if (newSite === siteId) return;
    const next = projects.find(project => project.id === newSite);
    if (!next) return;
    if (dirty || saving.current) {
      try { await flushSave(); } catch { return; }
    }
    setSiteId(newSite);
    setSelected(next.images.find(image => image.available)?.id || "");
  };

  const prepare = async () => {
    if (!target?.canPrepare || !loaded || working) return;
    if (!window.confirm("Seçili sabit görselin efekt sahnesi ve site manifesti yerel kaynaklara hazırlanacak. Canlı site değişmeyecek. Devam edilsin mi?")) return;
    try {
      await flushSave();
      setWorking(true);
      setStatus("Sabit görsel bağlantısı yerelde hazırlanıyor…");
      const result = await window.adminControlCenter.prepareEffectScene(selected);
      setStatus(result.message);
      setError("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("Site bağlantısı hazırlanamadı.");
    } finally { setWorking(false); }
  };

  const publish = async () => {
    if (!target?.canPublish || !loaded || working) return;
    if (!window.confirm("Yalnız seçili görselin efekt sahnesi canlı siteye yüklenecek. Devam edilsin mi?")) return;
    try {
      await flushSave();
      setWorking(true);
      setStatus("Sahne siteye yükleniyor…");
      const result = await window.adminControlCenter.publishEffectScene(selected);
      setStatus(result.message);
      setError("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("Yayın başarısız.");
    } finally { setWorking(false); }
  };

  return <div className="effects-screen">
    <header className="effects-head">
      <div className="effects-heading"><span className="effects-kicker"><Waves size={15} /> GÖRSEL ÇALIŞMA ALANI</span><h1>Efekt Atölyesi</h1></div>
      <div className="effects-controls">
        <label>Site
          <select aria-label="Efekt projesi" value={siteId} onChange={(event) => void chooseSite(event.target.value)}>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label>Görsel
          <select aria-label="Efekt görseli" value={selectedProject?.images.some(image => image.id === selected) ? selected : ""}
            onChange={event => void choose(event.target.value)} disabled={!selectedProject?.images.length}>
            {!selectedProject?.images.length && <option value="">Uygun görsel yok</option>}
            {selectedProject?.images.map(image => <option key={image.id} value={image.id} disabled={!image.available}>{image.name}</option>)}
          </select>
        </label>
        <button className="effects-small" title="Siteleri ve görselleri yenile" aria-label="Siteleri ve görselleri yenile"
          onClick={() => void refresh()}><RefreshCw size={16}/></button>
      </div>
    </header>
    <div className="effects-body">
      <aside className="effects-assets" aria-label="Site görsel gezgini">
        <div className="effects-assets-header"><Layers3 size={15}/><strong>Site görselleri</strong><span>{selectedProject?.images.length ?? 0}</span></div>
        <p className="effects-assets-note">Sitedeki kaynak görseller ve efekt bağlantıları</p>
        <div className="effects-assets-list">
          {selectedProject?.images.map(image => (
            <button type="button" key={image.id} className={"effects-asset" + (selected === image.id ? " is-active" : "")}
              onClick={() => void choose(image.id)} disabled={!image.available}>
              <span className="effects-asset-symbol"><ImageIcon size={18}/></span>
              <span className="effects-asset-copy"><strong title={image.name}>{image.name}</strong>
                <small>{image.width} × {image.height}</small>
                <em className={image.canPublish ? "is-bound" : ""}>{image.canPublish ? "Yayın bağlantılı" : image.bindingStatus === "staged" ? "Yerelde hazır · deploy bekliyor" : "Önce bağlantı gerekli"}</em>
              </span>
            </button>
          ))}
          {!selectedProject?.images.length && <div className="effects-empty-assets"><Link2Off size={22}/>
            <p>{selectedProject?.note || "Bu sitenin kaynaklarında kullanılabilir bir görsel bulunamadı."}</p></div>}
        </div>
        {target?.sourcePath && <p className="effects-source" title={target.sourcePath}>Kaynak: {target.sourcePath}</p>}
      </aside>
      <section className="effects-stage" aria-label="Efekt düzenleyici">
        <iframe ref={frame} title="Canlı efekt düzenleyici"
          src="./effect-studio/index.html?embedded=1"
          onLoad={() => frame.current?.contentWindow?.postMessage({ type: "studio:hello" }, "*")}
        />
        {(!loaded || !selected) && <div className="effects-loading">{error || (selected ? status : "Bir görsel seçilmesini bekliyor.")}</div>}
      </section>
    </div>
    {stagedImage && selectedProject ? (
      <section className="effects-activation" aria-label="İlk etkinleştirme">
        <div className="effects-activation-copy">
          <span className="effects-activation-icon"><CheckCircle2 size={16} /></span>
          <div>
            <strong>İlk etkinleştirme yerelde hazır</strong>
            <p>
              <b>{stagedImage.name}</b> için sahne ve <code>effects-manifest.json</code> site
              kaynaklarında. Canlı site henüz değişmedi.
              {selected !== stagedImage.id ? (
                <button type="button" className="effects-inline-action" onClick={() => void choose(stagedImage.id)}>
                  Görsele dön
                </button>
              ) : null}
            </p>
            <small>
              {mappedDeployTarget
                ? "Bu düğme yalnız Deploy ekranını açar; ön kontrol veya canlı yayın başlatmaz."
                : "Site kaynakları hazır; canlıya almak için sitenin kendi deployment süreci ayrıca onaylanmalı."}
            </small>
          </div>
        </div>
        {mappedDeployTarget ? (
          <button
            type="button"
            className="effects-activation-action"
            disabled={!onOpenDeploy || !mappedDeployTarget.available}
            title={mappedDeployTarget.availabilityNote}
            onClick={() => onOpenDeploy?.(mappedDeployTarget.id)}
          >
            <ExternalLink size={15} /> Deploy ekranını aç · {mappedDeployTarget.title}
          </button>
        ) : (
          <p className="effects-activation-note">
            {mappedTargetId
              ? "Eşlenen Admin Deploy hedefi bu kurulumda bulunamadı."
              : "Bu site için Admin Deploy hedefi eşlenmedi."}
          </p>
        )}
      </section>
    ) : null}
    <footer className="effects-foot">
      <div className="effects-state">
        {error ? <span className="effects-error">{error}</span> : <span><CheckCircle2 size={16} /> {status}</span>}
        <small>{target?.note || (dirty ? "Kaydedilmemiş son değişiklik var." : (selectedProject?.siteUrl || ""))}</small>
      </div>
      <div className="effects-buttons">
        <button disabled={!loaded || working} onClick={() => void save().catch(() => {})}><Save size={16}/> {working ? "İşleniyor…" : "Taslağı kaydet"}</button>
        {target && !target.canPublish && (
          <button
            className="effects-publish"
            disabled={!loaded || working || !target.canPrepare}
            title={target.canPrepare ? "Yalnız yerel site kaynaklarını hazırlar; canlı yayın başlatmaz." : "Bu görsel için yerel bağlantı hazırlığı uygun değil."}
            onClick={() => void prepare()}
          >
            <CloudUpload size={16} /> {target.bindingStatus === "staged" ? "Yerel sahneyi güncelle" : "Siteye bağlamayı hazırla"}
          </button>
        )}
        {target?.canPublish && (
          <button className="effects-publish" disabled={!loaded || working} onClick={() => void publish()}>
            <CloudUpload size={16} /> Siteye yayınla
          </button>
        )}
      </div>
    </footer>
  </div>;
}
