import {
  ArrowDown,
  BarChart3,
  BedDouble,
  BellRing,
  CalendarCheck2,
  ChevronDown,
  CircleCheck,
  Globe2,
  HardDrive,
  ImageOff,
  Maximize2,
  MessageSquareText,
  Monitor,
  MonitorSmartphone,
  PackageSearch,
  QrCode,
  RefreshCw,
  Smartphone,
  Sparkles,
  UtensilsCrossed,
  X,
  type LucideIcon
} from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { PageKey } from "../types";
import "./product-guide.css";

type ProductGuidePageProps = {
  onNavigate: (page: PageKey) => void;
};

type Screenshot = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  kind?: "desktop" | "phone";
};

type Platform = {
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  items: string[];
  screenshot: Screenshot;
};

type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type GuideItem = {
  id: string;
  title: string;
  steps: string[];
  screenshots: Screenshot[];
};

const screenshots = {
  webAssistant: {
    src: "/assets/product-guide/web-assistant.webp",
    alt: "Deniz Çiçeği demo web sitesinde açık Yardımcı Asistan bilgi penceresi",
    caption: "Web sitesi ve AI destekli bilgi asistanı",
    width: 1366,
    height: 768,
    kind: "desktop"
  },
  desktopDashboard: {
    src: "/assets/product-guide/desktop-dashboard.webp",
    alt: "Yardımcı Asistan masaüstü uygulamasında günlük işletme özeti ve yapılacak işler",
    caption: "Masaüstü uygulamasının günlük yönetim ekranı",
    width: 1366,
    height: 768,
    kind: "desktop"
  },
  androidToday: {
    src: "/assets/product-guide/android-today.webp",
    alt: "Yardımcı Asistan Android uygulamasında Bugün ekranı ve öncelikli işler",
    caption: "Android uygulamasında Bugün ekranı",
    width: 720,
    height: 1280,
    kind: "phone"
  },
  desktopOrders: {
    src: "/assets/product-guide/desktop-orders.webp",
    alt: "Yardımcı Asistan masaüstü uygulamasında restoran masaları ve açık adisyonlar",
    caption: "Masaüstünde masa, sipariş ve hesap takibi",
    width: 1366,
    height: 768,
    kind: "desktop"
  },
  desktopRequests: {
    src: "/assets/product-guide/desktop-requests.webp",
    alt: "Yardımcı Asistan masaüstü uygulamasında yeni müşteri talepleri ve seçili rezervasyon talebi",
    caption: "Masaüstünde web taleplerini inceleme ve rezervasyona hazırlama",
    width: 1366,
    height: 768,
    kind: "desktop"
  },
  androidRestaurant: {
    src: "/assets/product-guide/android-restaurant.webp",
    alt: "Yardımcı Asistan Android uygulamasında restoran masaları ve sipariş işlemleri",
    caption: "Android uygulamasında restoran işlemleri",
    width: 720,
    height: 1280,
    kind: "phone"
  },
  desktopStock: {
    src: "/assets/product-guide/desktop-stock.webp",
    alt: "Yardımcı Asistan masaüstü uygulamasında fatura görselinden bulunan stok satırlarını onaylama ekranı",
    caption: "AI ile bulunan stok satırlarını kullanıcı onayıyla ekleme",
    width: 1440,
    height: 1000,
    kind: "desktop"
  },
  desktopReports: {
    src: "/assets/product-guide/desktop-reports.webp",
    alt: "Yardımcı Asistan masaüstü uygulamasında satış ve işletme raporları",
    caption: "Satış, rezervasyon ve işletme raporları",
    width: 1366,
    height: 768,
    kind: "desktop"
  },
  webQrMenu: {
    src: "/assets/product-guide/web-qr-menu.webp",
    alt: "Deniz Çiçeği demo web sitesinde QR menü ürünleri",
    caption: "Müşterilerin telefondan inceleyebildiği QR menü",
    width: 1366,
    height: 768,
    kind: "desktop"
  }
} satisfies Record<string, Screenshot>;

