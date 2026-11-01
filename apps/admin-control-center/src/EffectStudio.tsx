import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CloudUpload, RefreshCw, Save, Waves } from "lucide-react";
import type { EffectScene, EffectStudioProject } from "../shared/contracts";
import "./effect-studio.css";

type StudioPacket = {
  type: string;
  requestId?: number;
  scene?: EffectScene;
  message?: string;
};
type Pending = { resolve: (value: StudioPacket) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export function EffectStudio() {
  const [projects, setProjects] = useState<EffectStudioProject[]>([]);
  const [selected, setSelected] = useState("");
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
      setProjects(data);
      setSelected((old) => old || data.flatMap((item) => item.images).find((image) => image.available)?.id || "");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("Proje listesi alınamadı.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

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
    if (!ready || !selected) return;
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

  const target = useMemo(() => projects.flatMap((project) => project.images).find((image) => image.id === selected), [projects, selected]);
  const selectedProject = useMemo(() => projects.find((project) => project.images.some((image) => image.id === selected)), [projects, selected]);

  const choose = async (newId: string) => {
    if (!newId || newId === selected) return;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    try { if (dirty) await save(); }
    catch { return; }
    setSelected(newId);
  };

  const publish = async () => {
    if (!target?.canPublish || !loaded || working) return;
    if (!window.confirm("Yalnız seçili görselin efekt sahnesi canlı siteye yüklenecek. Devam edilsin mi?")) return;
    try {
      if (autoTimer.current) clearTimeout(autoTimer.current);
      await save();
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
      <div><span className="effects-kicker"><Waves size={17} /> GÖRSEL ÇALIŞMA ALANI</span><h1>Efekt Atölyesi</h1></div>
      <div className="effects-controls">
        <label>Proje
          <select aria-label="Efekt projesi" value={selectedProject?.id || ""} onChange={(e) => {
            const first = projects.find((project) => project.id === e.target.value)?.images.find((image) => image.available);
            if (first) void choose(first.id);
          }}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label>Görsel
          <select aria-label="Efekt görseli" value={selected} onChange={(e) => void choose(e.target.value)}>
            {(selectedProject?.images || []).map((image) => <option key={image.id} value={image.id} disabled={!image.available}>{image.name}</option>)}
          </select>
        </label>
        <button className="effects-small" title="Projeleri yenile" aria-label="Projeleri yenile" onClick={() => void refresh()}><RefreshCw size={16}/></button>
      </div>
    </header>
    <div className="effects-stage">
      <iframe
        ref={frame}
        title="Canlı efekt düzenleyici"
        src="./effect-studio/index.html?embedded=1"
        onLoad={() => frame.current?.contentWindow?.postMessage({ type: "studio:hello" }, "*")}
      />
      {!loaded && <div className="effects-loading">{error || status}</div>}
    </div>
    <footer className="effects-foot">
      <div className="effects-state">
        {error ? <span className="effects-error">{error}</span> : <span><CheckCircle2 size={16} /> {status}</span>}
        <small>{target?.note || (dirty ? "Kaydedilmemiş son değişiklik var." : (selectedProject?.siteUrl || ""))}</small>
      </div>
      <div className="effects-buttons">
        <button disabled={!loaded || working} onClick={() => void save().catch(() => {})}><Save size={16}/> {working ? "İşleniyor…" : "Taslağı kaydet"}</button>
        <button className="effects-publish" disabled={!loaded || working || !target?.canPublish} onClick={() => void publish()}>
          <CloudUpload size={16} /> Siteye yükle
        </button>
      </div>
    </footer>
  </div>;
}
