import {
  Activity,
  CloudUpload,
  ExternalLink,
  FlaskConical,
  GitBranch,
  Globe2,
  Home,
  KeyRound,
  LifeBuoy,
  PackageCheck,
  RefreshCw,
  Rocket,
  Server,
  Settings,
  ShieldCheck,
  TriangleAlert
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  HealthCheckSnapshot,
  InstallationSnapshot,
  OverviewSnapshot,
  StatusKind
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

function Placeholder({ section }: { section: Section }) {
  const label = NAV_ITEMS.find((item) => item.id === section)?.label ?? section;

  return (
    <section className="placeholder">
      <div className="placeholder-icon"><TriangleAlert size={24} /></div>
      <p className="eyebrow">SONRAKİ DİLİM</p>
      <h1>{label}</h1>
      <p>
        Bu yüzey henüz bağlanmadı. Genel Bakış, Kurulumlar ve Release gerçek veri hattı üzerinde;
        sonraki ekranlar aynı güvenli IPC sınırı üzerinden eklenecek.
      </p>
    </section>
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

  const statusText = useMemo(() => {
    if (!data) return "Veri bekleniyor";
    if (data.counts.errors > 0) return `${data.counts.errors} hata`;
    if (data.counts.drift > 0) return `${data.counts.drift} dikkat`;
    return "Sistemler stabil";
  }, [data]);

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
          <span className="pulse-dot" />
          <div>
            <strong>{statusText}</strong>
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
        ) : section === "overview" || section === "installations" || section === "release" ? (
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