const platforms: Platform[] = [
  {
    label: "Web Sitesi",
    title: "Müşteri iletişimi web sitesinde başlar",
    description: "İşletmenizi tanıtır, talepleri toplar ve müşterinin doğru adıma ulaşmasını kolaylaştırır.",
    icon: Globe2,
    items: ["Oda ve masa talebi", "QR menü", "AI destekli bilgi asistanı", "WhatsApp hazır mesaj desteği"],
    screenshot: screenshots.webAssistant
  },
  {
    label: "Masaüstü Uygulaması",
    title: "İşletmenin ana yönetim merkezi",
    description: "Günlük operasyonlar ve kayıtlar işletmenin ana bilgisayarından düzenlenir.",
    icon: Monitor,
    items: [
      "Müşteri ve rezervasyon yönetimi",
      "Oda, masa ve adisyon takibi",
      "Menü ve stok yönetimi",
      "Bildirimler, raporlar ve ayarlar"
    ],
    screenshot: screenshots.desktopDashboard
  },
  {
    label: "Android Uygulaması",
    title: "Yönetici ve personel için hızlı mobil erişim",
    description: "Yetkiye göre sade ekranlar, sahadaki günlük işlemleri hızlandırır.",
    icon: Smartphone,
    items: [
      "Günlük işler ve rezervasyonlar",
      "Masa ve sipariş işlemleri",
      "Yetkiye göre sade ekranlar",
      "Bildirim ve stok işlemleri"
    ],
    screenshot: screenshots.androidToday
  }
];

const features: Feature[] = [
  {
    title: "Müşteri ve rezervasyon",
    description:
      "Web’den gelen talepleri görüntüleyin, müşteriye dönüş yapın ve uygun talepleri rezervasyona dönüştürün.",
    icon: CalendarCheck2
  },
  {
    title: "Pansiyon yönetimi",
    description:
      "Odaları, giriş-çıkış tarihlerini, rezervasyon durumlarını ve günlük işleri tek ekrandan takip edin.",
    icon: BedDouble
  },
  {
    title: "Restoran ve adisyon",
    description:
      "Masaları görüntüleyin, sipariş açın, ürün ekleyin ve hesabı ödeme durumuna göre yönetin.",
    icon: UtensilsCrossed
  },
  {
    title: "Menü ve stok",
    description:
      "Menü ürünlerini yönetin, siparişlerle stokları otomatik düşürün ve azalan ürünleri takip edin.",
    icon: PackageSearch
  },
  {
    title: "AI destekli işlemler",
    description:
      "Müşteri cevap önerileri alın, fatura görselinden stok satırları çıkarın ve raporları kısa AI yorumlarıyla değerlendirin.",
    icon: Sparkles
  },
  {
    title: "Android ve bildirimler",
    description:
      "Yönetici ve personele görevlerine göre uygun ekranları gösterin; önemli işletme gelişmelerini bildirimlerle takip edin.",
    icon: BellRing
  }
];

const flowSteps = [
  {
    number: "01",
    title: "Müşteri iletişime geçer",
    text: "Web formu, AI asistanı veya WhatsApp hazır mesajı üzerinden müşteri talebi başlar.",
    icon: MessageSquareText
  },
  {
    number: "02",
    title: "Masaüstü uygulaması düzenler",
    text: "Talep, rezervasyon, oda, masa, sipariş ve stok işlemleri ana bilgisayardan yönetilir.",
    icon: Monitor
  },
  {
    number: "03",
    title: "Android sahadaki işleri hızlandırır",
    text: "Yönetici ve personel, izin verilen işlemleri telefondan gerçekleştirir.",
    icon: Smartphone
  },
  {
    number: "04",
    title: "Sistem özetler",
    text: "Bildirimler, raporlar ve isteğe bağlı AI yorumları işletme sahibine güncel durumu gösterir.",
    icon: BarChart3
  }
];

