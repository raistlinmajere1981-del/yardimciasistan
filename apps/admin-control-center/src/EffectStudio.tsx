import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudUpload, RefreshCw, Save, Waves } from "lucide-react";
import { effectSiteDeployTarget } from "../shared/contracts";
import type { DeploymentTargetSnapshot, EffectScene, EffectStudioProject, EffectReadiness } from "../shared/contracts";
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

export function EffectStudio() {
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
  const [readiness, setReadiness] = useState<EffectReadiness>();
  const [savedDraft, setSavedDraft] = useState(false);
  const sourceHash = useRef<string | undefined>(undefined);
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
  const target = useMemo(() => projects.flatMap((project) => project.images).find((image) => image.id === selected), [projects, selected]);

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

  // Clear old iframe replies when editor state is reset.
  useEffect(() => {
    loadToken.current++;
    activeTarget.current = "";
    setReady(false);
    setLoaded(false);
    setDirty(false);
    setError("");
    if (autoTimer.current) clearTimeout(autoTimer.current);
    for (const task of pending.current.values()) {
      clearTimeout(task.timer);
      task.reject(new Error("Düzenleyici değişti."));
    }
    pending.current.clear();
  }, []);

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
        const result = await window.adminControlCenter.saveEffectScene(targetId, packet.scene, sourceHash.current);
        if (activeTarget.current === targetId) {
          savedCount.current = revision;
          setDirty(changeCount.current !== savedCount.current);
          setStatus("Yerel taslak kaydedildi.");
          setSavedDraft(true);
          setReadiness(result.readiness);
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
    setSavedDraft(false);
    setReadiness(undefined);
    sourceHash.current = undefined;
    setError("");
    setStatus("Görsel ve sahne açılıyor…");
    changeCount.current = 0;
    savedCount.current = 0;
    void (async () => {
      try {
        const data = await window.adminControlCenter.loadEffectScene(selected);
        if (token !== loadToken.current) return;
        await request("studio:load", { scene: data.scene, previewImage: data.previewImage, previewObjects: data.previewObjects, siteSource: data.siteSource });
        if (token !== loadToken.current) return;
        activeTarget.current = selected;
        setLoaded(true);
        sourceHash.current = data.sourceHash;
        setReadiness(data.readiness);
        setSavedDraft(data.source === "draft");
        setStatus(data.message || (data.source === "draft" ? "Kayıtlı taslak açıldı." : data.source === "new" ? "Yeni sahne hazır." : "Site sahnesi açıldı."));
      } catch (e) {
        if (token !== loadToken.current) return;
        activeTarget.current = "";
        setError(e instanceof Error ? e.message : String(e));
        setStatus("Görsel açılamadı.");
      }
    })();
  }, [ready, selected, request, projects]);

  // Wait for an in-flight save and, if edits arrived meanwhile, save the latest
  // revision before switching targets or preparing/publishing a scene.
  const flushSave = useCallback(async () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    await save();
    while (saving.current) await saving.current;
    if (activeTarget.current && loaded && changeCount.current !== savedCount.current) await save();
    if (autoTimer.current) clearTimeout(autoTimer.current);
  }, [save, loaded]);

  const selectedProject = useMemo(() => projects.find(project => project.id === siteId), [projects, siteId]);
  const mappedTargetId = selectedProject ? effectSiteDeployTarget(selectedProject.id) : null;
  const mappedDeployTarget = mappedTargetId ? deployTargets.find(item => item.id === mappedTargetId) : undefined;

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

  const publish = async () => {
    if (!target || (!target.canPublish && !target.canPrepare) || !loaded || working) return;
    const firstPublication = !target.canPublish;
    if (firstPublication && !mappedDeployTarget?.available) {
      setError(mappedDeployTarget?.availabilityNote || "Bu sitenin tam site yayın bağlantısı hazır değil.");
      return;
    }
    const confirmation = firstPublication
      ? `Bu görselin ilk etkinleştirilmesi için ${mappedDeployTarget?.title} site ön kontrolü ve TAM SİTE DEPLOY işlemi yapılacak. Ardından canlı sahne ve manifest doğrulanacak. Devam edilsin mi?`
      : "Yalnız seçili görselin efekt sahnesi canlı siteye yüklenecek. Devam edilsin mi?";
    if (!window.confirm(confirmation)) return;
    try {
      await flushSave();
      setWorking(true);
      setStatus(firstPublication ? "İlk yayın için site ön kontrolü hazırlanıyor…" : "Sahne siteye yükleniyor…");
      const result = await window.adminControlCenter.publishEffectScene(selected);
      setStatus(result.message);
      setError("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("Yayın başarısız.");
    } finally { setWorking(false); }
  };

  useEffect(() => {
    if (!working) return;
    return window.adminControlCenter.onDeploymentRunState?.(state => {
      if (!state.running) return;
      setStatus("İlk yayın · " + (state.stage || "Site deploy sürüyor…"));
    });
  }, [working]);

  const publishBlocked = !loaded ? "Önce görselin açılmasını bekleyin."
    : working ? "Devam eden işlemin tamamlanmasını bekleyin."
      : !target?.canPublish && !target?.canPrepare ? target?.note || "Bu görselin yayın bağlantısı hazır değil."
        : !target?.canPublish && !mappedDeployTarget?.available ? mappedDeployTarget?.availabilityNote || "Bu proje için tam site yayın hedefi hazır değil."
          : "";
  const publicationTitle = target?.canPublish ? "Yalnız seçili efekt sahnesi aktarılır ve canlı doğrulanır."
    : target?.canPrepare ? "İlk yayın: tam site ön kontrolü, deploy ve canlı sahne/manifest doğrulaması gerekir. " + (publishBlocked || "Yayın öncesinde onayınız istenir.")
      : target?.note || "Bu görsel yalnız yerel taslak olarak düzenlenebilir.";
  const publicationLabel = target?.canPublish ? "Yayın bağlantılı" : target?.canPrepare ? "İlk yayın bekliyor" : "Yerel taslak";
  const saveTitle = !loaded ? "Önce düzenleyicinin açılmasını bekleyin." : working ? "Devam eden işlemin tamamlanmasını bekleyin."
    : dirty ? "Son değişiklikleri yerel taslağa kaydet." : "Yerel taslak kaydedildi; yeniden kaydedebilirsiniz.";
  const statusText = error || (!selected ? "Uygun görsel yok." : dirty ? "Kaydedilmemiş değişiklikler · " + status : status);

  return <div className="effects-screen">
    <header className="effects-head" aria-label="Efekt çalışma alanı işlemleri">
      <h1 className="effects-heading" title="Efekt Atölyesi"><Waves size={16} aria-hidden="true"/> Efekt Atölyesi</h1>
      <div className="effects-controls">
        <label>Proje
          <select aria-label="Efekt projesi" title={selectedProject?.name || "Proje seçin"} value={siteId} onChange={(event) => void chooseSite(event.target.value)}>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label>Görsel
          <select aria-label="Efekt görseli" title={target?.name || "Bu projede uygun görsel yok"}
            value={selectedProject?.images.some(image => image.id === selected) ? selected : ""}
            onChange={event => void choose(event.target.value)} disabled={!selectedProject?.images.length}>
            {!selectedProject?.images.length && <option value="">Uygun görsel yok</option>}
            {selectedProject?.images.map(image => <option key={image.id} value={image.id} disabled={!image.available}>{image.name}</option>)}
          </select>
        </label>
        <button className="effects-small" title="Projeleri ve görselleri yenile" aria-label="Siteleri ve görselleri yenile"
          onClick={() => void (async () => { if (dirty || saving.current) await flushSave(); await refresh(); })().catch(() => {})}><RefreshCw size={15}/></button>
      </div>
      {target && <span className="effects-publication" title={publicationTitle}>{publicationLabel}</span>}
      <div className="effects-buttons">
        <button disabled={!loaded || working} title={saveTitle} onClick={() => void save().catch(() => {})}><Save size={15}/> {working ? "İşleniyor…" : "Kaydet"}</button>
        {target && <button className="effects-publish" disabled={Boolean(publishBlocked)} title={publishBlocked || publicationTitle}
          onClick={() => void publish()}><CloudUpload size={15}/> Siteye yayınla</button>}
      </div>
    </header>
    <div className={"effects-state" + (error ? " effects-error" : "")} role="status" aria-live="polite" aria-atomic="true" title={statusText}>
      {statusText}
    </div>
    <div className="effects-body">
      <section className="effects-stage" aria-label="Efekt düzenleyici" aria-busy={!loaded && Boolean(selected)}>
        <iframe ref={frame} title="Fotoğraf efekt düzenleyicisi"
          src="./effect-studio/index.html?embedded=1"
          onLoad={() => {
            setReady(false);
            frame.current?.contentWindow?.postMessage({ type: "studio:hello" }, "*");
          }}
        />
        {(!loaded || !selected) && <div className="effects-loading">{error || (!selected ? selectedProject?.note || "Bir görsel seçin." : "")}</div>}
      </section>
    </div>
  </div>;
}
