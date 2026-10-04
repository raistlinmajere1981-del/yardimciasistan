import {
  Activity,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  FlaskConical,
  GitBranch,
  Globe2,
  Home,
  KeyRound,
  LifeBuoy,
  PackageCheck,
  Play,
  RefreshCw,
  Rocket,
  Server,
  Settings,
  ShieldCheck,
  Square,
  Timer,
  TriangleAlert,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DependencyUpdateReport,
  DeploymentRunState,
  DeploymentTargetSnapshot,
  HealthCheckSnapshot,
  InstallationSnapshot,
  OverviewSnapshot,
  StatusKind,
  VerificationRunState
} from "../shared/contracts";

type Section = "overview" | "installations" | "release" | "tests" | "deploy" | "support" | "system";

const NAV_ITEMS: Array<{ id: Section; label: string; icon: typeof Home }> = [
  { id: "overview", label: "Genel Bakış", icon: Home },
  { id: "installations", label: "Kurulumlar", icon: Server },
  { id: "release", label: "Release", icon: Rocket },
  { id: "tests", label: "Testler", icon: FlaskConical },
  { id: "deploy", label: "Deploy", icon: CloudUpload },
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
            <small>Web v{data.product.webModuleVersion} · Android #{data.product.androidVersionCode}</small>
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
                  <strong>{credentialLabel(installation.credentialStatus)}</strong>
                </div>

                <button
                  className="text-button"
                  disabled={!installation.siteUrl}
                  onClick={() => installation.siteUrl && window.adminControlCenter.openExternal(installation.siteUrl)}
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
  return (
    <div className="health-row">
      <span className="health-dot" data-status={check.status} />
      <div className="health-copy">
        <strong>{check.label}</strong>
        <small>{check.detail}</small>
      </div>
      <div className="health-tail">
        <span className={statusClass(check.status)}>{statusLabel(check.status)}</span>
        {check.durationMs !== null ? <small>{check.durationMs} ms</small> : null}
      </div>
    </div>
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
                  onClick={() => selected.siteUrl && window.adminControlCenter.openExternal(selected.siteUrl)}
                >
                  <Globe2 size={16} />
                  Siteyi Aç
                </button>
                <button
                  className="button button--secondary"
                  disabled={!selected.webModuleUrl}
                  onClick={() => selected.webModuleUrl && window.adminControlCenter.openExternal(selected.webModuleUrl)}
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
                <strong>{credentialLabel(selected.credentialStatus)}</strong>
                <small>{selected.credentialRef ?? "Referans yok"}</small>
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

              <div className="security-note">
                <KeyRound size={17} />
                <span>Bu ekranda yalnız credential referansı ve kayıt durumu gösterilir; secret değeri renderer'a taşınmaz.</span>
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

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">SÜRÜM AKIŞI</p>
          <h1>Release</h1>
          <p className="page-subtitle">
            Kaynak sürümü, yayın manifestleri ve canlı web modülleri aynı snapshot içinde karşılaştırılır.
          </p>
        </div>
        <button className="button button--secondary" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={17} className={refreshing ? "spin" : ""} />
          {refreshing ? "Kontrol ediliyor" : "Yayını Kontrol Et"}
        </button>
      </header>

      <section className="release-flow">
        <article className="release-stage release-stage--source">
          <span>1</span>
          <div>
            <small>KAYNAK</small>
            <strong>v{data.product.version}</strong>
            <p>{data.repo.branch} · {data.repo.head}</p>
          </div>
        </article>
        <div className="release-connector" />
        <article className="release-stage">
          <span>2</span>
          <div>
            <small>DESKTOP YAYINI</small>
            <strong>{publishedDesktop} / {data.release.desktop.length}</strong>
            <p>Manifest güncel</p>
          </div>
        </article>
        <div className="release-connector" />
        <article className="release-stage">
          <span>3</span>
          <div>
            <small>WEB MODÜLLERİ</small>
            <strong>{webInstallations.filter((item) => item.status === "ready").length} / {webInstallations.length}</strong>
            <p>Canlı sürüm uyumlu</p>
          </div>
        </article>
      </section>

      <section className="release-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">DESKTOP UPDATE FEED</p>
              <h2>Yayın manifestleri</h2>
            </div>
            <span className="status status--ready">Beklenen v{data.release.expectedVersion}</span>
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
                <button
                  className="text-button"
                  onClick={() => window.adminControlCenter.openExternal(channel.manifestUrl)}
                >
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
                  onClick={() => installation.versionEndpoint && window.adminControlCenter.openExternal(installation.versionEndpoint)}
                >
                  Endpoint
                </button>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel release-note">
        <Rocket size={20} />
        <div>
          <strong>Bu ekran henüz yayın işlemi yapmıyor.</strong>
          <p>
            Şimdilik canonical kaynaklarla canlı durumu salt-okunur doğruluyoruz. Build, doğrulama ve yayın
            workflow'larını sonraki dilimde bu snapshot'ın üzerine bağlayacağız.
          </p>
        </div>
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
  const [runState, setRunState] = useState<VerificationRunState>({
    running: false,
    selectionLabel: "",
    startedAt: null,
    finishedAt: null,
    result: "idle",
    exitCode: null,
    outputTail: []
  });
  const [runMessage, setRunMessage] = useState("");

  useEffect(() => {
    if (preset && !verification.presets.includes(preset)) {
      setPreset(verification.presets[0] ?? "");
    }
  }, [preset, verification.presets]);

  useEffect(() => {
    let previousRunning = false;
    let active = true;

    void window.adminControlCenter.getVerificationRunState().then((state) => {
      if (!active) return;
      previousRunning = state.running;
      setRunState(state);
    });

    const unsubscribe = window.adminControlCenter.onVerificationRunState((state) => {
      if (!active) return;
      const justFinished = previousRunning && !state.running;
      previousRunning = state.running;
      setRunState(state);
      if (justFinished) onRefresh();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [onRefresh]);

  const planIds = new Set(verification.plans[preset] ?? []);
  const visibleChecks = verification.checks.filter((check) =>
    planIds.has(check.id) && (domain === "all" || check.domains.includes(domain))
  );

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

  const startRun = useCallback(async (mode: "preset" | "domain" | "check", value: string) => {
    if (!value || runState.running) return;
    setRunMessage("");
    const result = await window.adminControlCenter.startVerification({ mode, value });
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
              disabled={!preset}
              onClick={() => void startRun("preset", preset)}
            >
              <Play size={16} />
              {preset || "Plan"} Çalıştır
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
          <div className="verification-result-icon" data-status={latestTone}>
            {verification.latest.result === "passed"
              ? <CheckCircle2 size={25} />
              : verification.latest.result === "failed"
                ? <XCircle size={25} />
                : <Timer size={25} />}
          </div>
          <div className="verification-latest-copy">
            <span>Son doğrulama</span>
            <strong>
              {verification.latest.available
                ? verification.latest.result === "passed"
                  ? "Temiz"
                  : verification.latest.result === "failed"
                    ? "Başarısız"
                    : verification.latest.result === "running"
                      ? "Çalışıyor"
                      : "Bilinmiyor"
                : "Henüz rapor yok"}
            </strong>
            <small>
              {verification.latest.available
                ? `${verification.latest.selectionLabel} · ${formatAge(verification.latest.ageMs)}`
                : "artifacts/verify/latest.json bulunamadı"}
            </small>
          </div>

          {verification.latest.available ? (
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

          <div className="verification-console">
            {runState.outputTail.length
              ? runState.outputTail.map((line, index) => <div key={`${index}:${line}`}>{line}</div>)
              : <div>{runMessage || "Çıktı bekleniyor…"}</div>}
          </div>
        </section>
      ) : null}

      <section className="panel verification-panel">
        <div className="panel-header verification-toolbar">
          <div>
            <p className="panel-kicker">CANONICAL PLAN</p>
            <h2>{preset || "Plan"} kontrolleri</h2>
          </div>
          <div className="verification-toolbar-actions">
            {domain !== "all" ? (
              <button
                className="button button--secondary button--compact"
                disabled={runState.running}
                onClick={() => void startRun("domain", domain)}
              >
                <Play size={14} />
                {domain} çalıştır
              </button>
            ) : null}
            <div className="domain-filter">
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
            </div>
          </div>
        </div>

        <div className="verification-list">
          {visibleChecks.map((check, index) => {
            const result = verification.latest.checks.find((item) => item.id === check.id);
            const resultStatus: StatusKind = result?.status === "passed"
              ? "ready"
              : result?.status === "failed"
                ? "error"
                : result?.status === "skipped"
                  ? "warning"
                  : "unknown";

            return (
              <div className="verification-row verification-row--action" key={check.id}>
                <span className="verification-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="verification-check-copy">
                  <strong>{check.label}</strong>
                  <small>
                    {check.id} · {check.domains.join(", ")}
                    {check.manual ? " · manuel" : ""}
                  </small>
                </div>
                <div className="verification-deps">
                  {check.requires.length ? `${check.requires.length} önkoşul` : "bağımsız"}
                </div>
                <div className="verification-last-status">
                  <span className={statusClass(resultStatus)}>
                    {result
                      ? result.status === "passed"
                        ? "Geçti"
                        : result.status === "failed"
                          ? "Kaldı"
                          : "Atlandı"
                      : "Sonuç yok"}
                  </span>
                  {result ? <small>{result.durationMs} ms</small> : null}
                </div>
                <button
                  className="text-button verification-run-check"
                  disabled={runState.running}
                  onClick={() => void startRun("check", check.id)}
                >
                  Çalıştır
                </button>
              </div>
            );
          })}
          {!visibleChecks.length ? <div className="empty-row">Bu filtre için kontrol bulunamadı.</div> : null}
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
  onRefresh
}: {
  data: OverviewSnapshot;
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
      setSelectedId((current) => current || nextTargets[0]?.id || "");
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
                <strong>{selectedInstallation ? credentialLabel(selectedInstallation.credentialStatus) : "—"}</strong>
                <small>{selectedInstallation?.credentialRef ?? "Referans yok"}</small>
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

function System({ data }: { data: OverviewSnapshot }) {
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<DependencyUpdateReport | null>(null);
  const [checkError, setCheckError] = useState("");

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
            Admin çalışma ortamı ve Yardımcı Asistan workspace bağımlılıklarının manuel kontrolü.
          </p>
        </div>
      </header>

      <section className="system-summary-grid">
        <article className="summary-card">
          <span>Repo</span>
          <strong>{data.repo.branch}</strong>
          <small>HEAD {data.repo.head}</small>
        </article>
        <article className="summary-card">
          <span>Ürün sürümü</span>
          <strong>v{data.product.version}</strong>
          <small>Web v{data.product.webModuleVersion} · Android #{data.product.androidVersionCode}</small>
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
              : "Yalnız isteğe bağlı olarak npm registry kontrol edilir."}
          </small>
        </article>
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
                      onClick={() => item.homepage && window.adminControlCenter.openExternal(item.homepage)}
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
        Bu yüzey henüz bağlanmadı. Genel Bakış, Kurulumlar, Release, Testler, Deploy ve Sistem gerçek veri hattı üzerinde;
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
  const [section, setSection] = useState<Section>("overview");
  const [data, setData] = useState<OverviewSnapshot | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadOverview = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await window.adminControlCenter.getOverview());
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
    if (!data) return { text: "Veri bekleniyor", tone: "unknown" as StatusKind };
    if (data.counts.errors > 0) return { text: `${data.counts.errors} hata`, tone: "error" as StatusKind };
    if (data.counts.drift > 0) return { text: `${data.counts.drift} dikkat`, tone: "warning" as StatusKind };
    return { text: "Sistemler stabil", tone: "ready" as StatusKind };
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
                onClick={() => setSection(item.id)}
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

      <main className="content">
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
          <Deploy data={data} onRefresh={() => void loadOverview()} />
        ) : section === "system" && data ? (
          <System data={data} />
        ) : section === "overview" || section === "installations" || section === "release" || section === "tests" || section === "deploy" || section === "system" ? (
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
