import {
  Activity,
  CheckCircle2,
  CloudUpload,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  FlaskConical,
  Waves,
  GitBranch,
  Globe2,
  Home,
  KeyRound,
  LifeBuoy,
  PackageCheck,
  Play,
  RefreshCw,
  Rocket,
  Save,
  Server,
  Settings,
  ShieldCheck,
  Square,
  Timer,
  Trash2,
  TriangleAlert,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CREDENTIAL_FIELDS, deployTargetScopeNote } from "../shared/contracts";
import { EffectStudio } from "./EffectStudio";
import type {
  DependencyUpdateReport,
  CredentialField,
  DeploymentRunState,
  DeploymentTargetSnapshot,
  HealthCheckSnapshot,
  InstallationSnapshot,
  OverviewSnapshot,
  ReleaseOperationState,
  StatusKind,
  SupportReportDetail,
  SupportReportListItem,
  SupportReportStatus,
  SystemEnvironmentSnapshot,
  VerificationHistoryItem,
  VerificationRunState
} from "../shared/contracts";

type Section = "overview" | "installations" | "release" | "tests" | "deploy" | "effects" | "support" | "system";

function normalizeVerificationRunState(state: VerificationRunState): VerificationRunState {
  return { ...state, totalPlanned: state.totalPlanned ?? 0, checks: Array.isArray(state.checks) ? state.checks : [] };
}

// Android screen checks are separate from unattended verification presets:
// isolated native fixture, archived browser parity, and real Companion flows.
const ANDROID_SCREEN_CHECKS = new Set([
  "android-native-ui-family",
  "android-ui-parity-v16",
  "android-companion-device-ui",
  "android-companion-commerce-device-ui"
]);
const ANDROID_SCREEN_LABELS: Record<string, string> = {
  "android-native-ui-family": "Hızlı native ekran testi · izole APK",
  "android-ui-parity-v16": "V16 tasarım ekranları · tarayıcı",
  "android-companion-device-ui": "Gerçek Companion · cihaz arayüzü",
  "android-companion-commerce-device-ui": "Gerçek Companion · ticari işlemler"
};

const NAV_ITEMS: Array<{ id: Section; label: string; icon: typeof Home }> = [
  { id: "overview", label: "Genel Bakış", icon: Home },
  { id: "installations", label: "Kurulumlar", icon: Server },
  { id: "release", label: "Release", icon: Rocket },
  { id: "tests", label: "Testler", icon: FlaskConical },
  { id: "deploy", label: "Deploy", icon: CloudUpload },
  { id: "effects", label: "Efekt Atölyesi", icon: Waves },
  { id: "support", label: "Destek", icon: LifeBuoy },
  { id: "system", label: "Sistem", icon: Settings }
];

function statusLabel(status: StatusKind) {
  if (status === "ready") return "Sağlıklı";
  if (status === "warning") return "Dikkat";
  if (status === "error") return "Hata";
  if (status === "unconfigured") return "Yapılandırılmamış";
  return "Bilinmiyor";
}

function statusClass(status: StatusKind) {
  return `status status--${status}`;
}

function credentialLabel(status: InstallationSnapshot["credentialStatus"]) {
  if (status === "configured") return "Kayıtlı";
  if (status === "unreadable") return "Okunamadı";
  return "Yapılandırılmamış";
}