const guideItems: GuideItem[] = [
  {
    id: "request",
    title: "Web talebini rezervasyona dönüştürme",
    steps: [
      "Müşteri İşleri bölümünü açın.",
      "Yeni talebi inceleyin.",
      "Müşteri bilgilerini doğrulayın.",
      "“Rezervasyona Dönüştür” işlemini seçin.",
      "Oda ve tarih bilgilerini kontrol ederek kaydedin."
    ],
    screenshots: [screenshots.desktopRequests]
  },
  {
    id: "order",
    title: "Masada sipariş ve hesap yönetimi",
    steps: [
      "Restoran bölümünden masayı seçin.",
      "Yeni adisyon açın.",
      "Menü ürünlerini siparişe ekleyin.",
      "Hazırlanıyor, servis edildi veya hesap bekliyor durumunu seçin.",
      "Ödeme tamamlandığında adisyonu kapatın."
    ],
    screenshots: [screenshots.desktopOrders, screenshots.androidRestaurant]
  },
  {
    id: "stock",
    title: "Görselden stok ekleme",
    steps: [
      "Menü veya stok bölümünü açın.",
      "Kamera ya da dosyadan fatura görseli seçin.",
      "AI tarafından bulunan satırları kontrol edin.",
      "Ürün eşleşmesini ve miktarı gerektiğinde düzeltin.",
      "Yalnız doğru satırları onaylayarak stoğa ekleyin."
    ],
    screenshots: [screenshots.desktopStock]
  },
  {
    id: "reports",
    title: "Rapor ve AI işletme yorumu",
    steps: [
      "Raporlar bölümünü açın.",
      "Bugün, Dün, 7 Gün, 30 Gün veya tarih aralığını seçin.",
      "Satış, rezervasyon, talep ve stok özetlerini inceleyin.",
      "Gerektiğinde AI yorum seçeneklerinden birini çalıştırın.",
      "AI yorumunun yalnız mevcut rapor verilerini açıkladığını unutmayın."
    ],
    screenshots: [screenshots.desktopReports]
  }
];

