import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BedDouble,
  Boxes,
  CheckCircle2,
  Coffee,
  Database,
  Download,
  Globe2,
  HardDrive,
  KeyRound,
  Layers3,
  Monitor,
  PackageSearch,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  UtensilsCrossed,
  WifiOff
} from "lucide-react";

const DEFAULT_WEB_MODULE_URL = "https://yardimciasistan.alwaysdata.net/yardimci-asistan";
const WEB_MODULE_URL = String(import.meta.env.VITE_YA_WEB_MODULE_URL ?? DEFAULT_WEB_MODULE_URL).trim().replace(/\/+$/, "");
const SYNC_SECRET = String(import.meta.env.VITE_YA_SYNC_SECRET ?? "change-this-secret").trim();
const WIDGET_SCRIPT_ID = "yardimci-asistan-product-widget-script";
const WIDGET_VERSION = "20260902-product-site";
const SHOWCASE_BUSINESS_NAME = "Yardımcı Asistan Tanıtım İşletmesi";
const SHOWCASE_WHATSAPP = "+905316969334";
const DESKTOP_INSTALLER_VERSION = String(import.meta.env.VITE_YA_DESKTOP_INSTALLER_VERSION ?? "0.1.2").trim() || "0.1.2";
const DESKTOP_INSTALLER_URL =
  String(import.meta.env.VITE_YA_DESKTOP_INSTALLER_URL ?? "").trim() ||
  `/downloads/YardimciAsistan-Setup-${DESKTOP_INSTALLER_VERSION}.exe`;
const ANDROID_APP_VERSION = String(import.meta.env.VITE_YA_ANDROID_APP_VERSION ?? "0.1.1").trim() || "0.1.1";
const ANDROID_APK_URL =
  String(import.meta.env.VITE_YA_ANDROID_APK_URL ?? "").trim() ||
  `/downloads/YardimciAsistan-Android-${ANDROID_APP_VERSION}.apk`;

declare global {
  interface Window {
    YardimciAsistanWidget?: {
      init: (config?: Record<string, string>) => void;
    };
  }
}

type LiveStatus = "loading" | "online" | "partial" | "offline";

type LiveSystemState = {
  status: LiveStatus;
  checkedAt: string;
  protocolVersion?: number;
  storage?: string;
  serverRevision?: number;
  menuCategories?: number;
  menuItems?: number;
  menuUpdatedAt?: string;
  snapshotUpdatedAt?: string;
  operations?: {
    totalRooms: number;
    availableRooms: number;
    availableTables: number;
    occupiedTables: number;
    activeOrders: number;
    pendingReservations: number;
    pendingTasks: number;
    customerCount: number;
  };
  message?: string;
};

const features = [
  {
    icon: BedDouble,
    title: "Konaklama",
    text: "Oda, rezervasyon, giriş-çıkış, müşteri ve oda hesabını aynı akışta yönetin."
  },
  {
    icon: UtensilsCrossed,
    title: "Restoran & Kafe",
    text: "Masa, adisyon, sipariş, servis durumu ve oda hesabına aktarımı tek merkezden takip edin."
  },
  {
    icon: PackageSearch,
    title: "Menü & Stok",
    text: "QR menüyü yayınlayın, stokları izleyin ve görselden stok girişini kullanıcı onayıyla hızlandırın."
  },
  {
    icon: Sparkles,
    title: "AI Araçları",
    text: "Müşteri cevap önerileri, rapor yorumları, fatura ve kimlik alanı çıkarımı gibi yardımcı işlemleri isteğe bağlı kullanın."
  },
  {
    icon: Smartphone,
    title: "Android Companion",
    text: "Yönetici ve personel, yetkisine göre saha işlemlerini telefondan yapabilsin."
  },
  {
    icon: HardDrive,
    title: "Local-first",
    text: "Ana işletme verisi bilgisayardaki SQLite veritabanında yaşar; internet veya AI tek hata noktası değildir."
  }
];

const capabilityGroups = [
  {
    title: "Müşteri & Operasyon",
    items: ["Web talepleri", "Müşteri kayıtları", "Rezervasyonlar", "Günlük görevler", "Takvim", "Bildirimler"]
  },
  {
    title: "Konaklama",
    items: ["Oda yönetimi", "Giriş / çıkış", "Konaklama kaydı", "Oda folyosu", "Tahsilat", "Restoran hesabını odaya aktarma"]
  },
  {
    title: "Yiyecek & İçecek",
    items: ["Masa yönetimi", "Adisyon", "Sipariş durumu", "QR menü", "Stok takibi", "Kasa ve raporlar"]
  },
  {
    title: "Bağlantılar",
    items: ["Web widget", "Firma hostingi", "Otomatik senkron", "WhatsApp çalışma alanı", "Android cihaz rolleri", "Yedekleme / geri yükleme"]
  }
];