function Overview({
  data,
  refreshing,
  onRefresh
}: {
  data: OverviewSnapshot;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const repoTone: StatusKind = data.repo.dirtyCount === 0 ? "ready" : "warning";
  const healthyText = `${data.counts.healthy} / ${data.counts.installations}`;
  const [ops, setOps] = useState<{
    loading: boolean;
    fullVerify: VerificationHistoryItem | null;
    openSupport: number | null;
    androidDevices: number | null;
    lastOperation: string;
    lastOperationTone: StatusKind;
  }>({
    loading: true,
    fullVerify: null,
    openSupport: null,
    androidDevices: null,
    lastOperation: "",
    lastOperationTone: "unknown"
  });

  useEffect(() => {
    let active = true;

    void Promise.allSettled([
      window.adminControlCenter.getVerificationHistory(30),
      window.adminControlCenter.listSupportReports(120),
      window.adminControlCenter.getSystemEnvironment(),
      window.adminControlCenter.getDeploymentRunState(),
      window.adminControlCenter.getReleaseOperationState()
    ]).then(([historyResult, supportResult, systemResult, deployResult, releaseResult]) => {
      if (!active) return;

      const history = historyResult.status === "fulfilled" ? historyResult.value : [];
      const fullVerify = history.find((item) =>
        item.result === "passed"
        && ["preset=full", "preset=pre-main", "preset=release"].includes(item.selectionLabel)
      ) ?? null;

      const support = supportResult.status === "fulfilled" ? supportResult.value : null;
      const environment = systemResult.status === "fulfilled" ? systemResult.value : null;
      const deployState = deployResult.status === "fulfilled" ? deployResult.value : null;
      const releaseState = releaseResult.status === "fulfilled" ? releaseResult.value : null;

      const operations = [
        deployState?.startedAt ? {
          label: deployState.running
            ? `Deploy · ${deployState.stage || deployState.targetId}`
            : `Deploy · ${deployState.result}`,
          time: deployState.finishedAt || deployState.startedAt,
          tone: deployState.running ? "warning" as StatusKind
            : deployState.result === "passed" ? "ready" as StatusKind
              : deployState.result === "failed" ? "error" as StatusKind
                : "unknown" as StatusKind
        } : null,
        releaseState?.startedAt ? {
          label: releaseState.running
            ? `Release · ${releaseState.stage}`
            : `Release · ${releaseState.result}`,
          time: releaseState.finishedAt || releaseState.startedAt,
          tone: releaseState.running ? "warning" as StatusKind
            : releaseState.result === "passed" ? "ready" as StatusKind
              : releaseState.result === "failed" ? "error" as StatusKind
                : "unknown" as StatusKind
        } : null
      ].filter((item): item is { label: string; time: string; tone: StatusKind } => Boolean(item))
        .sort((a, b) => b.time.localeCompare(a.time));

      setOps({
        loading: false,
        fullVerify,
        openSupport: support ? support.filter((item) => item.status !== "resolved").length : null,
        androidDevices: environment?.androidDevices.length ?? null,
        lastOperation: operations[0]?.label ?? "Bu oturumda işlem yok",
        lastOperationTone: operations[0]?.tone ?? "unknown"
      });
    });

    return () => {
      active = false;
    };
  }, []);

  const fullVerifyCurrent = ops.fullVerify
    ? ops.fullVerify.head === data.repo.head && ops.fullVerify.dirtyCount === 0
    : false;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">OPERASYON MERKEZİ</p>
          <h1>Genel Bakış</h1>
          <p className="page-subtitle">Repo, sürümler ve canlı kurulumların gerçek zamanlı özeti.</p>
        </div>
        <button className="button button--secondary" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={17} className={refreshing ? "spin" : ""} />
          {refreshing ? "Yenileniyor" : "Yenile"}
        </button>
      </header>

      <section className="metric-grid">
        <article className="metric-card">
          <div className="metric-icon"><GitBranch size={21} /></div>
          <div>
            <span>Repo</span>
            <strong>{data.repo.branch}</strong>
            <small className={statusClass(repoTone)}>
              {data.repo.dirtyCount === 0 ? "Temiz" : `${data.repo.dirtyCount} değişiklik`}
            </small>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-icon"><PackageCheck size={21} /></div>
          <div>
            <span>Ürün sürümü</span>
            <strong>v{data.product.version}</strong>
            <small>Web v{data.product.webModuleVersion} · Companion/Bayi Android #{data.product.androidVersionCode}</small>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-icon"><Activity size={21} /></div>
          <div>
            <span>Canlı kurulumlar</span>
            <strong>{healthyText}</strong>
            <small>{data.counts.drift ? `${data.counts.drift} dikkat` : "Drift görünmüyor"}</small>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-icon"><ShieldCheck size={21} /></div>
          <div>
            <span>Durum</span>
            <strong>{data.counts.errors === 0 ? "Stabil" : `${data.counts.errors} hata`}</strong>
            <small>HEAD {data.repo.head}</small>
          </div>
        </article>
      </section>

      <section className="overview-ops-grid">
        <article className="overview-op-card">
          <span>Son başarılı doğrulama</span>
          <strong>{ops.loading ? "Okunuyor…" : ops.fullVerify ? ops.fullVerify.selectionLabel : "Kayıt yok"}</strong>
          <small className={ops.fullVerify ? statusClass(fullVerifyCurrent ? "ready" : "warning") : "status status--unknown"}>
            {ops.fullVerify
              ? fullVerifyCurrent
                ? `Mevcut HEAD · ${ops.fullVerify.head}`
                : `Eski HEAD · ${ops.fullVerify.head}`
              : "Admin üzerinden full/pre-main/release koşusu bekleniyor"}
          </small>
        </article>
        <article className="overview-op-card">
          <span>Açık destek</span>
          <strong>{ops.loading ? "…" : ops.openSupport ?? "—"}</strong>
          <small>{ops.openSupport === null ? "Destek sunucusu okunamadı" : ops.openSupport ? "İlgilenilmesi gereken rapor" : "Açık rapor yok"}</small>
        </article>
        <article className="overview-op-card">
          <span>Android / ADB</span>
          <strong>{ops.loading ? "…" : ops.androidDevices ?? "—"}</strong>
          <small>{ops.androidDevices === null ? "Ortam bilgisi okunamadı" : ops.androidDevices ? "Bağlı cihaz" : "Bağlı cihaz yok"}</small>
        </article>
        <article className="overview-op-card">
          <span>Son operasyon</span>
          <strong>{ops.loading ? "Okunuyor…" : ops.lastOperation}</strong>
          <small className={statusClass(ops.lastOperationTone)}>
            {ops.lastOperationTone === "ready" ? "Tamamlandı" : ops.lastOperationTone === "error" ? "Başarısız" : ops.lastOperationTone === "warning" ? "Çalışıyor / dikkat" : "Oturum kaydı yok"}
          </small>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel panel--wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">KURULUMLAR</p>
              <h2>Sistem durumu</h2>
            </div>
            <span className="quiet">
              {new Date(data.generatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          <div className="installation-list">
            {data.installations.map((installation) => (
              <div className="installation-row" key={installation.id}>
                <div className="installation-title">
                  <span className="installation-dot" data-status={installation.status} />
                  <div>
                    <strong>{installation.title}</strong>
                    <small>{installation.kind}</small>
                  </div>
                </div>

                <div className="installation-version">
                  <span className={statusClass(installation.status)}>{statusLabel(installation.status)}</span>
                  <small>
                    {installation.liveWebVersion
                      ? `canlı v${installation.liveWebVersion}`
                      : installation.versionEndpoint
                        ? "canlı sürüm alınamadı"
                        : "sürüm endpoint'i yok"}
                  </small>
                </div>

                <div className="installation-credential">
                  <span>Credential</span>
                  <strong>{installation.deployType === "ssh-rsync" && installation.credentialStatus === "unconfigured" ? "SSH config/agent" : credentialLabel(installation.credentialStatus)}</strong>
                </div>

                <button
                  className="text-button"
                  disabled={!installation.siteUrl}
                  onClick={() => void (installation.siteUrl && window.adminControlCenter.openExternal(installation.siteUrl))}
                >
                  Aç
                </button>
              </div>
            ))}
          </div>
        </article>

        <aside className="panel insight-panel">
          <div className="insight-orb">N</div>
          <p className="panel-kicker">NEXA ÖZETİ</p>
          <h2>
            {data.counts.errors > 0
              ? "Dikkat isteyen sistem var."
              : data.counts.drift > 0
                ? "Sürüm farkı tespit edildi."
                : "Temel sistemler uyumlu."}
          </h2>
          <p>
            {data.counts.errors > 0
              ? `${data.counts.errors} kurulum canlı kontrolde hata verdi.`
              : data.counts.drift > 0
                ? `${data.counts.drift} kurulum beklenen web sürümünden farklı görünüyor.`
                : "Canonical kurulum kayıtları ve erişilebilen canlı sürümler arasında belirgin bir sorun görünmüyor."}
          </p>
          <div className="insight-footer">
            <ShieldCheck size={18} />
            Secret değerleri renderer'a aktarılmıyor.
          </div>
        </aside>
      </section>
    </>
  );
}

function HealthRow({ check }: { check: HealthCheckSnapshot }) {
  const label = check.id === "version" && check.status === "unknown" ? "İzlenmiyor" : statusLabel(check.status);
  return (
    <div className="health-row">
      <span className="health-dot" data-status={check.status} />
      <div className="health-copy">
        <strong>{check.label}</strong>
        <small>{check.detail}</small>
      </div>
      <div className="health-tail">
        <span className={statusClass(check.status)}>{label}</span>
        {check.durationMs !== null ? <small>{check.durationMs} ms</small> : null}
      </div>
    </div>
  );
}

function LiveConsole({
  lines,
  className,
  emptyText
}: {
  lines: string[];
  className: string;
  emptyText: string;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const followAfterRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const scheduleFollow = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const remaining = Math.max(0, followAfterRef.current - Date.now());
    timerRef.current = window.setTimeout(() => {
      const element = elementRef.current;
      if (Date.now() < followAfterRef.current) {
        scheduleFollow();
      } else if (element) {
        element.scrollTop = element.scrollHeight;
      }
    }, remaining);
  }, []);

  useEffect(() => {
    scheduleFollow();
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [lines, scheduleFollow]);

  function pauseFollow() {
    followAfterRef.current = Date.now() + 3000;
    scheduleFollow();
  }

  return (
    <div
      ref={elementRef}
      className={className}
      tabIndex={0}
      onWheel={pauseFollow}
      onPointerDown={pauseFollow}
      onTouchMove={pauseFollow}
      onKeyDown={(event) => {
        if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) pauseFollow();
      }}
      aria-live="off"
    >
      {lines.length
        ? lines.map((line, index) => <div key={`${index}:${line}`}>{line}</div>)
        : <div>{emptyText}</div>}
    </div>
  );
}

function InstallationCredentials({ installation, onRefresh }: { installation: InstallationSnapshot; onRefresh: () => void }) {
  const [fields, setFields] = useState<Partial<Record<CredentialField, string>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<CredentialField, string>>>({});
  const [visible, setVisible] = useState<Partial<Record<CredentialField, boolean>>>({});
  const [busyField, setBusyField] = useState<CredentialField | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setFields({});
    setDrafts({});
    setVisible({});
    setLoaded(false);
    setChecking(false);
    setNotice("");

    if (!installation.credentialRef) {
      setLoaded(true);
      return () => { active = false; };
    }
    void (async () => {
      try {
        const local = await window.adminControlCenter.getInstallationCredentials(installation.id);
        if (!active) return;
        setFields(local.fields);
        setDrafts(local.fields);
        setLoaded(true);
        if (!installation.webModuleUrl) return;

        setChecking(true);
        const result = await window.adminControlCenter.syncInstallationCredential(installation.id);
        if (!active) return;
        setNotice(result.message);
        if (result.ok) {
          const refreshed = await window.adminControlCenter.getInstallationCredentials(installation.id);
          if (!active) return;
          setFields(refreshed.fields);
          setDrafts(refreshed.fields);
          if (result.changed) onRefresh();
        }
      } catch {
        if (active) setNotice("Anahtar bilgileri okunamadı; yerel kayıt korunuyor.");
      } finally {
        if (active) { setChecking(false); setLoaded(true); }
      }
    })();
    return () => { active = false; };
  }, [installation.id, installation.credentialRef, installation.webModuleUrl]);

  async function refreshSecret() {
    setChecking(true);
    setNotice("");
    try {
      const result = await window.adminControlCenter.syncInstallationCredential(installation.id);
      setNotice(result.message);
      if (result.ok) {
        const refreshed = await window.adminControlCenter.getInstallationCredentials(installation.id);
        setFields(refreshed.fields);
        setDrafts(refreshed.fields);
        setVisible({});
        if (result.changed) onRefresh();
      }
    } catch {
      setNotice("Eşitleme yapılamadı; yerel anahtar korunuyor.");
    } finally {
      setChecking(false);
    }
  }

  async function save(field: CredentialField) {
    setBusyField(field);
    try {
      const result = await window.adminControlCenter.saveInstallationCredential(installation.id, field, drafts[field] ?? "");
      setNotice(result.message);
      if (result.ok) {
        const refreshed = await window.adminControlCenter.getInstallationCredentials(installation.id);
        setFields(refreshed.fields);
        setDrafts(refreshed.fields);
      }
    } catch {
      setNotice("Yerel kayıt değiştirilemedi.");
    } finally {
      setBusyField(null);
    }
  }

  const displayedFields = CREDENTIAL_FIELDS.filter((field) => installation.id === "blacksea"
    ? field.id !== "sshIdentityFile"
    : field.id === "syncSecret" || field.id === "sshIdentityFile")
    .filter((field) => (field.id === "syncSecret" && Boolean(installation.webModuleUrl))
      || Boolean(fields[field.id]));

  return (
    <section className="panel credential-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">YEREL KAYIT · CANLI KONTROL</p>
          <h2>Web bağlantı anahtarı</h2>
        </div>
        <div className="credential-header-actions">
          <span className="quiet">{installation.credentialRef ?? "Credential referansı yok"}</span>
          {installation.webModuleUrl ? (
            <button className="button button--secondary button--compact" disabled={checking || !loaded} onClick={() => void refreshSecret()}>
              <RefreshCw size={15} />{checking ? "Kontrol ediliyor" : "Sunucudan yenile"}
            </button>
          ) : null}
        </div>
      </div>
      {!installation.credentialRef ? <p className="credential-note">Bu kurulum için anahtar kaydı tanımlanmamış.</p> : null}
      {installation.credentialRef && !loaded ? <p className="credential-note">Yerel kayıt okunuyor…</p> : null}
      {installation.credentialRef && loaded ? <div className="credential-list">
        {displayedFields.map((field) => {
          const saved = fields[field.id] ?? "";
          const manual = installation.id === "blacksea" && field.id === "syncSecret";
          const draft = manual ? drafts[field.id] ?? "" : saved;
          return <div className="credential-row" key={field.id}>
            <label htmlFor={`credential-${installation.id}-${field.id}`}>{field.label}</label>
            <input
              id={`credential-${installation.id}-${field.id}`}
              type={field.secret && !visible[field.id] ? "password" : "text"}
              autoComplete="off"
              value={draft}
              readOnly={!manual}
              placeholder={checking ? "Sunucudan okunuyor…" : manual ? "BlackSea anahtarını girin" : "Henüz anahtar okunamadı"}
              onChange={manual ? (event) => setDrafts((current) => ({ ...current, [field.id]: event.target.value })) : undefined}
            />
            {saved ? <button className="button button--secondary button--compact" title={visible[field.id] ? "Gizle" : "Göster"} onClick={() => setVisible((current) => ({ ...current, [field.id]: !current[field.id] }))}>
              {visible[field.id] ? <EyeOff size={15} /> : <Eye size={15} />}{visible[field.id] ? "Gizle" : "Göster"}
            </button> : <span />}
            {saved ? <button className="button button--secondary button--compact" title="Kopyala" onClick={() => void window.adminControlCenter.copyInstallationCredential(installation.id, field.id).then((ok) => setNotice(ok ? "Panoya kopyalandı." : "Kopyalanamadı."))}>
              <Copy size={15} />Kopyala
            </button> : <span />}
            {manual ? <button className="button button--secondary button--compact" disabled={!draft.trim() || draft === saved || busyField === field.id || checking} onClick={() => void save(field.id)}>
              <Save size={15} />{busyField === field.id ? "Kaydediliyor" : saved ? "Değiştir" : "Kaydet"}
            </button> : <span />}
          </div>;
        })}
        {!installation.webModuleUrl && !displayedFields.length ? (
          <p className="credential-note">Bu kurulumun web bağlantı anahtarı yok; SSH erişimi işletim sistemi tarafından yönetiliyor.</p>
        ) : null}
      </div> : null}
      {checking ? <p className="credential-note" role="status">Sunucudaki anahtar kontrol ediliyor; kayıtlı değer bu sırada değişmez.</p> : null}
      {notice ? <p className="credential-note" role="status">{notice}</p> : null}
    </section>
  );
}