export default function ProductGuidePage({ onNavigate }: ProductGuidePageProps) {
  const [openGuideId, setOpenGuideId] = useState(guideItems[0].id);
  const [lightboxImage, setLightboxImage] = useState<Screenshot | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lightboxTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (lightboxImage && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [lightboxImage]);

  function openLightbox(image: Screenshot, trigger: HTMLButtonElement) {
    lightboxTriggerRef.current = trigger;
    setLightboxImage(image);
  }

  function closeLightbox() {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    } else {
      setLightboxImage(null);
    }
  }

  function handleDialogClose() {
    setLightboxImage(null);
    window.requestAnimationFrame(() => lightboxTriggerRef.current?.focus());
  }

  function handleDialogBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      closeLightbox();
    }
  }

  function scrollToPlatforms() {
    document.getElementById("product-platforms")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="product-page">
      <section className="product-hero" aria-labelledby="product-title">
        <div className="product-hero-inner">
          <div className="product-hero-copy">
            <p className="eyebrow">YARDIMCI ASİSTAN</p>
            <h1 id="product-title">İşletmenizin web, masaüstü ve mobil işlerini tek akışta yönetin.</h1>
            <p className="product-hero-lead">
              Yardımcı Asistan; pansiyon, restoran ve kafeler için müşteri taleplerini, rezervasyonları,
              masaları, siparişleri, stokları ve günlük işleri bir araya getiren yerel öncelikli bir işletme
              yönetim sistemidir.
            </p>
            <p className="product-hero-note">
              Web sitesi müşterilerle iletişimi başlatır, masaüstü uygulaması işletmenin yönetim merkezi
              olarak çalışır, Android uygulaması ise yönetici ve personele hareket halindeyken hızlı erişim
              sağlar.
            </p>
            <div className="product-hero-actions">
              <button className="primary-button" type="button" onClick={scrollToPlatforms}>
                <ArrowDown size={18} aria-hidden="true" />
                Nasıl çalıştığını görün
              </button>
              <button className="secondary-button dark" type="button" onClick={() => onNavigate("request")}>
                Demo talebi oluşturun
              </button>
            </div>
          </div>

          <div className="product-hero-diagram" aria-label="Web, masaüstü ve Android birlikte çalışır">
            <div className="product-hero-device product-hero-device-main">
              <MonitorSmartphone size={30} aria-hidden="true" />
              <span>Masaüstü</span>
              <small>Ana yönetim merkezi</small>
            </div>
            <div className="product-hero-device product-hero-device-web">
              <Globe2 size={22} aria-hidden="true" />
              <span>Web</span>
              <small>Müşteri iletişimi</small>
            </div>
            <div className="product-hero-device product-hero-device-mobile">
              <Smartphone size={22} aria-hidden="true" />
              <span>Android</span>
              <small>Hızlı saha erişimi</small>
            </div>
            <span className="product-sync-badge">
              <RefreshCw size={15} aria-hidden="true" />
              Otomatik güncelleme
            </span>
          </div>
        </div>
      </section>

      <section className="product-section" id="product-platforms" aria-labelledby="product-platform-title">
        <ProductSectionHeading
          eyebrow="Birlikte Çalışır"
          title="Üç parça, tek çalışma düzeni"
          text="Her platform kendi görevine odaklanır; bilgiler otomatik olarak güncellenir ve masaüstü uygulaması işletmenin ana yönetim merkezi olarak çalışır."
          titleId="product-platform-title"
        />
        <div className="product-platform-grid">
          {platforms.map((platform) => {
            const Icon = platform.icon;
            return (
              <article
                className={`product-platform-card${platform.screenshot.kind === "phone" ? " is-phone" : ""}`}
                key={platform.label}
              >
                <div className="product-platform-media">
                  <ProductScreenshot screenshot={platform.screenshot} onOpen={openLightbox} />
                </div>
                <div className="product-platform-copy">
                  <p className="product-card-label">
                    <Icon size={18} aria-hidden="true" />
                    {platform.label}
                  </p>
                  <h3>{platform.title}</h3>
                  <p>{platform.description}</p>
                  <ul>
                    {platform.items.map((item) => (
                      <li key={item}>
                        <CircleCheck size={16} aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="product-section" aria-labelledby="product-feature-title">
        <ProductSectionHeading
          eyebrow="Günlük İşler"
          title="İşletmenizde neleri kolaylaştırır?"
          text="Sık tekrarlanan işleri daha az ekran ve daha net adımlarla takip edin."
          titleId="product-feature-title"
        />
        <div className="product-feature-grid">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="product-feature-card" key={feature.title}>
                <span className="product-feature-icon">
                  <Icon size={23} aria-hidden="true" />
                </span>
                <div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
              </article>
            );
          })}
        </div>
        <p className="product-ai-note">
          <Sparkles size={18} aria-hidden="true" />
          AI özellikleri öneri sunar; kayıt ve stok değişiklikleri yalnız kullanıcı kontrolü ve onayıyla
          uygulanır.
        </p>
      </section>

      <section className="product-section" aria-labelledby="product-flow-title">
        <ProductSectionHeading
          eyebrow="Dört Adım"
          title="Nasıl çalışır?"
          text="Müşteri talebinden günlük işletme özetine kadar her platform akışın kendi bölümünü üstlenir."
          titleId="product-flow-title"
        />
        <ol className="product-flow">
          {flowSteps.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.number}>
                <div className="product-flow-top">
                  <span>{step.number}</span>
                  <Icon size={21} aria-hidden="true" />
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="product-section product-guide" aria-labelledby="product-guide-title">
        <ProductSectionHeading
          eyebrow="Hızlı Kullanım"
          title="Sık kullanılan işlemler"
          text="İhtiyacınız olan başlığı açın ve kısa adımları izleyin."
          titleId="product-guide-title"
        />
        <div className="product-accordion">
          {guideItems.map((item) => {
            const isOpen = openGuideId === item.id;
            const buttonId = `product-guide-button-${item.id}`;
            const panelId = `product-guide-panel-${item.id}`;
            return (
              <article className="product-accordion-item" key={item.id}>
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenGuideId(isOpen ? "" : item.id)}
                  >
                    <span>{item.title}</span>
                    <ChevronDown size={21} aria-hidden="true" />
                  </button>
                </h3>
                <div
                  className="product-accordion-panel"
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  aria-hidden={!isOpen}
                  data-open={isOpen}
                >
                  <div className="product-accordion-panel-inner">
                    <div className="product-guide-body">
                      <ol>
                        {item.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                      <div
                        className={`product-guide-media${item.screenshots.length > 1 ? " has-pair" : ""}`}
                        aria-label={`${item.title} ekran örnekleri`}
                      >
                        {item.screenshots.map((screenshot) => (
                          <ProductScreenshot
                            key={screenshot.src}
                            screenshot={screenshot}
                            onOpen={openLightbox}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="product-section product-local-band" aria-labelledby="product-local-title">
        <span className="product-local-icon">
          <HardDrive size={26} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Yerel Öncelikli</p>
          <h2 id="product-local-title">İşletmenin kontrolünde çalışan yapı</h2>
          <p>
            Temel işletme verileri masaüstünde yerel olarak saklanır. Web ve Android, işletmenin kendi
            web modülü üzerinden güncellenir; internet kesildiğinde masaüstündeki yerel işler kullanılmaya
            devam eder.
          </p>
          <p>
            Bağlantı geri geldiğinde bekleyen işlemler yeniden eşitlenir. AI isteğe bağlıdır; kullanılamadığında
            rezervasyon, sipariş, stok ve müşteri işlemleri devam eder.
          </p>
        </div>
      </section>

      <section className="product-section product-cta" aria-labelledby="product-cta-title">
        <div className="product-cta-copy">
          <p className="eyebrow">Canlı Demo</p>
          <h2 id="product-cta-title">Yardımcı Asistan’ın çalışma düzenini deneyin</h2>
          <p>
            Demo sitesi üzerinden müşteri talebi oluşturabilir, QR menüyü inceleyebilir ve sistemin
            işletme tarafındaki akışını görebilirsiniz.
          </p>
          <div className="product-cta-actions">
            <button className="primary-button" type="button" onClick={() => onNavigate("request")}>
              Demo talebi oluştur
            </button>
            <button className="secondary-button dark" type="button" onClick={() => onNavigate("menu")}>
              <QrCode size={18} aria-hidden="true" />
              QR menüyü incele
            </button>
            <button className="ghost-button" type="button" onClick={() => onNavigate("contact")}>
              İletişime geç
            </button>
          </div>
        </div>
        <div className="product-cta-media">
          <ProductScreenshot screenshot={screenshots.webQrMenu} onOpen={openLightbox} />
        </div>
      </section>

      <dialog
        className="product-lightbox"
        ref={dialogRef}
        aria-label="Ekran görüntüsü önizlemesi"
        onClick={handleDialogBackdropClick}
        onClose={handleDialogClose}
      >
        {lightboxImage && (
          <div className="product-lightbox-content">
            <button className="product-lightbox-close" type="button" onClick={closeLightbox} aria-label="Kapat">
              <X size={22} aria-hidden="true" />
            </button>
            <img
              src={lightboxImage.src}
              alt={lightboxImage.alt}
              width={lightboxImage.width}
              height={lightboxImage.height}
              loading="eager"
            />
            <p>{lightboxImage.caption}</p>
          </div>
        )}
      </dialog>
    </div>
  );
}

function ProductSectionHeading({
  eyebrow,
  title,
  text,
  titleId
}: {
  eyebrow: string;
  title: string;
  text: string;
  titleId: string;
}) {
  return (
    <div className="product-section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={titleId}>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function ProductScreenshot({
  screenshot,
  onOpen
}: {
  screenshot: Screenshot;
  onOpen: (image: Screenshot, trigger: HTMLButtonElement) => void;
}) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        className={`product-screenshot-placeholder${
          screenshot.kind === "phone" ? " product-screenshot-placeholder--phone" : ""
        }`}
        style={{ aspectRatio: `${screenshot.width} / ${screenshot.height}` }}
        role="img"
        aria-label={`${screenshot.alt}. Ekran görüntüsü hazırlanıyor.`}
      >
        <ImageOff size={25} aria-hidden="true" />
        <span>Ekran görüntüsü hazırlanıyor</span>
      </div>
    );
  }

  return (
    <button
      className={`product-screenshot${screenshot.kind === "phone" ? " product-screenshot--phone" : ""}`}
      type="button"
      style={{ aspectRatio: `${screenshot.width} / ${screenshot.height}` }}
      onClick={(event) => onOpen(screenshot, event.currentTarget)}
      aria-label={`${screenshot.caption} görselini büyüt`}
      title="Görseli büyüt"
    >
      <img
        src={screenshot.src}
        alt={screenshot.alt}
        width={screenshot.width}
        height={screenshot.height}
        loading="lazy"
        onError={() => setHasError(true)}
      />
      <span className="product-screenshot-action" aria-hidden="true">
        <Maximize2 size={16} />
        Büyüt
      </span>
    </button>
  );
}
