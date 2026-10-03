import {
  Activity,
  CloudUpload,
  FlaskConical,
  GitBranch,
  Home,
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
import type { InstallationSnapshot, OverviewSnapshot, StatusKind } from "../shared/contracts";

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
  if (status === "warning") return "Sürüm farkı";
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
            <small>{data.counts.drift ? `${data.counts.drift} sürüm farkı` : "Drift görünmüyor"}</small>
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

function Placeholder({ section }: { section: Section }) {
  const label = NAV_ITEMS.find((item) => item.id === section)?.label ?? section;

  return (
    <section className="placeholder">
      <div className="placeholder-icon"><TriangleAlert size={24} /></div>
      <p className="eyebrow">SONRAKİ DİLİM</p>
      <h1>{label}</h1>
      <p>
        Bu yüzey henüz bağlanmadı. Önce Genel Bakış gerçek veri hattını sabitliyoruz;
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
    if (data.counts.drift > 0) return `${data.counts.drift} drift`;
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
        ) : section === "overview" ? (
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