function Installations({
  data,
  refreshing,
  onRefresh
}: {
  data: OverviewSnapshot;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [selectedId, setSelectedId] = useState(data.installations[0]?.id ?? "");

  useEffect(() => {
    if (!data.installations.some((item) => item.id === selectedId)) {
      setSelectedId(data.installations[0]?.id ?? "");
    }
  }, [data.installations, selectedId]);

  const selected = data.installations.find((item) => item.id === selectedId) ?? data.installations[0];

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">CANLI SİSTEMLER</p>
          <h1>Kurulumlar</h1>
          <p className="page-subtitle">
            Kurulum kayıtları, canlı health kontrolleri ve sürüm durumları tek yerde.
          </p>
        </div>
        <button className="button button--secondary" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={17} className={refreshing ? "spin" : ""} />
          {refreshing ? "Kontrol ediliyor" : "Tümünü Kontrol Et"}
        </button>
      </header>

      <section className="installations-layout">
        <aside className="installation-picker">
          <div className="picker-heading">
            <div>
              <p className="panel-kicker">KAYITLAR</p>
              <strong>{data.installations.length} kurulum</strong>
            </div>
            <span>{data.counts.healthy} sağlıklı</span>
          </div>

          <div className="picker-list">
            {data.installations.map((installation) => (
              <button
                key={installation.id}
                className={installation.id === selected?.id ? "picker-item picker-item--active" : "picker-item"}
                onClick={() => setSelectedId(installation.id)}
              >
                <span className="installation-dot" data-status={installation.status} />
                <span className="picker-copy">
                  <strong>{installation.title}</strong>
                  <small>{installation.kind}</small>
                </span>
                <span className={statusClass(installation.status)}>{statusLabel(installation.status)}</span>
              </button>
            ))}
          </div>
        </aside>

        {selected ? (
          <div className="installation-detail">
            <section className="panel installation-hero">
              <div className="installation-hero-main">
                <div className="installation-hero-icon"><Server size={24} /></div>
                <div>
                  <div className="installation-hero-title">
                    <h2>{selected.title}</h2>
                    <span className={statusClass(selected.status)}>{statusLabel(selected.status)}</span>
                  </div>
                  <p>{selected.statusNote}</p>
                </div>
              </div>

              <div className="installation-actions">
                <button
                  className="button button--secondary"
                  disabled={!selected.siteUrl}
                  onClick={() => void (selected.siteUrl && window.adminControlCenter.openExternal(selected.siteUrl))}
                >
                  <Globe2 size={16} />
                  Siteyi Aç
                </button>
                <button
                  className="button button--secondary"
                  disabled={!selected.webModuleUrl}
                  onClick={() => void (selected.webModuleUrl && window.adminControlCenter.openExternal(selected.webModuleUrl))}
                >
                  <ExternalLink size={16} />
                  Web Modülü
                </button>
              </div>
            </section>

            <section className="installation-summary-grid">
              <article className="summary-card">
                <span>Canlı web</span>
                <strong>{selected.liveWebVersion ? `v${selected.liveWebVersion}` : "—"}</strong>
                <small>Beklenen {selected.expectedWebVersion ? `v${selected.expectedWebVersion}` : "tanımlı değil"}</small>
              </article>
              <article className="summary-card">
                <span>Credential</span>
                <strong>{selected.deployType === "ssh-rsync" && selected.credentialStatus === "unconfigured" ? "SSH config/agent" : credentialLabel(selected.credentialStatus)}</strong>
                <small>{selected.deployType === "ssh-rsync" && selected.credentialStatus === "unconfigured" ? "İşletim sistemi kimlik doğrulaması" : selected.credentialRef ?? "Referans yok"}</small>
              </article>
              <article className="summary-card">
                <span>Deploy tipi</span>
                <strong>{selected.deployType ?? "—"}</strong>
                <small>{selected.deployHost ?? "Harici/yerel adapter"}</small>
              </article>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">READ-ONLY HEALTH</p>
                  <h2>Bağlantı ve sürüm kontrolleri</h2>
                </div>
                <span className="quiet">
                  {new Date(data.generatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
              <div className="health-list">
                {selected.healthChecks.map((check) => <HealthRow key={check.id} check={check} />)}
              </div>
            </section>

            <InstallationCredentials installation={selected} onRefresh={onRefresh} />

            <section className="panel installation-metadata">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">CANONICAL METADATA</p>
                  <h2>Kurulum bilgileri</h2>
                </div>
              </div>

              <div className="metadata-grid">
                <div>
                  <span>Site</span>
                  <strong>{selected.siteUrl ?? "—"}</strong>
                </div>
                <div>
                  <span>Web modülü</span>
                  <strong>{selected.webModuleUrl ?? "—"}</strong>
                </div>
                <div>
                  <span>Sürüm endpoint'i</span>
                  <strong>{selected.versionEndpoint ?? "—"}</strong>
                </div>
                <div>
                  <span>Deploy hedefi</span>
                  <strong>{selected.deployTarget ?? "—"}</strong>
                </div>
              </div>

            </section>
          </div>
        ) : (
          <div className="loading-card">Kurulum kaydı bulunamadı.</div>
        )}
      </section>
    </>
  );
}

function nextPatchVersion(value: string) {
  const parts = value.split(".").map(Number);
  return parts.length === 3 && parts.every(Number.isSafeInteger)
    ? `${parts[0]}.${parts[1]}.${parts[2]! + 1}`
    : "";
}

function Release({
  data,
  refreshing,
  onRefresh
}: {
  data: OverviewSnapshot;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const webInstallations = data.installations.filter((item) => item.versionEndpoint);
  const publishedDesktop = data.release.desktop.filter((item) => item.status === "ready").length;
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmVersion, setConfirmVersion] = useState(false);
  const [versionInput, setVersionInput] = useState(() => nextPatchVersion(data.product.version));
  const [updateWebModule, setUpdateWebModule] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setVersionInput(nextPatchVersion(data.product.version));
    setConfirmVersion(false);
  }, [data.product.version]);
  const [verifyRun, setVerifyRun] = useState<VerificationRunState>({
    totalPlanned: 0,
    checks: [],
    running: false,
    selectionLabel: "",
    startedAt: null,
    finishedAt: null,
    result: "idle",
    exitCode: null,
    outputTail: []
  });
  const [releaseRun, setReleaseRun] = useState<ReleaseOperationState>({
    running: false,
    action: "",
    stage: "",
    startedAt: null,
    finishedAt: null,
    result: "idle",
    exitCode: null,
    outputTail: []
  });

  useEffect(() => {
    let active = true;
    let previousVerify = false;
    let previousRelease = false;

    void Promise.all([
      window.adminControlCenter.getVerificationRunState(),
      window.adminControlCenter.getReleaseOperationState()
    ]).then(([verificationState, releaseState]) => {
      if (!active) return;
      previousVerify = verificationState.running;
      previousRelease = releaseState.running;
      setVerifyRun(verificationState);
      setReleaseRun(releaseState);
    });

    const unsubscribeVerify = window.adminControlCenter.onVerificationRunState((state) => {
      if (!active) return;
      const justFinished = previousVerify && !state.running;
      previousVerify = state.running;
      setVerifyRun(state);
      if (justFinished) onRefresh();
    });

    const unsubscribeRelease = window.adminControlCenter.onReleaseOperationState((state) => {
      if (!active) return;
      const justFinished = previousRelease && !state.running;
      previousRelease = state.running;
      setReleaseRun(state);
      if (justFinished) {
        setConfirmPublish(false);
        onRefresh();
      }
    });

    return () => {
      active = false;
      unsubscribeVerify();
      unsubscribeRelease();
    };
  }, [onRefresh]);

  const busy = verifyRun.running || releaseRun.running;
  const latestIsRelease = data.verification.latest.selectionLabel === "preset=release";
  const verificationTone: StatusKind = verifyRun.running
    ? "warning"
    : latestIsRelease && data.verification.latest.result === "passed"
      ? "ready"
      : latestIsRelease && data.verification.latest.result === "failed"
        ? "error"
        : "unknown";

  const packageTone: StatusKind = releaseRun.action === "package"
    ? releaseRun.result === "passed"
      ? "ready"
      : releaseRun.result === "failed"
        ? "error"
        : releaseRun.result === "running"
          ? "warning"
          : "unknown"
    : "unknown";

  const publishTone: StatusKind = publishedDesktop === data.release.desktop.length && publishedDesktop > 0
    ? "ready"
    : "warning";

  const liveTone: StatusKind = webInstallations.every((item) => item.status === "ready")
    ? "ready"
    : webInstallations.some((item) => item.status === "error")
      ? "error"
      : "warning";

  const startVerify = useCallback(async () => {
    setMessage("");
    const result = await window.adminControlCenter.startVerification({ mode: "preset", value: "release" });
    setMessage(result.message);
  }, []);

  const prepareVersion = useCallback(async () => {
    setConfirmVersion(false);
    setMessage("");
    const result = await window.adminControlCenter.startReleaseOperation({
      action: "version", version: versionInput.trim(), updateWebModule
    });
    setMessage(result.message);
  }, [versionInput, updateWebModule]);

  const startReleaseAction = useCallback(async (action: "package" | "preview" | "publish") => {
    setMessage("");
    const result = await window.adminControlCenter.startReleaseOperation({ action });
    setMessage(result.message);
    if (result.accepted) setConfirmPublish(false);
  }, []);

  const cancelCurrent = useCallback(async () => {
    if (verifyRun.running) {
      await window.adminControlCenter.cancelVerification();
      return;
    }
    if (releaseRun.running) await window.adminControlCenter.cancelReleaseOperation();
  }, [releaseRun.running, verifyRun.running]);

  const activeOutput = verifyRun.running || (verifyRun.result !== "idle" && releaseRun.result === "idle")
    ? verifyRun
    : releaseRun;
  const activeOutputTone: StatusKind = activeOutput.result === "passed"
    ? "ready"
    : activeOutput.result === "failed"
      ? "error"
      : activeOutput.result === "running"
        ? "warning"
        : activeOutput.result === "cancelled"
          ? "warning"
          : "unknown";

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">SÜRÜM AKIŞI</p>
          <h1>Release</h1>
          <p className="page-subtitle">
            Kaynak, doğrulama, paketleme, yayın ve canlı kontrol tek akışta izlenir.
          </p>
        </div>
        <div className="verification-header-actions">
          {busy ? (
            <button className="button button--danger" onClick={() => void cancelCurrent()}>
              <Square size={16} />
              İşlemi İptal Et
            </button>
          ) : null}
          <button className="button button--secondary" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={17} className={refreshing ? "spin" : ""} />
            {refreshing ? "Kontrol ediliyor" : "Yayını Kontrol Et"}
          </button>
        </div>
      </header>

      <section className="release-pipeline">
        <article className="release-stage release-stage--source">
          <span>1</span>
          <div>
            <small>KAYNAK</small>
            <strong>v{data.product.version}</strong>
            <p>{data.repo.branch} · {data.repo.head}</p>
          </div>
        </article>
        <article className="release-stage">
          <span>2</span>
          <div>
            <small>DOĞRULAMA</small>
            <strong>{statusLabel(verificationTone)}</strong>
            <p>{verifyRun.running ? "Release verify çalışıyor" : latestIsRelease ? data.verification.latest.selectionLabel : "Release verify bekleniyor"}</p>
          </div>
        </article>
        <article className="release-stage">
          <span>3</span>
          <div>
            <small>PAKETLER</small>
            <strong>{statusLabel(packageTone)}</strong>
            <p>{releaseRun.action === "package" ? releaseRun.stage || "Paketleniyor" : "Bu oturumda çalıştırılmadı"}</p>
          </div>
        </article>
        <article className="release-stage">
          <span>4</span>
          <div>
            <small>YAYIN</small>
            <strong>{publishedDesktop} / {data.release.desktop.length}</strong>
            <p>Desktop manifest güncel</p>
          </div>
        </article>
        <article className="release-stage">
          <span>5</span>
          <div>
            <small>CANLI KONTROL</small>
            <strong>{statusLabel(liveTone)}</strong>
            <p>{webInstallations.filter((item) => item.status === "ready").length} / {webInstallations.length} web modülü uyumlu</p>
          </div>
        </article>
      </section>

      <section className="panel release-actions-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">OPERASYONLAR</p>
            <h2>Release adımları</h2>
          </div>
          <span className="quiet">Her adım canonical scriptleri çalıştırır.</span>
        </div>

        <div className="release-version-preparation">
          <div className="release-version-heading">
            <div>
              <strong>1 · Yeni Sürüm Hazırla</strong>
              <small>Mevcut v{data.product.version} · Companion/Bayi Android kodu {data.product.androidVersionCode} · Web v{data.product.webModuleVersion}</small>
            </div>
            <span className="quiet">Yalnız sürüm dosyaları değişir; test ve paketleme başlamaz.</span>
          </div>
          <div className="release-version-controls">
            <label className="release-version-input">
              <span>Yeni ürün sürümü</span>
              <input aria-label="Yeni ürün sürümü" value={versionInput} disabled={busy}
                onChange={(event) => { setVersionInput(event.target.value); setConfirmVersion(false); }}
                placeholder="2.0.6" spellCheck={false}/>
            </label>
            <label className="release-version-check">
              <input type="checkbox" checked={updateWebModule} disabled={busy}
                onChange={(event) => { setUpdateWebModule(event.target.checked); setConfirmVersion(false); }}/>
              Web modülü sürümünü de eşitle
            </label>
            <button className="button button--primary" disabled={busy || !/^\d+\.\d+\.\d+$/.test(versionInput.trim())}
              onClick={() => setConfirmVersion(true)}>
              <Save size={16}/> Sürümü Hazırla
            </button>
          </div>
          {confirmVersion && !busy ? (
            <div className="release-version-confirm" role="group" aria-label="Sürüm hazırlama onayı">
              <span><strong>Onay:</strong> v{data.product.version} → v{versionInput.trim()} · Companion/Bayi Android kodu {data.product.androidVersionCode + 1}
                {" · "}Web modülü {updateWebModule ? `v${versionInput.trim()}` : `v${data.product.webModuleVersion} (değişmez)`}</span>
              <div className="release-version-confirm-actions">
                <button className="button button--secondary" onClick={() => setConfirmVersion(false)}>Vazgeç</button>
                <button className="button button--primary" onClick={() => void prepareVersion()}>Onayla ve Hazırla</button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="release-action-grid">
          <button className="release-action-card" disabled={busy} onClick={() => void startVerify()}>
            <FlaskConical size={22} />
            <div>
              <strong>2 · Release Check</strong>
              <small>verify:release presetini çalıştırır.</small>
            </div>
          </button>
          <button className="release-action-card" disabled={busy} onClick={() => void startReleaseAction("package")}>
            <PackageCheck size={22} />
            <div>
              <strong>3 · Paketleri Oluştur</strong>
              <small>Windows x64/x86, Companion, Bayi release APK ve temiz web modülü.</small>
            </div>
          </button>
          <button className="release-action-card" disabled={busy} onClick={() => void startReleaseAction("preview")}>
            <ShieldCheck size={22} />
            <div>
              <strong>4 · Yayın Farkını Gör</strong>
              <small>Demo, /deneme/, temiz web modülü ve kurulumlar; canlıya yazmaz.</small>
            </div>
          </button>
          <button className="release-action-card release-action-card--danger" disabled={busy} onClick={() => setConfirmPublish(true)}>
            <Rocket size={22} />
            <div>
              <strong>5 · Kurulumları Yayınla</strong>
              <small>Demo, temiz web modülü, kurulumlar ve update feed birlikte yayınlanır.</small>
            </div>
          </button>
        </div>
      </section>

      {confirmPublish && !busy ? (
        <section className="panel deployment-confirm">
          <div className="deployment-confirm-title">
            <TriangleAlert size={22} />
            <div>
              <p className="panel-kicker">RELEASE YAYIN ONAYI</p>
              <h2>Demo, web modülü ve kurulumlar temiz release olarak yayınlanacak.</h2>
            </div>
          </div>
          <div className="deployment-impact">
            <div>• Tanıtım ve /deneme/ güncellenir; web modülü temiz kurulur, eski test verileri taşınmaz.</div>
            <div>• Windows x64/x86, Companion ve Bayi release APK dosyaları atomik yüklenir.</div>
            <div>• Windows update feed’leri tüm site ve paket kontrollerinden sonra etkinleşir.</div>
            <div>• İşlem sonunda HTTP ve artifact doğrulaması çalışır.</div>
          </div>
          <div className="deployment-confirm-actions">
            <button className="button button--secondary" onClick={() => setConfirmPublish(false)}>Vazgeç</button>
            <button className="button button--danger" onClick={() => void startReleaseAction("publish")}>
              <Rocket size={16} />
              Canlıya Yayınla
            </button>
          </div>
        </section>
      ) : null}

      {activeOutput.result !== "idle" || message ? (
        <section className="panel verification-run-panel">
          <div className="verification-run-head">
            <div>
              <p className="panel-kicker">RELEASE ÇIKTISI</p>
              <div className="verification-run-title">
                <span className={statusClass(activeOutputTone)}>
                  {activeOutput.result === "running"
                    ? "Çalışıyor"
                    : activeOutput.result === "passed"
                      ? "Tamamlandı"
                      : activeOutput.result === "failed"
                        ? "Başarısız"
                        : activeOutput.result === "cancelled"
                          ? "İptal edildi"
                          : "Hazır"}
                </span>
                <strong>{"stage" in activeOutput ? activeOutput.stage || message : activeOutput.selectionLabel || message}</strong>
              </div>
            </div>
          </div>
          <div className="verification-console">
            {activeOutput.outputTail.length
              ? activeOutput.outputTail.map((line, index) => <div key={`${index}:${line}`}>{line}</div>)
              : <div>{message || "Çıktı bekleniyor…"}</div>}
          </div>
        </section>
      ) : null}

      <section className="release-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">DESKTOP UPDATE FEED</p>
              <h2>Yayın manifestleri</h2>
            </div>
            <span className={statusClass(publishTone)}>Beklenen v{data.release.expectedVersion}</span>
          </div>

          <div className="release-list">
            {data.release.desktop.length ? data.release.desktop.map((channel) => (
              <div className="release-row" key={channel.id}>
                <div className="release-row-title">
                  <PackageCheck size={18} />
                  <div>
                    <strong>{channel.label}</strong>
                    <small>{channel.detail}</small>
                  </div>
                </div>
                <div className="release-row-version">
                  <span className={statusClass(channel.status)}>{statusLabel(channel.status)}</span>
                  <strong>{channel.liveVersion ? `v${channel.liveVersion}` : "—"}</strong>
                  {channel.durationMs !== null ? <small>{channel.durationMs} ms</small> : null}
                </div>
                <button className="text-button" onClick={() => void window.adminControlCenter.openExternal(channel.manifestUrl)}>
                  Manifest
                </button>
              </div>
            )) : (
              <div className="empty-row">Desktop release manifesti tanımlı değil.</div>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">CANLI WEB</p>
              <h2>Kurulum sürümleri</h2>
            </div>
            <span className="quiet">Beklenen web v{data.product.webModuleVersion}</span>
          </div>

          <div className="release-list">
            {webInstallations.map((installation) => (
              <div className="release-row release-row--web" key={installation.id}>
                <div className="release-row-title">
                  <Globe2 size={18} />
                  <div>
                    <strong>{installation.title}</strong>
                    <small>{installation.statusNote}</small>
                  </div>
                </div>
                <div className="release-row-version">
                  <span className={statusClass(installation.status)}>{statusLabel(installation.status)}</span>
                  <strong>{installation.liveWebVersion ? `v${installation.liveWebVersion}` : "—"}</strong>
                </div>
                <button
                  className="text-button"
                  disabled={!installation.versionEndpoint}
                  onClick={() => void (installation.versionEndpoint && window.adminControlCenter.openExternal(installation.versionEndpoint))}
                >
                  Endpoint
                </button>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}

function formatAge(ageMs: number | null) {
  if (ageMs === null) return "—";
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

function Tests({
  data,
  refreshing,
  onRefresh
}: {
  data: OverviewSnapshot;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const verification = data.verification;
  const defaultPreset = verification.presets.includes("full") ? "full" : verification.presets[0] ?? "";
  const [preset, setPreset] = useState(defaultPreset);
  const [domain, setDomain] = useState("all");
  const [androidScreens, setAndroidScreens] = useState(false);
  const [runState, setRunState] = useState<VerificationRunState>({
    totalPlanned: 0,
    checks: [],
    running: false,
    selectionLabel: "",
    startedAt: null,
    finishedAt: null,
    result: "idle",
    exitCode: null,
    outputTail: []
  });
  const [runMessage, setRunMessage] = useState("");
  const [history, setHistory] = useState<VerificationHistoryItem[]>([]);
  const [expandedCheckId, setExpandedCheckId] = useState("");
  const [expandedOutput, setExpandedOutput] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await window.adminControlCenter.getVerificationHistory(20));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (preset && !verification.presets.includes(preset)) {
      setPreset(verification.presets[0] ?? "");
    }
  }, [preset, verification.presets]);

  useEffect(() => {
    let previousRunning = false;
    let active = true;
    let receivedLiveState = false;

    void window.adminControlCenter.getVerificationRunState().then((state) => {
      if (!active || receivedLiveState) return;
      previousRunning = state.running;
      setRunState(normalizeVerificationRunState(state));
    });

    const unsubscribe = window.adminControlCenter.onVerificationRunState((state) => {
      if (!active) return;
      receivedLiveState = true;
      const justFinished = previousRunning && !state.running;
      previousRunning = state.running;
      setRunState(normalizeVerificationRunState(state));
      if (justFinished) {
        onRefresh();
        void loadHistory();
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadHistory, onRefresh]);

  const planIds = new Set(verification.plans[preset] ?? []);
  const visibleChecks = verification.checks.filter((check) =>
    androidScreens
      ? ANDROID_SCREEN_CHECKS.has(check.id)
      : planIds.has(check.id) && (domain === "all" || check.domains.includes(domain))
  );

  const activeCheck = runState.checks.find((check) => check.status === "running");
  const doneCount = runState.checks.filter((check) => check.status !== "running").length;
  const failedCount = runState.checks.filter((check) => check.status === "failed").length;
  const totalCount = runState.totalPlanned || runState.checks.length;
  const runChecksById = new Map(runState.checks.map((check) => [check.id, check]));

  useEffect(() => {
    if (!expandedCheckId) return;
    let active = true;
    void window.adminControlCenter.getVerificationCheckOutput(expandedCheckId).then((value) => {
      if (active) setExpandedOutput(value);
    });
    return () => { active = false; };
  }, [expandedCheckId, runChecksById.get(expandedCheckId)?.status]);

  const copyCheck = useCallback(async (checkId: string) => {
    const copied = await window.adminControlCenter.copyVerificationCheckOutput(checkId);
    setCopyStatus(copied ? "Kontrol çıktısı kopyalandı." : "Kopyalanabilecek çıktı bulunamadı.");
  }, []);

  const latestTone: StatusKind = verification.latest.result === "passed"
    ? "ready"
    : verification.latest.result === "failed"
      ? "error"
      : verification.latest.result === "running"
        ? "warning"
        : "unknown";

  const runTone: StatusKind = runState.result === "passed"
    ? "ready"
    : runState.result === "failed"
      ? "error"
      : runState.result === "running"
        ? "warning"
        : runState.result === "cancelled"
          ? "warning"
          : "unknown";

  const startRun = useCallback(async (mode: "preset" | "domain" | "check", value: string, includeManual = false) => {
    if (!value || runState.running) return;
    setExpandedCheckId("");
    setExpandedOutput("");
    setCopyStatus("");
    setRunMessage("");
    const result = await window.adminControlCenter.startVerification({ mode, value, includeManual });
    setRunMessage(result.message);
    if (!result.accepted) {
      setTimeout(() => setRunMessage(""), 4000);
    }
  }, [runState.running]);

  const cancelRun = useCallback(async () => {
    const cancelled = await window.adminControlCenter.cancelVerification();
    if (!cancelled) setRunMessage("Çalışan doğrulama bulunamadı.");
  }, []);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">DOĞRULAMA MERKEZİ</p>
          <h1>Testler</h1>
          <p className="page-subtitle">
            Canonical verification registry, son rapor ve kontrollü çalıştırma akışı tek yerde.
          </p>
        </div>
        <div className="verification-header-actions">
          {runState.running ? (
            <button className="button button--danger" onClick={() => void cancelRun()}>
              <Square size={16} />
              İptal Et
            </button>
          ) : (
            <button
              className="button button--primary"
              disabled={!androidScreens && !preset}
              onClick={() => void (androidScreens
                ? startRun("check", "android-native-ui-family", true)
                : startRun("preset", preset))}
            >
              <Play size={16} />
              {androidScreens ? "Hızlı Native Test" : (preset || "Plan") + " Çalıştır"}
            </button>
          )}
          <button className="button button--secondary" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={17} className={refreshing ? "spin" : ""} />
            {refreshing ? "Yenileniyor" : "Durumu Yenile"}
          </button>
        </div>
      </header>

      <section className="verification-summary">
        <article className="verification-latest">
          <div className="verification-result-icon" data-status={runState.startedAt ? runTone : latestTone}>
            {(runState.startedAt ? runState.result : verification.latest.result) === "passed"
              ? <CheckCircle2 size={25} />
              : (runState.startedAt ? runState.result : verification.latest.result) === "failed"
                ? <XCircle size={25} />
                : <Timer size={25} />}
          </div>
          <div className="verification-latest-copy">
            <span>{runState.startedAt ? "Bu koşu" : "Son doğrulama"}</span>
            <strong>
              {runState.startedAt
                ? runState.result === "running" ? "Çalışıyor"
                  : runState.result === "passed" ? "Temiz"
                    : runState.result === "failed" ? "Başarısız" : "İptal edildi"
                : verification.latest.available
                  ? verification.latest.result === "passed" ? "Temiz"
                    : verification.latest.result === "failed" ? "Başarısız"
                      : verification.latest.result === "running" ? "Çalışıyor" : "Bilinmiyor"
                  : "Henüz rapor yok"}
            </strong>
            <small>
              {runState.startedAt
                ? runState.selectionLabel
                : verification.latest.available
                  ? `${verification.latest.selectionLabel} · ${formatAge(verification.latest.ageMs)}`
                  : "artifacts/verify/latest.json bulunamadı"}
            </small>
          </div>

          {runState.startedAt ? (
            <div className="verification-counts">
              <div><strong>{runState.checks.filter((item) => item.status === "passed").length}</strong><span>geçen</span></div>
              <div><strong>{failedCount}</strong><span>kalan</span></div>
              <div><strong>{runState.checks.filter((item) => item.status === "skipped").length}</strong><span>atlanan</span></div>
            </div>
          ) : verification.latest.available ? (
            <div className="verification-counts">
              <div><strong>{verification.latest.passed}</strong><span>geçen</span></div>
              <div><strong>{verification.latest.failed}</strong><span>kalan</span></div>
              <div><strong>{verification.latest.skipped}</strong><span>atlanan</span></div>
            </div>
          ) : null}
        </article>

        <div className="preset-grid">
          {verification.presets.map((item) => (
            <button
              className={preset === item ? "preset-card preset-card--active" : "preset-card"}
              key={item}
              onClick={() => setPreset(item)}
              disabled={runState.running}
            >
              <span>{item}</span>
              <strong>{verification.planCounts[item] ?? 0}</strong>
              <small>benzersiz kontrol</small>
            </button>
          ))}
        </div>
      </section>

      {runState.result !== "idle" || runMessage ? (
        <section className="panel verification-run-panel">
          <div className="verification-run-head">
            <div>
              <p className="panel-kicker">CANLI ÇALIŞTIRMA</p>
              <div className="verification-run-title">
                <span className={statusClass(runTone)}>
                  {runState.result === "running"
                    ? "Çalışıyor"
                    : runState.result === "passed"
                      ? "Temiz"
                      : runState.result === "failed"
                        ? "Başarısız"
                        : runState.result === "cancelled"
                          ? "İptal edildi"
                          : "Hazır"}
                </span>
                <strong>{runState.selectionLabel || runMessage}</strong>
              </div>
            </div>
            {runState.startedAt ? (
              <small className="quiet">
                {new Date(runState.startedAt).toLocaleTimeString("tr-TR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit"
                })}
              </small>
            ) : null}
          </div>

          {totalCount > 0 && (
            <div className="verification-live-progress">
              <div className="verification-live-progress__text">
                <strong>{doneCount} / {totalCount} tamamlandı</strong>
                <span>{activeCheck ? `Çalışıyor: ${verification.checks.find((item) => item.id === activeCheck.id)?.label ?? activeCheck.id}` : (runState.running ? "Sonraki kontrol bekleniyor…" : "Koşu tamamlandı")}</span>
                {failedCount > 0 && <span className="verification-live-progress__failed">{failedCount} başarısız</span>}
              </div>
              <progress aria-label="Test ilerlemesi" value={doneCount} max={totalCount} />
            </div>
          )}
          <details className="verification-console-details">
            <summary>Ham terminal çıktısı ({runState.outputTail.length} satır)</summary>
            <LiveConsole
              className="verification-console"
              lines={runState.outputTail}
              emptyText={runMessage || "Çıktı bekleniyor…"}
            />
          </details>
        </section>
      ) : null}

      <section className="panel verification-panel">
        <div className="panel-header verification-toolbar">
          <div>
            <p className="panel-kicker">{androidScreens ? "ANDROID EKRAN / CİHAZ KONTROLLERİ" : "CANONICAL PLAN"}</p>
            <h2>{androidScreens ? "Android ekran testleri" : `${preset || "Plan"} kontrolleri`}</h2>
          </div>
          <div className="verification-toolbar-actions">
            <button
              className={androidScreens ? "button button--primary button--compact" : "button button--secondary button--compact"}
              aria-pressed={androidScreens}
              onClick={() => setAndroidScreens(value => !value)}
            >
              {androidScreens ? "Plan Kontrolleri" : "Android Ekranları"}
            </button>
            {!androidScreens && domain !== "all" ? (
              <button
                className="button button--secondary button--compact"
                disabled={runState.running}
                onClick={() => void startRun("domain", domain)}
              >
                <Play size={14} />
                {domain} çalıştır
              </button>
            ) : null}
            {!androidScreens && <div className="domain-filter">
              <button
                className={domain === "all" ? "filter-chip filter-chip--active" : "filter-chip"}
                onClick={() => setDomain("all")}
              >
                Tümü
              </button>
              {verification.domains.map((item) => (
                <button
                  key={item}
                  className={domain === item ? "filter-chip filter-chip--active" : "filter-chip"}
                  onClick={() => setDomain(item)}
                >
                  {item}
                </button>
              ))}
            </div>}
          </div>
        </div>

        {androidScreens && <p className="verification-screen-note">
          Hızlı native test gerçek Android görünümlerini izole bir test APK’sında ölçer; V16 tarayıcı testi tasarım referansını kontrol eder.
          Companion testleri ise kurulu uygulamayı ADB ile sınar. Cihaz testleri isteğe bağlıdır, full/release otomatik koşusuna dahil değildir.
        </p>}
        <div className="verification-list">
          {visibleChecks.map((check, index) => {
            const live = runChecksById.get(check.id);
            const result = runState.startedAt ? undefined : verification.latest.checks.find((item) => item.id === check.id);
            const status = live?.status ?? result?.status;
            const resultStatus: StatusKind = status === "passed"
              ? "ready"
              : status === "failed"
                ? "error"
                : status === "skipped" || status === "running"
                  ? "warning"
                  : "unknown";

            return (
              <div className="verification-check-item" key={check.id}>
              <div className={`verification-row verification-row--action${live?.status === "running" ? " verification-row--running" : ""}`}>
                <span className="verification-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="verification-check-copy">
                  <strong>{androidScreens ? ANDROID_SCREEN_LABELS[check.id] ?? check.label : check.label}</strong>
                  <small>
                    {check.id} · {check.domains.join(", ")}
                    {check.manual ? " · ADB cihazı gerekli · manuel" : ""}
                  </small>
                </div>
                <div className="verification-deps">
                  {check.requires.length ? `${check.requires.length} önkoşul` : "bağımsız"}
                </div>
                <div className="verification-last-status">
                  <span className={statusClass(resultStatus)}>
                    {status === "running" ? "Çalışıyor"
                      : status === "passed" ? "Geçti"
                        : status === "failed" ? "Kaldı"
                          : status === "skipped" ? "Atlandı"
                            : runState.running ? "Bekliyor" : "Sonuç yok"}
                  </span>
                  {(live?.durationMs ?? result?.durationMs) !== null && (live?.durationMs ?? result?.durationMs) !== undefined
                    ? <small>{live?.durationMs ?? result?.durationMs} ms</small> : null}
                </div>
                <div className="verification-row-actions">
                  {live && (
                    <button
                      className="text-button"
                      aria-expanded={expandedCheckId === check.id}
                      onClick={() => {
                        setExpandedCheckId(expandedCheckId === check.id ? "" : check.id);
                        setExpandedOutput("");
                        setCopyStatus("");
                      }}
                    >{expandedCheckId === check.id ? "Kapat" : "Çıktı"}</button>
                  )}
                  <button
                    className="text-button verification-run-check"
                    disabled={runState.running}
                    onClick={() => void startRun("check", check.id, check.manual)}
                  >
                    Çalıştır
                  </button>
                </div>
              </div>
              {expandedCheckId === check.id && (
                <div className="verification-check-detail">
                  <div className="verification-check-detail__top">
                    <strong>{check.label} · {status === "failed" ? "Başarısız" : status === "running" ? "Çalışıyor" : status === "passed" ? "Geçti" : "Atlandı"}</strong>
                    <button className="button button--secondary button--compact" onClick={() => void copyCheck(check.id)}>
                      <Copy size={14} /> Çıktıyı Kopyala
                    </button>
                  </div>
                  <pre>{expandedOutput || "Çıktı yükleniyor…"}</pre>
                  {copyStatus && <small role="status">{copyStatus}</small>}
                </div>
              )}
              </div>
            );
          })}
          {!visibleChecks.length ? <div className="empty-row">Bu filtre için kontrol bulunamadı.</div> : null}
        </div>
      </section>

      <section className="panel verification-history-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">ADMİN DOĞRULAMA GEÇMİŞİ</p>
            <h2>HEAD ile ilişkilendirilmiş koşular</h2>
          </div>
          <span className="quiet">{history.length ? `son ${history.length} kayıt` : "henüz kayıt yok"}</span>
        </div>

        <div className="verification-history-list">
          {history.slice(0, 8).map((item) => {
            const tone: StatusKind = item.result === "passed"
              ? "ready"
              : item.result === "failed"
                ? "error"
                : "warning";
            const currentHead = item.head === data.repo.head;
            return (
              <div className="verification-history-row" key={item.id}>
                <span className={statusClass(tone)}>
                  {item.result === "passed" ? "Temiz" : item.result === "failed" ? "Başarısız" : "İptal"}
                </span>
                <div>
                  <strong>{item.selectionLabel}</strong>
                  <small>
                    {item.branch} · {item.head}
                    {item.dirtyCount ? ` · ${item.dirtyCount} değişiklik` : " · temiz"}
                  </small>
                </div>
                <span className={currentHead ? "history-head history-head--current" : "history-head"}>
                  {currentHead ? "mevcut HEAD" : "eski HEAD"}
                </span>
                <small>{new Date(item.finishedAt).toLocaleString("tr-TR")}</small>
              </div>
            );
          })}
          {!history.length ? (
            <div className="empty-row">
              Bundan sonraki admin doğrulamaları branch + HEAD bilgisiyle burada tutulacak.
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel verification-note">
        <FlaskConical size={20} />
        <div>
          <strong>Doğrulamalar canonical verify runner üzerinden çalışır.</strong>
          <p>
            Admin kendi test komutlarını üretmez; scripts/verify.mjs çalıştırılır. Aynı anda tek plan çalışır,
            canlı çıktı gösterilir ve gerektiğinde süreç ağacı iptal edilebilir.
          </p>
        </div>
      </section>
    </>
  );
}

function Deploy({
  data,
  presetTargetId,
  onRefresh
}: {
  data: OverviewSnapshot;
  presetTargetId?: string;
  onRefresh: () => void;
}) {
  const [targets, setTargets] = useState<DeploymentTargetSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [runMessage, setRunMessage] = useState("");
  const [runState, setRunState] = useState<DeploymentRunState>({
    running: false,
    targetId: "",
    action: "",
    stage: "",
    startedAt: null,
    finishedAt: null,
    result: "idle",
    exitCode: null,
    outputTail: []
  });

  useEffect(() => {
    let active = true;
    let previousRunning = false;

    void Promise.all([
      window.adminControlCenter.getDeploymentTargets(),
      window.adminControlCenter.getDeploymentRunState()
    ]).then(([nextTargets, state]) => {
      if (!active) return;
      setTargets(nextTargets);
      // A preset only selects an existing target. It never starts preflight or deploy.
      const preferred = presetTargetId && nextTargets.some((target) => target.id === presetTargetId)
        ? presetTargetId : "";
      setSelectedId((current) => current || preferred || nextTargets[0]?.id || "");
      previousRunning = state.running;
      setRunState(state);
      setLoadError("");
    }).catch((value) => {
      if (!active) return;
      setLoadError(value instanceof Error ? value.message : String(value));
    });

    const unsubscribe = window.adminControlCenter.onDeploymentRunState((state) => {
      if (!active) return;
      const justFinished = previousRunning && !state.running;
      previousRunning = state.running;
      setRunState(state);
      if (justFinished) {
        setConfirmId("");
        onRefresh();
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [onRefresh]);

  const selected = targets.find((item) => item.id === selectedId) ?? targets[0];
  const selectedInstallation = data.installations.find(
    (item) => item.id === selected?.installationId
  );
  const selectedScopeNote = selected ? deployTargetScopeNote(selected.id) : "";

  const runTone: StatusKind = runState.result === "passed"
    ? "ready"
    : runState.result === "failed"
      ? "error"
      : runState.result === "running"
        ? "warning"
        : runState.result === "cancelled"
          ? "warning"
          : "unknown";

  const start = useCallback(async (
    targetId: string,
    action: "preflight" | "deploy"
  ) => {
    setRunMessage("");
    const result = await window.adminControlCenter.startDeployment({ targetId, action });
    setRunMessage(result.message);
    if (result.accepted) setConfirmId("");
  }, []);

  const cancel = useCallback(async () => {
    const cancelled = await window.adminControlCenter.cancelDeployment();
    if (!cancelled) setRunMessage("Çalışan deploy işlemi bulunamadı.");
  }, []);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">YAYIN OPERASYONLARI</p>
          <h1>Deploy</h1>
          <p className="page-subtitle">
            Ön kontrol, etki özeti, açık onay, deploy ve canlı doğrulama aynı akışta.
          </p>
        </div>
        {runState.running ? (
          <button className="button button--danger" onClick={() => void cancel()}>
            <Square size={16} />
            İşlemi İptal Et
          </button>
        ) : null}
      </header>

      {loadError ? (
        <div className="error-banner">
          <TriangleAlert size={18} />
          <span>Deploy hedefleri okunamadı: {loadError}</span>
        </div>
      ) : null}

      <section className="deploy-layout">
        <aside className="deployment-picker">
          <div className="picker-heading">
            <div>
              <p className="panel-kicker">HEDEFLER</p>
              <strong>{targets.length} yayın hedefi</strong>
            </div>
          </div>

          <div className="picker-list">
            {targets.map((target) => {
              const installation = data.installations.find(
                (item) => item.id === target.installationId
              );
              return (
                <button
                  key={target.id}
                  className={target.id === selected?.id ? "picker-item picker-item--active" : "picker-item"}
                  onClick={() => {
                    setSelectedId(target.id);
                    setConfirmId("");
                  }}
                >
                  <span
                    className="installation-dot"
                    data-status={target.available ? installation?.status ?? "unknown" : "error"}
                  />
                  <span className="picker-copy">
                    <strong>{target.title}</strong>
                    <small>{target.available ? target.availabilityNote : "Kullanılamıyor"}</small>
                  </span>
                  <span className={statusClass(target.available ? installation?.status ?? "unknown" : "error")}>
                    {target.available ? statusLabel(installation?.status ?? "unknown") : "Eksik"}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {selected ? (
          <div className="deployment-detail">
            <section className="panel deployment-hero">
              <div>
                <p className="panel-kicker">SEÇİLİ HEDEF</p>
                <div className="deployment-title">
                  <CloudUpload size={24} />
                  <div>
                    <h2>{selected.title}</h2>
                    <p>{selected.description}</p>
                    {selectedScopeNote ? <p className="quiet">{selectedScopeNote}</p> : null}
                  </div>
                </div>
              </div>

              <div className="deployment-actions">
                <button
                  className="button button--secondary"
                  disabled={!selected.available || runState.running}
                  onClick={() => void start(selected.id, "preflight")}
                >
                  <ShieldCheck size={16} />
                  Ön Kontrol
                </button>
                <button
                  className="button button--primary"
                  disabled={!selected.available || runState.running}
                  onClick={() => setConfirmId(selected.id)}
                >
                  <CloudUpload size={16} />
                  Deploy
                </button>
              </div>
            </section>

            <section className="deployment-summary-grid">
              <article className="summary-card">
                <span>Canlı durum</span>
                <strong>{selectedInstallation ? statusLabel(selectedInstallation.status) : "Bilinmiyor"}</strong>
                <small>{selectedInstallation?.statusNote ?? "Kurulum health kaydı yok."}</small>
              </article>
              <article className="summary-card">
                <span>Credential</span>
                <strong>{selectedInstallation
                  ? selectedInstallation.deployType === "ssh-rsync" && selectedInstallation.credentialStatus === "unconfigured"
                    ? "SSH config/agent"
                    : credentialLabel(selectedInstallation.credentialStatus)
                  : "—"}</strong>
                <small>{selectedInstallation?.deployType === "ssh-rsync" && selectedInstallation.credentialStatus === "unconfigured"
                  ? "İşletim sistemi kimlik doğrulaması"
                  : selectedInstallation?.credentialRef ?? "Referans yok"}</small>
              </article>
              <article className="summary-card">
                <span>Hazırlık</span>
                <strong>{selected.available ? "Hazır" : "Eksik"}</strong>
                <small>{selected.availabilityNote}</small>
              </article>
            </section>

            {confirmId === selected.id && !runState.running ? (
              <section className="panel deployment-confirm">
                <div className="deployment-confirm-title">
                  <TriangleAlert size={22} />
                  <div>
                    <p className="panel-kicker">CANLI İŞLEM ONAYI</p>
                    <h2>{selected.confirmText}</h2>
                  </div>
                </div>
                <div className="deployment-impact">
                  {selected.impact.map((item) => <div key={item}>• {item}</div>)}
                </div>
                <div className="deployment-confirm-actions">
                  <button className="button button--secondary" onClick={() => setConfirmId("")}>
                    Vazgeç
                  </button>
                  <button className="button button--danger" onClick={() => void start(selected.id, "deploy")}>
                    <CloudUpload size={16} />
                    Canlıya Yayınla
                  </button>
                </div>
              </section>
            ) : null}

            {runState.result !== "idle" || runMessage ? (
              <section className="panel deployment-run-panel">
                <div className="verification-run-head">
                  <div>
                    <p className="panel-kicker">OPERASYON ÇIKTISI</p>
                    <div className="verification-run-title">
                      <span className={statusClass(runTone)}>
                        {runState.result === "running"
                          ? "Çalışıyor"
                          : runState.result === "passed"
                            ? "Tamamlandı"
                            : runState.result === "failed"
                              ? "Başarısız"
                              : runState.result === "cancelled"
                                ? "İptal edildi"
                                : "Hazır"}
                      </span>
                      <strong>{runState.stage || runMessage}</strong>
                    </div>
                  </div>
                  {runState.action ? (
                    <span className="quiet">
                      {runState.action === "preflight" ? "ön kontrol" : "deploy"}
                    </span>
                  ) : null}
                </div>

                <div className="verification-console">
                  {runState.outputTail.length
                    ? runState.outputTail.map((line, index) => (
                        <div key={`${index}:${line}`}>{line}</div>
                      ))
                    : <div>{runMessage || "Çıktı bekleniyor…"}</div>}
                </div>
              </section>
            ) : null}

            <section className="panel deployment-impact-panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">ETKİ SINIRI</p>
                  <h2>Bu hedefte ne değişir?</h2>
                </div>
              </div>
              <div className="deployment-impact deployment-impact--quiet">
                {selected.impact.map((item) => <div key={item}>• {item}</div>)}
              </div>
            </section>
          </div>
        ) : (
          <div className="loading-card">Deploy hedefleri hazırlanıyor…</div>
        )}
      </section>
    </>
  );
}

function supportStatusLabel(status: SupportReportStatus) {
  if (status === "reviewing") return "İnceleniyor";
  if (status === "resolved") return "Çözüldü";
  return "Yeni";
}

function supportStatusTone(status: SupportReportStatus): StatusKind {
  if (status === "resolved") return "ready";
  if (status === "reviewing") return "warning";
  return "error";
}

function Support({ productVersion }: { productVersion: string }) {
  const [reports, setReports] = useState<SupportReportListItem[]>([]);
  const [filter, setFilter] = useState<"all" | SupportReportStatus>("all");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<SupportReportDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [showResolve, setShowResolve] = useState(false);
  const [resolvedVersion, setResolvedVersion] = useState(productVersion);
  const [resolutionNote, setResolutionNote] = useState("");

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError("");
    try {
      const next = await window.adminControlCenter.listSupportReports(120);
      setReports(next);
      setSelectedId((current) => current && next.some((item) => item.reportId === current)
        ? current
        : next[0]?.reportId ?? "");
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (reportId: string) => {
    if (!reportId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setError("");
    try {
      setDetail(await window.adminControlCenter.getSupportReportDetail(reportId, true));
    } catch (value) {
      setDetail(null);
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadDetail(selectedId);
    setShowResolve(false);
    setResolutionNote("");
    setResolvedVersion(productVersion);
  }, [loadDetail, productVersion, selectedId]);

  const updateStatus = useCallback(async (
    status: SupportReportStatus,
    version = "",
    note = ""
  ) => {
    if (!selectedId || statusBusy) return;
    setStatusBusy(true);
    setError("");
    try {
      const updated = await window.adminControlCenter.updateSupportReportStatus(
        selectedId,
        status,
        version,
        note
      );
      setReports((current) => current.map((item) =>
        item.reportId === updated.reportId ? updated : item
      ));
      await loadDetail(selectedId);
      setShowResolve(false);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setStatusBusy(false);
    }
  }, [loadDetail, selectedId, statusBusy]);

  async function deleteReport(report: SupportReportListItem) {
    if (deletingId || statusBusy) return;
    const confirmed = window.confirm(`${report.reportId} raporu sunucudan ve yerel önbellekten kalıcı olarak silinsin mi?`);
    if (!confirmed) return;

    setDeletingId(report.reportId);
    setError("");
    try {
      await window.adminControlCenter.deleteSupportReport(report.reportId);
      const remaining = reports.filter((item) => item.reportId !== report.reportId);
      setReports(remaining);
      if (selectedId === report.reportId) {
        setDetail(null);
        const nextSelection = remaining.find((item) => filter === "all" || item.status === filter);
        setSelectedId(nextSelection?.reportId ?? "");
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setDeletingId("");
    }
  }

  const counts = useMemo(() => ({
    all: reports.length,
    new: reports.filter((item) => item.status === "new").length,
    reviewing: reports.filter((item) => item.status === "reviewing").length,
    resolved: reports.filter((item) => item.status === "resolved").length
  }), [reports]);

  const filtered = reports.filter((item) => filter === "all" || item.status === filter);
  const selectedMeta = reports.find((item) => item.reportId === selectedId) ?? detail?.meta ?? null;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">DESTEK MERKEZİ</p>
          <h1>Destek</h1>
          <p className="page-subtitle">
            Kullanıcı hata raporları, ekran görüntüsü ve son WARN/ERROR olayları tek yerde.
          </p>
        </div>
        <button className="button button--secondary" onClick={() => void loadList()} disabled={loadingList}>
          <RefreshCw size={17} className={loadingList ? "spin" : ""} />
          {loadingList ? "Yenileniyor" : "Raporları Yenile"}
        </button>
      </header>

      {error ? (
        <div className="error-banner">
          <TriangleAlert size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="support-summary-grid">
        <button className={filter === "all" ? "support-stat support-stat--active" : "support-stat"} onClick={() => setFilter("all")}>
          <span>Tümü</span><strong>{counts.all}</strong>
        </button>
        <button className={filter === "new" ? "support-stat support-stat--active" : "support-stat"} onClick={() => setFilter("new")}>
          <span>Yeni</span><strong>{counts.new}</strong>
        </button>
        <button className={filter === "reviewing" ? "support-stat support-stat--active" : "support-stat"} onClick={() => setFilter("reviewing")}>
          <span>İnceleniyor</span><strong>{counts.reviewing}</strong>
        </button>
        <button className={filter === "resolved" ? "support-stat support-stat--active" : "support-stat"} onClick={() => setFilter("resolved")}>
          <span>Çözüldü</span><strong>{counts.resolved}</strong>
        </button>
      </section>

      <section className="support-layout">
        <aside className="support-list-panel">
          <div className="picker-heading">
            <div>
              <p className="panel-kicker">RAPORLAR</p>
              <strong>{filtered.length} kayıt</strong>
            </div>
          </div>

          <div className="support-list">
            {filtered.map((report) => (
              <div
                key={report.reportId}
                className={report.reportId === selectedId ? "support-list-item support-list-item--active" : "support-list-item"}
              >
                <button
                  className="support-list-select"
                  onClick={() => setSelectedId(report.reportId)}
                  aria-current={report.reportId === selectedId ? "true" : undefined}
                >
                  <div className="support-list-title">
                    <span className="installation-dot" data-status={supportStatusTone(report.status)} />
                    <div>
                      <strong>{report.reportId}</strong>
                      <small>{new Date(report.receivedAt).toLocaleString("tr-TR")}</small>
                    </div>
                  </div>
                  <div className="support-list-meta">
                    <span className={statusClass(supportStatusTone(report.status))}>{supportStatusLabel(report.status)}</span>
                    <small>{report.errorCount} error · {report.warnCount} warn</small>
                  </div>
                </button>
                <button
                  className="button button--danger button--compact support-delete-button"
                  title="Raporu sil"
                  aria-label={`${report.reportId} raporunu sil`}
                  disabled={Boolean(deletingId) || statusBusy}
                  onClick={() => void deleteReport(report)}
                >
                  {deletingId === report.reportId ? <RefreshCw size={15} className="spin" /> : <Trash2 size={15} />}
                </button>
              </div>
            ))}
            {!loadingList && !filtered.length ? (
              <div className="empty-row">Bu filtrede destek raporu yok.</div>
            ) : null}
          </div>
        </aside>

        <div className="support-detail">
          {loadingDetail ? (
            <div className="loading-card"><RefreshCw className="spin" size={22} /> Rapor indiriliyor…</div>
          ) : detail && selectedMeta ? (
            <>
              <section className="panel support-hero">
                <div>
                  <p className="panel-kicker">RAPOR</p>
                  <div className="support-hero-title">
                    <h2>{detail.meta.reportId}</h2>
                    <span className={statusClass(supportStatusTone(detail.meta.status))}>
                      {supportStatusLabel(detail.meta.status)}
                    </span>
                  </div>
                  <p>
                    v{detail.meta.appVersion || "?"} · {detail.meta.platform || "platform ?"} {detail.meta.arch}
                  </p>
                </div>

                <div className="support-actions">
                  {detail.meta.status !== "reviewing" ? (
                    <button
                      className="button button--secondary"
                      disabled={statusBusy}
                      onClick={() => void updateStatus("reviewing")}
                    >
                      İncelemeye Al
                    </button>
                  ) : null}
                  {detail.meta.status !== "resolved" ? (
                    <button
                      className="button button--primary"
                      disabled={statusBusy}
                      onClick={() => setShowResolve(true)}
                    >
                      Çözüldü İşaretle
                    </button>
                  ) : null}
                  {detail.meta.status === "resolved" ? (
                    <button
                      className="button button--secondary"
                      disabled={statusBusy}
                      onClick={() => void updateStatus("reviewing")}
                    >
                      Yeniden Aç
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="support-metrics-grid">
                <article className="summary-card">
                  <span>Oturum</span>
                  <strong>{detail.meta.sessionCount}</strong>
                  <small>{detail.meta.abruptSessionCount} ani kapanış</small>
                </article>
                <article className="summary-card">
                  <span>ERROR</span>
                  <strong>{detail.meta.errorCount}</strong>
                  <small>{detail.meta.eventCount} toplam olay</small>
                </article>
                <article className="summary-card">
                  <span>WARN</span>
                  <strong>{detail.meta.warnCount}</strong>
                  <small>{detail.meta.screenshotBytes ? "Ekran görüntüsü var" : "Ekran görüntüsü yok"}</small>
                </article>
              </section>

              {showResolve ? (
                <section className="panel support-resolve-panel">
                  <div>
                    <p className="panel-kicker">ÇÖZÜM KAYDI</p>
                    <h2>Raporu çözüldü olarak kapat</h2>
                  </div>
                  <div className="support-resolve-fields">
                    <label>
                      <span>Çözüldüğü sürüm</span>
                      <input value={resolvedVersion} onChange={(event) => setResolvedVersion(event.target.value)} />
                    </label>
                    <label>
                      <span>Çözüm notu</span>
                      <textarea
                        rows={3}
                        value={resolutionNote}
                        onChange={(event) => setResolutionNote(event.target.value)}
                        placeholder="Kısa çözüm notu"
                      />
                    </label>
                  </div>
                  <div className="deployment-confirm-actions">
                    <button className="button button--secondary" onClick={() => setShowResolve(false)}>Vazgeç</button>
                    <button
                      className="button button--primary"
                      disabled={statusBusy}
                      onClick={() => void updateStatus("resolved", resolvedVersion, resolutionNote)}
                    >
                      Kaydet ve Kapat
                    </button>
                  </div>
                </section>
              ) : null}

              {detail.note ? (
                <section className="panel support-note-panel">
                  <p className="panel-kicker">KULLANICI NOTU</p>
                  <p>{detail.note}</p>
                </section>
              ) : null}

              <section className="support-evidence-grid">
                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">WARN / ERROR</p>
                      <h2>Son olaylar</h2>
                    </div>
                  </div>
                  <div className="support-events">
                    {detail.recent.map((event, index) => (
                      <div className="support-event" key={`${event.timestamp}:${event.event}:${index}`}>
                        <div className="support-event-head">
                          <span className={statusClass(event.level === "ERROR" ? "error" : "warning")}>{event.level}</span>
                          <strong>{event.scope || event.event || "Olay"}</strong>
                          <small>{event.timestamp ? new Date(event.timestamp).toLocaleString("tr-TR") : ""}</small>
                        </div>
                        <p>{event.message || event.errorMessage || "Mesaj yok."}</p>
                        {event.errorMessage && event.errorMessage !== event.message ? <small>{event.errorMessage}</small> : null}
                      </div>
                    ))}
                    {!detail.recent.length ? <div className="empty-row">WARN/ERROR olayı yok.</div> : null}
                  </div>
                </article>

                <article className="panel support-screenshot-panel">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">EKRAN GÖRÜNTÜSÜ</p>
                      <h2>Hata anı</h2>
                    </div>
                  </div>
                  {detail.screenshotDataUrl ? (
                    <img src={detail.screenshotDataUrl} alt="Destek raporu ekran görüntüsü" />
                  ) : (
                    <div className="support-no-screenshot">Bu raporda ekran görüntüsü yok.</div>
                  )}
                </article>
              </section>

              <section className="panel support-app-panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">DIAGNOSTIC SNAPSHOT</p>
                    <h2>Uygulama bilgileri</h2>
                  </div>
                  {detail.meta.resolvedInVersion ? (
                    <span className="status status--ready">Çözüldü: v{detail.meta.resolvedInVersion}</span>
                  ) : null}
                </div>
                <div className="support-app-grid">
                  {Object.entries(detail.app).map(([key, value]) => (
                    <div key={key}><span>{key}</span><strong>{value}</strong></div>
                  ))}
                </div>
                {detail.meta.resolutionNote ? (
                  <div className="support-resolution-note">
                    <strong>Çözüm notu</strong>
                    <p>{detail.meta.resolutionNote}</p>
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <div className="loading-card">
              <LifeBuoy size={22} />
              {reports.length ? "Rapor seçin." : "Henüz destek raporu yok."}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function System({ data }: { data: OverviewSnapshot }) {
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<DependencyUpdateReport | null>(null);
  const [checkError, setCheckError] = useState("");
  const [environment, setEnvironment] = useState<SystemEnvironmentSnapshot | null>(null);
  const [environmentLoading, setEnvironmentLoading] = useState(true);
  const [environmentError, setEnvironmentError] = useState("");

  const loadEnvironment = useCallback(async () => {
    setEnvironmentLoading(true);
    setEnvironmentError("");
    try {
      setEnvironment(await window.adminControlCenter.getSystemEnvironment());
    } catch (value) {
      setEnvironmentError(value instanceof Error ? value.message : String(value));
    } finally {
      setEnvironmentLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEnvironment();
  }, [loadEnvironment]);

  const runDependencyCheck = useCallback(async () => {
    setChecking(true);
    setCheckError("");

    try {
      const result = await window.adminControlCenter.checkDependencyUpdates();
      setReport(result);
      if (result.status === "error") setCheckError(result.message);
    } catch (value) {
      setCheckError(value instanceof Error ? value.message : String(value));
    } finally {
      setChecking(false);
    }
  }, []);

  const reportTone: StatusKind = !report
    ? "unknown"
    : report.status === "current"
      ? "ready"
      : report.status === "updates"
        ? "warning"
        : "error";

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">YEREL YÖNETİM</p>
          <h1>Sistem</h1>
          <p className="page-subtitle">
            Admin çalışma ortamı, araç zinciri, credential referansları ve bağımlılık kontrolleri.
          </p>
        </div>
        <button className="button button--secondary" onClick={() => void loadEnvironment()} disabled={environmentLoading}>
          <RefreshCw size={17} className={environmentLoading ? "spin" : ""} />
          {environmentLoading ? "Kontrol ediliyor" : "Ortamı Yenile"}
        </button>
      </header>

      {environmentError ? (
        <div className="error-banner">
          <TriangleAlert size={18} />
          <span>Ortam bilgisi okunamadı: {environmentError}</span>
        </div>
      ) : null}

      <section className="system-summary-grid">
        <article className="summary-card">
          <span>Repo</span>
          <strong>{data.repo.branch}</strong>
          <small>HEAD {data.repo.head}</small>
        </article>
        <article className="summary-card">
          <span>Araç zinciri</span>
          <strong>
            {environment
              ? `${environment.tools.filter((item) => item.available).length} / ${environment.tools.length}`
              : "—"}
          </strong>
          <small>{environment ? "gerekli yerel araç hazır" : "Ortam okunuyor"}</small>
        </article>
        <article className="summary-card">
          <span>Android cihaz</span>
          <strong>{environment ? environment.androidDevices.length : "—"}</strong>
          <small>{environment?.androidDevices[0]?.model || "Bağlı cihaz yok"}</small>
        </article>
        <article className="summary-card">
          <span>Kütüphane durumu</span>
          <strong>
            {!report
              ? "Kontrol edilmedi"
              : report.status === "current"
                ? "Güncel"
                : report.status === "updates"
                  ? `${report.count} güncelleme`
                  : "Kontrol hatası"}
          </strong>
          <small>
            {report
              ? `${report.packageManager} · ${report.nodeVersion}`
              : "İsteğe bağlı npm registry kontrolü"}
          </small>
        </article>
      </section>

      <section className="system-environment-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">ARAÇ ZİNCİRİ</p>
              <h2>Yerel araçlar</h2>
            </div>
          </div>
          <div className="system-tool-list">
            {environment?.tools.map((item) => (
              <div className="system-tool-row" key={item.id}>
                <span className="installation-dot" data-status={item.available ? "ready" : "error"} />
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
                <span className={statusClass(item.available ? "ready" : "error")}>
                  {item.available ? "Hazır" : "Eksik"}
                </span>
              </div>
            ))}
            {!environment ? <div className="empty-row">Ortam bilgisi okunuyor…</div> : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">CREDENTIAL REFERANSLARI</p>
              <h2>Yerel kayıt durumu</h2>
            </div>
          </div>
          <div className="system-credential-list">
            {environment?.credentials.map((item) => (
              <div className="system-credential-row" key={item.ref}>
                <KeyRound size={17} />
                <div>
                  <strong>{item.ref}</strong>
                  <small>{item.usedBy.join(" · ")}</small>
                </div>
                <span className={statusClass(item.systemManaged ? "unknown" : item.status === "configured" ? "ready" : item.status === "unreadable" ? "error" : "unconfigured")}>
                  {item.systemManaged ? "SSH config/agent" : credentialLabel(item.status)}
                </span>
              </div>
            ))}
            {!environment?.credentials.length && environment ? (
              <div className="empty-row">Credential referansı bulunamadı.</div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="panel system-paths-panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">ÇALIŞMA YOLLARI</p>
            <h2>Repo ve cihazlar</h2>
          </div>
          <span className="quiet">
            {environment?.checkedAt ? new Date(environment.checkedAt).toLocaleTimeString("tr-TR") : ""}
          </span>
        </div>
        <div className="system-paths-grid">
          <div><span>Yardımcı Asistan repo</span><strong>{environment?.repoRoot ?? "—"}</strong></div>
          <div><span>BlackSea repo</span><strong>{environment?.blackSeaRoot ?? "Bulunamadı"}</strong></div>
        </div>
        <div className="android-device-list">
          {environment?.androidDevices.map((device) => (
            <div className="android-device-row" key={device.serial}>
              <Activity size={17} />
              <div>
                <strong>{device.model || device.device || device.serial}</strong>
                <small>{device.serial} · {device.state}</small>
              </div>
              <span className={statusClass(device.state === "device" ? "ready" : "warning")}>
                {device.state}
              </span>
            </div>
          ))}
          {environment && !environment.androidDevices.length ? (
            <div className="empty-row">ADB üzerinden bağlı Android cihaz görünmüyor.</div>
          ) : null}
        </div>
      </section>

      <section className="panel dependency-panel">
        <div className="panel-header dependency-panel-header">
          <div>
            <p className="panel-kicker">MANUEL KÜTÜPHANE KONTROLÜ</p>
            <h2>Workspace bağımlılıkları</h2>
            <p className="dependency-description">
              Root ve tüm npm workspace'leri için kurulu sürüm, semver içinde önerilen sürüm ve en son yayın karşılaştırılır.
            </p>
          </div>
          <button
            className="button button--secondary"
            onClick={() => void runDependencyCheck()}
            disabled={checking}
          >
            <RefreshCw size={17} className={checking ? "spin" : ""} />
            {checking ? "Kontrol ediliyor" : report ? "Tekrar Kontrol Et" : "Güncellemeleri Kontrol Et"}
          </button>
        </div>

        {checkError ? (
          <div className="dependency-state dependency-state--error">
            <TriangleAlert size={18} />
            <div>
              <strong>Kontrol tamamlanamadı.</strong>
              <small>{checkError}</small>
            </div>
          </div>
        ) : !report ? (
          <div className="dependency-state">
            <PackageCheck size={20} />
            <div>
              <strong>Otomatik kontrol yapılmıyor.</strong>
              <small>Butona bastığında npm registry'ye bağlanılır; hiçbir paket değiştirilmez veya kurulmaz.</small>
            </div>
          </div>
        ) : (
          <>
            <div className="dependency-result">
              <div className="dependency-result-main">
                <span className={statusClass(reportTone)}>
                  {report.status === "current" ? "Güncel" : report.status === "updates" ? "Güncelleme var" : "Hata"}
                </span>
                <strong>{report.message}</strong>
                <small>
                  {new Date(report.checkedAt).toLocaleString("tr-TR")} · {report.packageManager} · {report.nodeVersion}
                </small>
              </div>
              <div className="dependency-result-counts">
                <div><strong>{report.count}</strong><span>toplam</span></div>
                <div><strong>{report.majorCount}</strong><span>major</span></div>
              </div>
            </div>

            {report.items.length ? (
              <div className="dependency-list">
                <div className="dependency-row dependency-row--head">
                  <span>Paket</span>
                  <span>Mevcut</span>
                  <span>Wanted</span>
                  <span>Latest</span>
                  <span>Kaynak</span>
                  <span />
                </div>
                {report.items.map((item) => (
                  <div className="dependency-row" key={`${item.name}:${item.dependent}:${item.location}`}>
                    <div className="dependency-name">
                      <strong>{item.name}</strong>
                      <small>{item.type || "dependency"}</small>
                    </div>
                    <code>{item.current}</code>
                    <code>{item.wanted}</code>
                    <code>{item.latest}</code>
                    <div className="dependency-source">
                      <span>{item.dependent || "workspace"}</span>
                      {item.majorUpdate ? <small className="dependency-major">major</small> : null}
                    </div>
                    <button
                      className="text-button"
                      disabled={!item.homepage}
                      onClick={() => void (item.homepage && window.adminControlCenter.openExternal(item.homepage))}
                    >
                      Detay
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dependency-state dependency-state--ready">
                <CheckCircle2 size={20} />
                <div>
                  <strong>Güncelleme görünmüyor.</strong>
                  <small>npm outdated tüm workspace'ler için boş sonuç döndürdü.</small>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel security-note system-note">
        <ShieldCheck size={18} />
        <span>
          Bu kontrol yalnız sürüm bilgisi okur. Paket güncelleme, package-lock değişikliği veya npm install işlemi yapmaz.
        </span>
      </section>
    </>
  );
}

function Placeholder({ section }: { section: Section }) {
  const label = NAV_ITEMS.find((item) => item.id === section)?.label ?? section;

  return (
    <section className="placeholder">
      <div className="placeholder-icon"><TriangleAlert size={24} /></div>
      <p className="eyebrow">SONRAKİ DİLİM</p>
      <h1>{label}</h1>
      <p>
        Ana operasyon yüzeyleri gerçek veri hattına bağlandı;
        sonraki ekranlar aynı güvenli IPC sınırı üzerinden eklenecek.
      </p>
    </section>
  );
}

function StartupSplash({
  error,
  onRetry
}: {
  error: string;
  onRetry: () => void;
}) {
  const phases = [
    "Admin arayüzü hazırlanıyor…",
    "Repo ve sürüm bilgileri okunuyor…",
    "Canlı kurulumlar kontrol ediliyor…",
    "Doğrulama ve yayın durumu toparlanıyor…"
  ];
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (error) return;
    const timer = window.setInterval(() => {
      setPhase((current) => Math.min(current + 1, phases.length - 1));
    }, 900);
    return () => window.clearInterval(timer);
  }, [error, phases.length]);

  return (
    <main className="startup-splash">
      <div className="startup-card">
        <div className="startup-brand-mark">YA</div>
        <p className="startup-kicker">YARDIMCI ASİSTAN</p>
        <h1>Admin Control Center</h1>

        {error ? (
          <>
            <div className="startup-error">
              <TriangleAlert size={22} />
              <div>
                <strong>Başlangıç tamamlanamadı.</strong>
                <span>{error}</span>
              </div>
            </div>
            <button className="button button--primary startup-retry" onClick={onRetry}>
              <RefreshCw size={17} />
              Tekrar Dene
            </button>
          </>
        ) : (
          <>
            <div className="startup-progress">
              <RefreshCw className="spin" size={22} />
              <div>
                <strong>{phases[phase]}</strong>
                <span>Ağ kontrolleri bağlantı durumuna göre birkaç saniye sürebilir.</span>
              </div>
            </div>
            <div className="startup-steps" aria-hidden="true">
              {phases.map((_, index) => (
                <span
                  key={index}
                  className={index <= phase ? "startup-step startup-step--active" : "startup-step"}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function App() {
  const bridgeRecoveryScheduled = useRef(false);
  const [section, setSection] = useState<Section>("overview");
  const [deployTargetPreset, setDeployTargetPreset] = useState("");
  const [data, setData] = useState<OverviewSnapshot | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadOverview = useCallback(async () => {
    setRefreshing(true);
    try {
      const bridge = window.adminControlCenter;
      if (!bridge || typeof bridge.getOverview !== "function") {
        let attempts = 0;
        try {
          attempts = Number(sessionStorage.getItem("admin-bridge-recovery-attempts") ?? "0");
        } catch {
          // Do not reload repeatedly when recovery state cannot be persisted.
          attempts = 5;
        }
        if (bridgeRecoveryScheduled.current) {
          // StrictMode may invoke this startup effect twice; the first call
          // already scheduled recovery, so the second must not show an error.
          setError("");
          return;
        }
        if (attempts < 5) {
          try {
            sessionStorage.setItem("admin-bridge-recovery-attempts", String(attempts + 1));
          } catch {
            throw new Error("Electron preload bağlantısı yüklenemedi. Uygulamayı kapatıp yeniden açın.");
          }
          bridgeRecoveryScheduled.current = true;
          // A transient missing preload must remain a loading state, not flash
          // the failure card before the already-scheduled recovery reload.
          setError("");
          window.setTimeout(() => window.location.reload(), 900);
          return;
        }
        throw new Error("Electron preload bağlantısı yüklenemedi. Uygulamayı kapatıp yeniden açın.");
      }
      try {
        sessionStorage.removeItem("admin-bridge-recovery-attempts");
      } catch {
        // The bridge is available; session storage is optional.
      }
      bridgeRecoveryScheduled.current = false;
      setData(await bridge.getOverview());
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const sidebarState = useMemo(() => {
    if (!data) return { text: "Veri bekleniyor", tone: "unknown" };
    if (data.counts.errors > 0) return { text: `${data.counts.errors} hata`, tone: "error" };
    if (data.counts.drift > 0) return { text: `${data.counts.drift} dikkat`, tone: "warning" };
    return { text: "Sistemler stabil", tone: "ready" };
  }, [data]);

  if (!data) {
    return <StartupSplash error={error} onRetry={() => void loadOverview()} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">YA</div>
          <div>
            <strong>Yardımcı Asistan</strong>
            <span>Admin Control Center</span>
          </div>
        </div>

        <nav>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={section === item.id ? "nav-item nav-item--active" : "nav-item"}
                onClick={() => {
                  // Manual navigation must not keep a one-shot target preset.
                  if (item.id === "deploy") setDeployTargetPreset("");
                  setSection(item.id);
                }}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-status">
          <span className="pulse-dot" data-status={sidebarState.tone} />
          <div>
            <strong>{sidebarState.text}</strong>
            <small>{data ? `${data.repo.branch} · ${data.repo.head}` : "Yerel durum okunuyor"}</small>
          </div>
        </div>
      </aside>

      <main className={section === "effects" ? "content content--effects" : "content"}>
        {error ? (
          <div className="error-banner">
            <TriangleAlert size={18} />
            <span>Genel durum okunamadı: {error}</span>
            <button onClick={() => void loadOverview()}>Tekrar dene</button>
          </div>
        ) : null}

        {section === "overview" && data ? (
          <Overview data={data} refreshing={refreshing} onRefresh={() => void loadOverview()} />
        ) : section === "installations" && data ? (
          <Installations data={data} refreshing={refreshing} onRefresh={() => void loadOverview()} />
        ) : section === "release" && data ? (
          <Release data={data} refreshing={refreshing} onRefresh={() => void loadOverview()} />
        ) : section === "tests" && data ? (
          <Tests data={data} refreshing={refreshing} onRefresh={() => void loadOverview()} />
        ) : section === "deploy" && data ? (
          <Deploy data={data} presetTargetId={deployTargetPreset} onRefresh={() => void loadOverview()} />
        ) : section === "effects" && data ? (
          <EffectStudio onOpenDeploy={(targetId) => {
            setDeployTargetPreset(targetId);
            setSection("deploy");
          }} />
        ) : section === "support" && data ? (
          <Support productVersion={data.product.version} />
        ) : section === "system" && data ? (
          <System data={data} />
        ) : section === "overview" || section === "installations" || section === "release" || section === "tests" || section === "deploy" || section === "effects" || section === "support" || section === "system" ? (
          <div className="loading-card">
            <RefreshCw className="spin" size={22} />
            Gerçek sistem durumu okunuyor…
          </div>
        ) : (
          <Placeholder section={section} />
        )}
      </main>
    </div>
  );
}