function App() {
  const [liveState, setLiveState] = useState<LiveSystemState>({ status: "loading", checkedAt: "" });
  useProductWidget();

  useEffect(() => {
    document.title = "Yardımcı Asistan | Küçük İşletmeler İçin Modüler İşletme Sistemi";
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute(
        "content",
        "Yardımcı Asistan; küçük işletmeler için masaüstü, web ve Android'i birleştiren local-first, modüler işletme yönetim sistemidir."
      );
  }, []);

  useEffect(() => {
    void refreshLiveSystem(setLiveState);
    const timer = window.setInterval(() => void refreshLiveSystem(setLiveState), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const liveLabel = useMemo(() => {
    if (liveState.status === "online") return "Canlı sistem bağlı";
    if (liveState.status === "partial") return "Canlı sistem kısmen bağlı";
    if (liveState.status === "offline") return "Canlı sistem bekleniyor";
    return "Canlı sistem kontrol ediliyor";
  }, [liveState.status]);

  function openAssistant() {
    const button = document.querySelector<HTMLButtonElement>(".ya-widget-button");
    button?.click();
  }

  return (
    <div className="product-site">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Yardımcı Asistan ana bölümü">
          <img src="/assets/yardimci-asistan-symbol.png" alt="" aria-hidden="true" />
          <span>
            <strong>Yardımcı Asistan</strong>
            <small>Modüler işletme sistemi</small>
          </span>
        </a>
        <nav aria-label="Tanıtım bölümleri">
          <a href="#urun">Ürün</a>
          <a href="#yetenekler">Yetenekler</a>
          <a href="#canli">Canlı Sistem</a>
          <a href="#alanlar">İşletme Profilleri</a>
          <a href="#kurulum">Kurulum</a>
        </nav>
        <a className="topbar-cta" href="#canli">Canlıyı Gör</a>
      </header>

      <main id="top">
        <section className="hero-section" id="urun">
          <div className="hero-glow hero-glow-one" />
          <div className="hero-glow hero-glow-two" />
          <div className="hero-copy">
            <div className="hero-kicker"><Layers3 size={17} /> Küçük işletmeler için tek merkez</div>
            <h1>Günlük işletme işlerini <span>tek sistemde</span> birleştirin.</h1>
            <p className="hero-lead">
              Müşteri talepleri, rezervasyonlar, odalar, masalar, siparişler, stok, kasa ve günlük işler;
              masaüstü, web ve Android üzerinde aynı işletme verisiyle birlikte çalışır.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#canli">Canlı sistemi incele <ArrowRight size={18} /></a>
              <a className="button secondary" href={DESKTOP_INSTALLER_URL} download>
                <Download size={18} /> Windows uygulaması
              </a>
            </div>
            <div className="hero-badges" aria-label="Ürün özellikleri">
              <span>Local-first</span><span>Windows</span><span>Android</span><span>Web</span><span>AI isteğe bağlı</span>
            </div>
          </div>

          <div className="hero-product" aria-label="Yardımcı Asistan uygulama ekranları">
            <div className="desktop-frame">
              <div className="frame-bar"><i /><i /><i /><span>Yardımcı Asistan · Masaüstü</span></div>
              <img src="/assets/product-guide/desktop-dashboard.webp" alt="Yardımcı Asistan masaüstü günlük yönetim ekranı" />
            </div>
            <div className="phone-frame">
              <div className="phone-speaker" />
              <img src="/assets/product-guide/android-today.webp" alt="Yardımcı Asistan Android Bugün ekranı" />
            </div>
            <div className="hero-live-chip"><span className="status-dot online" /> Web · Hosting · Desktop · Android</div>
          </div>
        </section>

        <section className="surface-section section-shell">
          <div className="section-intro compact">
            <p className="eyebrow">Tek veri · üç çalışma yüzeyi</p>
            <h2>İşletmenin merkezi masaüstünde, gerekli işler her yerde.</h2>
          </div>
          <div className="surface-grid">
            <article>
              <Monitor size={25} />
              <span className="surface-label">Masaüstü</span>
              <h3>Ana yönetim merkezi</h3>
              <p>Müşteri, rezervasyon, oda, masa, stok, finans, rapor ve sistem ayarları burada yönetilir.</p>
            </article>
            <article>
              <Globe2 size={25} />
              <span className="surface-label">Web</span>
              <h3>Müşteriyle ilk temas</h3>
              <p>Web formu, AI bilgi asistanı, QR menü ve firma hostingindeki mini API aynı sisteme bağlanır.</p>
            </article>
            <article>
              <Smartphone size={25} />
              <span className="surface-label">Android</span>
              <h3>Sahadaki hızlı işlemler</h3>
              <p>Telefonlar yönetici veya personel rolüne göre yalnız gerekli ekran ve işlemleri gösterir.</p>
            </article>
          </div>
        </section>

        <section className="flow-section">
          <div className="section-shell flow-layout">
            <div className="section-intro">
              <p className="eyebrow">Gerçek iş akışı</p>
              <h2>Bir kayıt sisteme girer, bütün çalışma yüzeylerine ulaşır.</h2>
              <p>
                Yardımcı Asistan ayrı ayrı çalışan araçlar toplamı değildir. Web talebinden masaüstü operasyonuna,
                Android görünümünden QR menü yayınına kadar aynı işletme omurgasını kullanır.
              </p>
            </div>
            <div className="flow-diagram" aria-label="Yardımcı Asistan veri akışı">
              <FlowNode icon={Globe2} label="Web" text="Talep · AI · QR Menü" />
              <div className="flow-arrow">→</div>
              <FlowNode icon={Server} label="Firma Hosting" text="PHP · SQLite · Sync" />
              <div className="flow-arrow">→</div>
              <FlowNode icon={Monitor} label="Masaüstü" text="Ana işletme verisi" accent />
              <div className="flow-arrow down">↕</div>
              <FlowNode icon={Smartphone} label="Android" text="Yetkili saha işlemleri" />
            </div>
          </div>
        </section>

        <section className="feature-section section-shell" id="yetenekler">
          <div className="section-intro">
            <p className="eyebrow">Bugünkü ürün</p>
            <h2>Pansiyon ve restoran operasyonunun büyük kısmı tek uygulamada.</h2>
            <p>AI veya internet bağlantısı faydalı bir katmandır; işletmenin temel kayıt sistemi bunlara bağımlı değildir.</p>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text }) => (
              <article className="feature-card" key={title}>
                <div className="feature-icon"><Icon size={23} /></div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>

          <div className="capability-grid">
            {capabilityGroups.map((group) => (
              <article key={group.title}>
                <h3>{group.title}</h3>
                <ul>
                  {group.items.map((item) => <li key={item}><CheckCircle2 size={15} /> {item}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="screens-section">
          <div className="section-shell">
            <div className="section-intro">
              <p className="eyebrow">Gerçek uygulama ekranları</p>
              <h2>Tanıtım için ayrı bir maket değil, çalışan ürün.</h2>
            </div>
            <div className="screens-grid">
              <ScreenCard src="/assets/product-guide/desktop-requests.webp" title="Web talepleri" text="Webden gelen talebi inceleyin ve rezervasyon akışına alın." />
              <ScreenCard src="/assets/product-guide/desktop-orders.webp" title="Restoran operasyonu" text="Masa, adisyon ve sipariş durumunu yönetin." />
              <ScreenCard src="/assets/product-guide/desktop-stock.webp" title="Stok ve AI" text="Fatura görselinden bulunan stok satırlarını kontrol ederek ekleyin." />
              <ScreenCard src="/assets/product-guide/desktop-reports.webp" title="Raporlar" text="Satış, rezervasyon, talep ve işletme özetlerini görün." />
            </div>
          </div>
        </section>

        <section className="live-section section-shell" id="canli">
          <div className="live-heading">
            <div className="section-intro">
              <p className="eyebrow">Canlı Yardımcı Asistan kurulumu</p>
              <h2>Bu sayfanın arkasında ürünün gerçek web modülü çalışıyor.</h2>
              <p>
                Aşağıdaki bilgiler tanıtım için hazırlanmış ayrı bir mock API'den değil; Yardımcı Asistan'ın firma hostingine
                kurulan PHP + SQLite modülünden okunur. Masaüstü yayın yaptığında bu görünüm de değişir.
              </p>
            </div>
            <button className="refresh-button" type="button" onClick={() => void refreshLiveSystem(setLiveState)}>
              <RefreshCw size={17} /> Yenile
            </button>
          </div>

          <div className="live-console">
            <div className="live-console-top">
              <div>
                <span className={`status-dot ${liveState.status === "online" ? "online" : liveState.status === "partial" ? "partial" : "offline"}`} />
                <strong>{liveLabel}</strong>
              </div>
              <span>{liveState.checkedAt ? `Son kontrol ${formatTime(liveState.checkedAt)}` : "Bağlantı kontrol ediliyor"}</span>
            </div>

            <div className="live-system-grid">
              <StatusCard label="Web Modülü" value={liveState.status === "offline" ? "Bekleniyor" : "Çalışıyor"} detail={WEB_MODULE_URL.replace(/^https?:\/\//, "")} />
              <StatusCard label="Senkron Protokolü" value={liveState.protocolVersion ? `v${liveState.protocolVersion}` : "—"} detail={liveState.storage ? `${liveState.storage} depolama` : "Hosting bağlantısı"} />
              <StatusCard label="QR Menü" value={typeof liveState.menuItems === "number" ? `${liveState.menuItems} ürün` : "—"} detail={typeof liveState.menuCategories === "number" ? `${liveState.menuCategories} kategori` : "Yayın bekleniyor"} />
              <StatusCard label="Server Revision" value={typeof liveState.serverRevision === "number" ? String(liveState.serverRevision) : "—"} detail={liveState.snapshotUpdatedAt ? `Snapshot ${formatTime(liveState.snapshotUpdatedAt)}` : "Canlı veri sürümü"} />
            </div>

            {liveState.operations ? (
              <div className="operations-grid" aria-label="Canlı işletme özeti">
                <Operation label="Oda" value={`${liveState.operations.availableRooms}/${liveState.operations.totalRooms}`} detail="müsait / toplam" />
                <Operation label="Masa" value={String(liveState.operations.availableTables)} detail="müsait" />
                <Operation label="Aktif adisyon" value={String(liveState.operations.activeOrders)} detail="açık işlem" />
                <Operation label="Rezervasyon" value={String(liveState.operations.pendingReservations)} detail="bekleyen" />
                <Operation label="Görev" value={String(liveState.operations.pendingTasks)} detail="bekleyen" />
                <Operation label="Müşteri" value={String(liveState.operations.customerCount)} detail="snapshot" />
              </div>
            ) : (
              <div className="live-note">
                <Database size={20} />
                <div>
                  <strong>Canlı operasyon snapshot'ı henüz yayınlanmadı.</strong>
                  <p>{liveState.message ?? "QR menü ve hosting bağlantısı yine gerçek web modülünden kontrol ediliyor."}</p>
                </div>
              </div>
            )}

            <div className="live-actions">
              <button className="button primary" type="button" onClick={openAssistant}>Web iletişimini dene <ArrowRight size={18} /></button>
              <a className="button secondary" href={`${WEB_MODULE_URL}/menu.html`} target="_blank" rel="noreferrer">Canlı QR menüyü aç</a>
              <details className="technical-details">
                <summary>Teknik bağlantı</summary>
                <div><span>Sync endpoint</span><code>{WEB_MODULE_URL}/api/sync.php</code></div>
                <div><span>Canlı özet</span><code>{WEB_MODULE_URL}/api/operations.php</code></div>
                <div><span>Sync key</span><code>{SYNC_SECRET}</code></div>
              </details>
            </div>
          </div>
        </section>

        <section className="profiles-section" id="alanlar">
          <div className="section-shell">
            <div className="section-intro">
              <p className="eyebrow">Modüler ürün yönü</p>
              <h2>Yazılım bir sektöre kilitlenmek yerine işletme profilleriyle büyüyor.</h2>
              <p>Bugün konaklama ve yiyecek-içecek aktif. Sıradaki hedef, aynı çekirdeği perakende operasyonuna açmak.</p>
            </div>
            <div className="profile-grid">
              <ProfileCard icon={BedDouble} title="Pansiyon" status="Kullanılabilir" text="Oda, rezervasyon, müşteri, konaklama, oda folyosu ve günlük işler." />
              <ProfileCard icon={Coffee} title="Restoran / Kafe" status="Kullanılabilir" text="Masa, adisyon, menü, stok, servis, kasa ve rapor akışı." />
              <ProfileCard icon={Layers3} title="Pansiyon + Restoran" status="Kullanılabilir" text="İki domain birlikte; masa hesabını açık oda hesabına aktarabilen hibrit profil." />
              <ProfileCard icon={Store} title="Market / Perakende" status="Sıradaki hedef" upcoming text="Barkod, hızlı satış, stok, etiket ve Android telefonu barkod tarayıcı olarak kullanma yönü." />
            </div>
          </div>
        </section>

        <section className="local-section section-shell">
          <div className="local-card">
            <div className="local-copy">
              <p className="eyebrow">Local-first tasarım</p>
              <h2>İşletmenin ana kayıtları kendi bilgisayarında.</h2>
              <p>
                Masaüstü uygulaması yerel SQLite veritabanıyla çalışır. Firma hostingine web talepleri, yayınlar ve Android için
                gerekli senkron verileri gider. Bağlantı geri geldiğinde kuyruklar çalışmaya devam eder.
              </p>
              <div className="resilience-list">
                <span><WifiOff size={17} /> İnternet kesilse de yerel operasyon devam eder.</span>
                <span><Sparkles size={17} /> AI kapalıyken temel işletme sistemi çalışır.</span>
                <span><ShieldCheck size={17} /> Yedekleme ve geri yükleme masaüstünden yönetilir.</span>
              </div>
            </div>
            <div className="local-visual">
              <div className="local-node small"><Globe2 size={22} /><span>Web</span></div>
              <div className="local-line vertical" />
              <div className="local-node"><Monitor size={28} /><span>Masaüstü + SQLite</span><small>Ana kayıt merkezi</small></div>
              <div className="local-line horizontal" />
              <div className="local-node small phone"><Smartphone size={22} /><span>Android</span></div>
            </div>
          </div>
        </section>

        <section className="install-section" id="kurulum">
          <div className="section-shell install-layout">
            <div className="section-intro">
              <p className="eyebrow">Kurulum</p>
              <h2>Özel POS donanımıyla başlamak zorunda değilsiniz.</h2>
              <p>
                Windows bilgisayar ana merkezdir. Android telefon mevcut cihazlarla saha terminali olarak kullanılabilir;
                işletme büyüdükçe yeni donanımlar ve domain modülleri eklenebilir.
              </p>
            </div>
            <div className="download-grid">
              <a className="download-card" href={DESKTOP_INSTALLER_URL} download>
                <Monitor size={27} />
                <div><small>Windows 10 / 11 · x64</small><strong>Yardımcı Asistan Desktop</strong><span>Sürüm {DESKTOP_INSTALLER_VERSION}</span></div>
                <Download size={20} />
              </a>
              <a className="download-card" href={ANDROID_APK_URL} download>
                <Smartphone size={27} />
                <div><small>Android 8.0+</small><strong>Android Companion</strong><span>Sürüm {ANDROID_APP_VERSION}</span></div>
                <Download size={20} />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="footer-brand">
          <img src="/assets/yardimci-asistan-symbol.png" alt="" aria-hidden="true" />
          <div><strong>Yardımcı Asistan</strong><span>Küçük işletmeler için modüler, local-first işletme sistemi.</span></div>
        </div>
        <a href="#top">Başa dön ↑</a>
      </footer>
    </div>
  );
}

function FlowNode({ icon: Icon, label, text, accent = false }: { icon: typeof Globe2; label: string; text: string; accent?: boolean }) {
  return (
    <div className={accent ? "flow-node accent" : "flow-node"}>
      <Icon size={22} />
      <strong>{label}</strong>
      <span>{text}</span>
    </div>
  );
}

function ScreenCard({ src, title, text }: { src: string; title: string; text: string }) {
  return (
    <article className="screen-card">
      <div className="screen-image"><img src={src} alt={`${title} Yardımcı Asistan ekranı`} loading="lazy" /></div>
      <div><h3>{title}</h3><p>{text}</p></div>
    </article>
  );
}

function StatusCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="status-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Operation({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function ProfileCard({ icon: Icon, title, status, text, upcoming = false }: { icon: typeof BedDouble; title: string; status: string; text: string; upcoming?: boolean }) {
  return (
    <article className={upcoming ? "profile-card upcoming" : "profile-card"}>
      <div className="profile-card-top"><Icon size={25} /><span>{status}</span></div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function useProductWidget() {
  useEffect(() => {
    if (!WEB_MODULE_URL) return;

    const config = {
      businessName: SHOWCASE_BUSINESS_NAME,
      whatsappPhone: SHOWCASE_WHATSAPP,
      apiBaseUrl: WEB_MODULE_URL,
      logoUrl: `${WEB_MODULE_URL}/assets/yardimci-asistan-symbol.png`,
      primaryColor: "#2dd4bf",
      accentColor: "#5eead4"
    };

    const existing = document.getElementById(WIDGET_SCRIPT_ID);
    if (existing) {
      window.YardimciAsistanWidget?.init(config);
      return;
    }

    const script = document.createElement("script");
    script.id = WIDGET_SCRIPT_ID;
    script.src = `${WEB_MODULE_URL}/widget.js?v=${WIDGET_VERSION}`;
    script.async = true;
    script.dataset.businessName = config.businessName;
    script.dataset.whatsappPhone = config.whatsappPhone;
    script.dataset.apiBaseUrl = config.apiBaseUrl;
    script.dataset.logoUrl = config.logoUrl;
    script.dataset.primaryColor = config.primaryColor;
    script.dataset.accentColor = config.accentColor;
    document.body.appendChild(script);
  }, []);
}

async function refreshLiveSystem(setState: (value: LiveSystemState) => void) {
  setState({ status: "loading", checkedAt: new Date().toISOString() });
  const checkedAt = new Date().toISOString();

  try {
    const menuPromise = fetch(`${WEB_MODULE_URL}/api/menu.php`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("menu_unavailable");
        return await response.json() as {
          ok?: boolean;
          categories?: unknown[];
          items?: unknown[];
          updated_at?: string;
          server_revision?: number;
        };
      });

    const capabilitiesPromise = callSync({ action: "capabilities" });
    const operationsPromise = fetch(`${WEB_MODULE_URL}/api/operations.php`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-YA-Sync-Secret": SYNC_SECRET
      }
    }).then(async (response) => {
      const result = await response.json().catch(() => null) as Record<string, any> | null;
      if (!response.ok || !result) throw new Error(`operations_${response.status}`);
      return result;
    });

    const [menuResult, capabilitiesResult, operationsResult] = await Promise.allSettled([
      menuPromise,
      capabilitiesPromise,
      operationsPromise
    ]);

    const menu = menuResult.status === "fulfilled" ? menuResult.value : null;
    const capabilities = capabilitiesResult.status === "fulfilled" ? capabilitiesResult.value : null;
    const liveOperations = operationsResult.status === "fulfilled" ? operationsResult.value : null;
    const anyOnline = Boolean(menu?.ok || capabilities?.ok || liveOperations?.ok);
    const operations = liveOperations?.ok && liveOperations.published === true
      ? normalizeOperations(liveOperations.operations)
      : undefined;

    setState({
      status: operations && menu?.ok && capabilities?.ok ? "online" : anyOnline ? "partial" : "offline",
      checkedAt,
      protocolVersion: toOptionalNumber(capabilities?.protocol_version),
      storage: typeof capabilities?.storage === "string" ? capabilities.storage : undefined,
      serverRevision: toOptionalNumber(liveOperations?.server_revision ?? capabilities?.server_revision ?? menu?.server_revision),
      menuCategories: Array.isArray(menu?.categories) ? menu.categories.length : undefined,
      menuItems: Array.isArray(menu?.items) ? menu.items.length : undefined,
      menuUpdatedAt: typeof menu?.updated_at === "string" ? menu.updated_at : undefined,
      snapshotUpdatedAt: typeof liveOperations?.updated_at === "string" ? liveOperations.updated_at : undefined,
      operations,
      message: !operations
        ? (typeof liveOperations?.message === "string" ? liveOperations.message : "Masaüstü henüz operasyon snapshot'ı yayınlamadı.")
        : undefined
    });
  } catch (error) {
    setState({
      status: "offline",
      checkedAt,
      message: error instanceof Error ? error.message : "Canlı web modülüne ulaşılamadı."
    });
  }
}

async function callSync(payload: Record<string, unknown>) {
  const response = await fetch(`${WEB_MODULE_URL}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": SYNC_SECRET
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !result) throw new Error(`sync_${response.status}`);
  return result;
}

function normalizeOperations(value: unknown): LiveSystemState["operations"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  return {
    totalRooms: toNumber(data.total_rooms),
    availableRooms: toNumber(data.available_rooms),
    availableTables: toNumber(data.available_tables),
    occupiedTables: toNumber(data.occupied_tables),
    activeOrders: toNumber(data.active_table_orders),
    pendingReservations: toNumber(data.pending_reservations),
    pendingTasks: toNumber(data.pending_daily_tasks),
    customerCount: toNumber(data.customer_count)
  };
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

export default App;
