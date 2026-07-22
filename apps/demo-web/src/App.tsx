import { useEffect, useId, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { buildCustomerRequestWhatsAppMessage, createWhatsAppUrl } from "@yardimci-asistan/whatsapp-bridge";
import {
  BedDouble,
  CalendarDays,
  CalendarPlus,
  Check,
  Coffee,
  Copy,
  Download,
  Home,
  Images,
  KeyRound,
  Link2,
  MapPin,
  Menu as MenuIcon,
  MessageCircle,
  MessageSquareText,
  Minus,
  MonitorDown,
  Navigation,
  Phone,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Smartphone,
  UtensilsCrossed,
  Users
} from "lucide-react";
import businessJson from "../config/business.json";
import type { BusinessConfig, PageKey } from "./types";

const business = businessJson as BusinessConfig;
type RequestSubmitState = "idle" | "saving" | "saved" | "fallback" | "error";
const DEMO_WIDGET_SCRIPT_ID = "yardimci-asistan-demo-widget-script";
const DEMO_WIDGET_VERSION = "20260722-menu-link-removed";
const DEFAULT_WEB_MODULE_URL = "https://yardimciasistan.alwaysdata.net/yardimci-asistan";
const DESKTOP_INSTALLER_VERSION = String(import.meta.env.VITE_YA_DESKTOP_INSTALLER_VERSION ?? "0.1.1").trim() || "0.1.1";
const DESKTOP_INSTALLER_URL =
  String(import.meta.env.VITE_YA_DESKTOP_INSTALLER_URL ?? "").trim() ||
  `/downloads/YardimciAsistan-Setup-${DESKTOP_INSTALLER_VERSION}.exe`;
const DESKTOP_INSTALLER_X86_URL =
  String(import.meta.env.VITE_YA_DESKTOP_INSTALLER_X86_URL ?? "").trim() ||
  `/downloads/YardimciAsistan-Setup-${DESKTOP_INSTALLER_VERSION}-x86.exe`;
const ANDROID_APP_VERSION = String(import.meta.env.VITE_YA_ANDROID_APP_VERSION ?? "0.1.0").trim() || "0.1.0";
const ANDROID_APK_URL =
  String(import.meta.env.VITE_YA_ANDROID_APK_URL ?? "").trim() ||
  `/downloads/YardimciAsistan-Android-${ANDROID_APP_VERSION}.apk`;
const DEMO_SYNC_SECRET = String(import.meta.env.VITE_YA_SYNC_SECRET ?? "").trim();

declare global {
  interface Window {
    YardimciAsistanWidget?: {
      init: (config?: Record<string, string>) => void;
    };
  }
}

const navItems: Array<{ key: PageKey; label: string; icon: typeof Home }> = [
  { key: "home", label: "Ana Sayfa", icon: Home },
  { key: "rooms", label: "Odalar", icon: BedDouble },
  { key: "restaurant", label: "Restoran / Kafe", icon: Coffee },
  { key: "menu", label: "QR Menü", icon: MenuIcon },
  { key: "gallery", label: "Galeri", icon: Images },
  { key: "location", label: "Ulaşım", icon: MapPin },
  { key: "contact", label: "İletişim", icon: Phone }
];

const pageKeys: PageKey[] = ["home", "rooms", "restaurant", "menu", "gallery", "location", "contact", "request", "settings"];

const requestTypeOptions = [
  { value: "pension_reservation", label: "Oda rezervasyonu", icon: BedDouble },
  { value: "restaurant_reservation", label: "Masa talebi", icon: UtensilsCrossed },
  { value: "general_info", label: "Bilgi al", icon: MessageSquareText }
] as const;
type RequestType = (typeof requestTypeOptions)[number]["value"];
type NavigateToPage = (page: PageKey, requestType?: RequestType) => void;

const serviceIcons = {
  bed: BedDouble,
  coffee: Coffee,
  table: UtensilsCrossed
};

function App() {
  const [activePage, setActivePage] = useState<PageKey>(() => getPageFromLocation());
  const [initialRequestType, setInitialRequestType] = useState<RequestType>("pension_reservation");
  const themeStyle = {
    "--primary": business.colors.primary,
    "--accent": business.colors.accent,
    "--ink": business.colors.ink
  } as CSSProperties;

  useDemoWidget();

  useEffect(() => {
    const syncPageFromLocation = () => {
      setActivePage(getPageFromLocation());
      window.scrollTo({ top: 0 });
    };

    window.addEventListener("popstate", syncPageFromLocation);
    return () => window.removeEventListener("popstate", syncPageFromLocation);
  }, []);

  function goToPage(page: PageKey, requestType?: RequestType) {
    if (page === "request" && requestType) {
      setInitialRequestType(requestType);
    }
    setActivePage(page);
    const nextUrl = new URL(window.location.href);
    nextUrl.hash = page === "home" ? "" : page;
    window.history.pushState({ page }, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="app" style={themeStyle}>
      <Header activePage={activePage} onNavigate={goToPage} />
      <main>
        {activePage === "home" && <HomePage onNavigate={goToPage} />}
        {activePage === "rooms" && <RoomsPage onNavigate={goToPage} />}
        {activePage === "restaurant" && <RestaurantPage onNavigate={goToPage} />}
        {activePage === "menu" && <MenuPage onNavigate={goToPage} />}
        {activePage === "gallery" && <GalleryPage />}
        {activePage === "location" && <LocationPage />}
        {activePage === "contact" && <ContactPage onNavigate={goToPage} />}
        {activePage === "request" && <RequestPage initialRequestType={initialRequestType} />}
        {activePage === "settings" && <SettingsPage />}
      </main>
      <Footer onNavigate={goToPage} />
    </div>
  );
}

function useDemoWidget() {
  useEffect(() => {
    const webModuleBaseUrl = getWebModuleBaseUrl();
    if (!webModuleBaseUrl) {
      return;
    }

    const config = {
      businessName: business.display_name,
      whatsappPhone: business.whatsapp,
      apiBaseUrl: getWebModuleApiBaseUrl(),
      logoUrl: `${webModuleBaseUrl}/assets/yardimci-asistan-symbol.png`,
      primaryColor: business.colors.primary,
      accentColor: business.colors.accent
    };

    const existingScript = document.getElementById(DEMO_WIDGET_SCRIPT_ID);
    if (existingScript) {
      window.YardimciAsistanWidget?.init(config);
      return;
    }

    const script = document.createElement("script");
    script.id = DEMO_WIDGET_SCRIPT_ID;
    script.src = `${webModuleBaseUrl}/widget.js?v=${DEMO_WIDGET_VERSION}`;
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

function Header({ activePage, onNavigate }: { activePage: PageKey; onNavigate: NavigateToPage }) {
  const brandLogoUrl = business.logo_url || "/assets/yardimci-asistan-symbol.png";

  return (
    <header className="site-header">
      <button className="brand-button" onClick={() => onNavigate("home")} aria-label="Ana sayfaya git">
        <img className="brand-symbol" src={brandLogoUrl} alt="" aria-hidden="true" />
        <span>
          <strong>{business.display_name}</strong>
          <small>Yardımcı Asistan Demo</small>
        </span>
      </button>
      <nav className="site-nav" aria-label="Ana menü">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className={activePage === item.key ? "nav-button is-active" : "nav-button"}
              onClick={() => onNavigate(item.key)}
              aria-label={item.label}
              aria-current={activePage === item.key ? "page" : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function HomePage({ onNavigate }: { onNavigate: NavigateToPage }) {
  return (
    <>
      <section className="hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(23, 32, 51, 0.78), rgba(23, 32, 51, 0.2)), url(${business.hero.image_url})` }}>
        <div className="hero-content">
          <p className="eyebrow">{business.hero.eyebrow}</p>
          <h1>{business.hero.title}</h1>
          <p>{business.hero.summary}</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => onNavigate("request", "pension_reservation")}>
              <CalendarPlus size={19} aria-hidden="true" />
              Rezervasyon Talebi Oluştur
            </button>
            <a className="secondary-button" href={createWhatsAppLink(business.whatsapp, "Merhaba, bilgi almak istiyorum.")} target="_blank" rel="noreferrer">
              <MessageCircle size={19} aria-hidden="true" />
              WhatsApp'tan Yaz
            </a>
          </div>
        </div>
      </section>

      <section className="quick-strip" aria-label="Öne çıkan bilgiler">
        {business.highlights.map((highlight) => (
          <article key={highlight.label} className="quick-item">
            <strong>{highlight.label}</strong>
            <span>{highlight.description}</span>
          </article>
        ))}
      </section>

      <SectionHeading title="Sizin İçin Hazır" text={business.description} />
      <section className="service-grid">
        {business.services.map((service) => {
          const Icon = serviceIcons[service.icon];
          return (
            <article className="info-card" key={service.title}>
              <Icon size={24} aria-hidden="true" />
              <h3>{service.title}</h3>
              <p>{service.description}</p>
            </article>
          );
        })}
      </section>

      <section className="feature-band">
        <img src="/assets/demo-breakfast.webp" alt="Bahçe kahvaltı masası" />
        <div>
          <p className="eyebrow">Günlük Akış</p>
          <h2>Konaklama ve masa talepleri tek yerden başlar.</h2>
          <p>Misafir formu doldurur, WhatsApp mesajı hazır açılır ve işletme talebi kolayca takip eder.</p>
          <div className="inline-actions">
            <button className="primary-button" onClick={() => onNavigate("rooms")}>
              <BedDouble size={18} aria-hidden="true" />
              Odaları Gör
            </button>
            <button className="ghost-button" onClick={() => onNavigate("menu")}>
              <MenuIcon size={18} aria-hidden="true" />
              Menüyü Aç
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function RoomsPage({ onNavigate }: { onNavigate: NavigateToPage }) {
  return (
    <PageShell title="Pansiyon / Odalar" text="Müsaitlik ve fiyat bilgisi işletme tarafından kontrol edilerek paylaşılır.">
      <section className="room-grid">
        {business.rooms.map((room) => (
          <article className="room-card" key={room.id}>
            <img src={room.image_url} alt={room.name} />
            <div className="room-card-body">
              <div className="card-title-row">
                <h3>{room.name}</h3>
                <span className="badge">
                  <Users size={15} aria-hidden="true" />
                  {room.capacity} kişi
                </span>
              </div>
              <p>{room.description}</p>
              <p className="muted">{room.bed_info}</p>
              <div className="chip-row">
                {room.features.map((feature) => (
                  <span key={feature}>{feature}</span>
                ))}
              </div>
              <p className="note">{room.price_note}</p>
              <button className="primary-button" onClick={() => onNavigate("request", "pension_reservation")}>
                <CalendarPlus size={18} aria-hidden="true" />
                Bu Oda İçin Talep Oluştur
              </button>
            </div>
          </article>
        ))}
      </section>
    </PageShell>
  );
}

function RestaurantPage({ onNavigate }: { onNavigate: NavigateToPage }) {
  return (
    <PageShell title="Restoran / Kafe" text="Bahçe masaları, kahvaltı ve hafif lezzetler için hızlıca masa talebi oluşturabilirsiniz.">
      <section className="feature-band reverse">
        <img src="/assets/demo-breakfast.webp" alt="Kahvaltı ve kafe masası" />
        <div>
          <p className="eyebrow">Bahçe ve Salon</p>
          <h2>Sakin kahvaltı, akşam servisi ve gün boyu kafe.</h2>
          <p>Kalabalık gruplar ve özel masa tercihleri için not bırakabilirsiniz.</p>
          <div className="table-list">
            {business.tables.map((table) => (
              <span key={`${table.name}-${table.area}`}>
                {table.name} • {table.area} • {table.capacity} kişi
              </span>
            ))}
          </div>
          <div className="inline-actions">
            <button className="primary-button" onClick={() => onNavigate("request", "restaurant_reservation")}>
              <CalendarPlus size={18} aria-hidden="true" />
              Masa Talebi Oluştur
            </button>
            <button className="ghost-button" onClick={() => onNavigate("menu")}>
              <MenuIcon size={18} aria-hidden="true" />
              QR Menü
            </button>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

function MenuPage({ onNavigate }: { onNavigate: NavigateToPage }) {
  const formatter = useMemo(() => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }), []);

  return (
    <PageShell title="QR Menü" text="Ege kahvaltısından yerel ana yemeklere, günlük tatlılardan kafe içeceklerine.">
      <section className="menu-layout">
        {business.menu.categories.map((category) => {
          const items = business.menu.items.filter((item) => item.category_id === category.id);
          return (
            <article className="menu-category" key={category.id}>
              <h3>{category.name}</h3>
              <div className="menu-items">
                {items.map((item) => (
                  <div className="menu-item" key={item.id}>
                    <img src={item.image_url} alt="" loading="lazy" />
                    <div className="menu-item-copy">
                      <strong>{item.name}</strong>
                      <p>{item.description}</p>
                    </div>
                    <span className="menu-item-price">{formatter.format(item.price)}</span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>
      <div className="center-actions">
        <button className="primary-button" onClick={() => onNavigate("request", "restaurant_reservation")}>
          <CalendarPlus size={18} aria-hidden="true" />
          Masa veya Bilgi Talebi Oluştur
        </button>
      </div>
    </PageShell>
  );
}

function GalleryPage() {
  return (
    <PageShell title="Galeri" text="Mekan, oda ve kahvaltı alanından örnek görüntüler.">
      <section className="gallery-grid">
        {business.gallery.map((item) => (
          <figure key={item.title} className="gallery-item">
            <img src={item.image_url} alt={item.title} />
            <figcaption>{item.title}</figcaption>
          </figure>
        ))}
      </section>
    </PageShell>
  );
}

function LocationPage() {
  return (
    <PageShell title="Ulaşım" text="Sahil yoluna yakın, yürüyerek ulaşımı kolay bir konum.">
      <section className="contact-layout">
        <article className="info-panel">
          <MapPin size={24} aria-hidden="true" />
          <h3>Adres</h3>
          <p>{business.address}</p>
          <a className="primary-button" href={business.map_url} target="_blank" rel="noreferrer">
            <Navigation size={18} aria-hidden="true" />
            Haritada Aç
          </a>
        </article>
        <article className="map-placeholder">
          <MapPin size={42} aria-hidden="true" />
          <span>{business.address}</span>
        </article>
      </section>
    </PageShell>
  );
}

function ContactPage({ onNavigate }: { onNavigate: NavigateToPage }) {
  return (
    <PageShell title="İletişim" text="Sorularınız ve rezervasyon talepleriniz için işletmeye kolayca ulaşabilirsiniz.">
      <section className="contact-layout">
        <article className="info-panel">
          <Phone size={24} aria-hidden="true" />
          <h3>Telefon</h3>
          <p>{business.phone}</p>
          <a className="secondary-button dark" href={`tel:${business.phone.replace(/\s/g, "")}`}>
            <Phone size={18} aria-hidden="true" />
            Telefonla Ara
          </a>
        </article>
        <article className="info-panel">
          <MessageCircle size={24} aria-hidden="true" />
          <h3>WhatsApp</h3>
          <p>{business.whatsapp}</p>
          <a className="primary-button" href={createWhatsAppLink(business.whatsapp, "Merhaba, bilgi almak istiyorum.")} target="_blank" rel="noreferrer">
            <MessageCircle size={18} aria-hidden="true" />
            WhatsApp'tan Yaz
          </a>
        </article>
        <article className="info-panel">
          <CalendarPlus size={24} aria-hidden="true" />
          <h3>Çalışma Saatleri</h3>
          {business.working_hours.map((hour) => (
            <p key={hour}>{hour}</p>
          ))}
          <button className="ghost-button" onClick={() => onNavigate("request", "general_info")}>
            <Send size={18} aria-hidden="true" />
            Talep Oluştur
          </button>
        </article>
      </section>
    </PageShell>
  );
}

function RequestPage({ initialRequestType }: { initialRequestType: RequestType }) {
  const [form, setForm] = useState({
    requestType: initialRequestType,
    name: "",
    phone: "",
    date: "",
    time: "",
    guests: "2",
    note: ""
  });
  const [lastMessage, setLastMessage] = useState("");
  const [submitState, setSubmitState] = useState<RequestSubmitState>("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const selectedRequestType = requestTypeOptions.find((option) => option.value === form.requestType) ?? requestTypeOptions[0];

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = buildRequestMessage(form);
    const requestApiEndpoint = getRequestApiEndpoint();
    setLastMessage(message);
    if (requestApiEndpoint) {
      setSubmitState("saving");
      setSubmitMessage("Talep web modülüne kaydediliyor...");
      void submitRequestToMiniApi(requestApiEndpoint, toRequestApiPayload(form, message)).then((result) => {
        setSubmitState(result.ok ? "saved" : "fallback");
        setSubmitMessage(result.message);
      });
    } else {
      setSubmitState("fallback");
      setSubmitMessage("WhatsApp mesajı hazırlandı. Web modül bağlantısı bu demo oturumunda kapalı.");
    }

    window.open(createWhatsAppLink(business.whatsapp, message), "_blank", "noopener,noreferrer");
  }

  return (
    <PageShell
      className="request-page"
      title="Talebinizi birlikte hazırlayalım"
      text="Birkaç kısa seçim yapın; mesajınızı WhatsApp'ta hazır açalım. Müsaitlik ve son onay işletme tarafından verilir."
    >
      <section className="request-workspace">
        <form className="request-form" onSubmit={handleSubmit}>
          <div className="request-form-heading wide-field">
            <span className="request-form-icon" aria-hidden="true">
              <Sparkles size={20} />
            </span>
            <div>
              <p className="eyebrow">Hızlı Talep</p>
              <h2>{selectedRequestType.label}</h2>
            </div>
          </div>

          <fieldset className="request-choice-group wide-field">
            <legend>Size nasıl yardımcı olalım?</legend>
            <div className="request-type-options">
              {requestTypeOptions.map((option) => {
                const Icon = option.icon;
                const isActive = form.requestType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={isActive ? "request-type-option is-active" : "request-type-option"}
                    aria-pressed={isActive}
                    onClick={() => updateField("requestType", option.value)}
                  >
                    <Icon size={17} aria-hidden="true" />
                    {option.label}
                    {isActive && <Check className="request-option-check" size={15} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <DateQuickPicker value={form.date} onChange={(value) => updateField("date", value)} />

          <label className="form-field">
            <span>Ad soyad</span>
            <input
              required
              autoComplete="name"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Adınız soyadınız"
            />
          </label>
          <label className="form-field">
            <span>Telefon</span>
            <input
              required
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              placeholder="05xx xxx xx xx"
              inputMode="tel"
              autoComplete="tel"
            />
          </label>

          {form.requestType === "restaurant_reservation" && (
            <label className="form-field">
              <span>Saat <small>(isteğe bağlı)</small></span>
              <input type="time" value={form.time} onChange={(event) => updateField("time", event.target.value)} />
            </label>
          )}

          <GuestStepper value={form.guests} onChange={(value) => updateField("guests", value)} />

          <label className="form-field wide-field">
            <span>Kısa not <small>(isteğe bağlı)</small></span>
            <textarea
              rows={2}
              value={form.note}
              onChange={(event) => updateField("note", event.target.value)}
              placeholder="Oda tercihi, çocuk sayısı veya masa notu"
            />
          </label>

          <p className="form-note">
            <ShieldCheck size={16} aria-hidden="true" />
            Bilgileriniz yalnızca talebinize dönüş yapılması için işletmeye iletilir.
          </p>
          {submitMessage && (
            <p className={`form-status status-${submitState}`} role="status">
              {submitMessage}
            </p>
          )}
          <button className="primary-button wide-button request-submit" type="submit">
            <MessageCircle size={19} aria-hidden="true" />
            WhatsApp'ta Aç
          </button>
        </form>

        <aside className="prepared-message" aria-live="polite">
          <div className="prepared-message-heading">
            <span aria-hidden="true">
              <MessageCircle size={20} />
            </span>
            <div>
              <p className="eyebrow">Hazır Mesaj</p>
              <h2>Kontrol sizde</h2>
            </div>
          </div>
          {lastMessage ? (
            <div className="message-preview-bubble">
              <strong>WhatsApp mesajınız hazır</strong>
              <pre>{lastMessage}</pre>
            </div>
          ) : (
            <div className="message-placeholder">
              <p>Formu tamamladığınızda WhatsApp mesajınız burada hazır görünecek.</p>
              <ol>
                <li>Bilgilerinizi seçin.</li>
                <li>WhatsApp'ta açın.</li>
                <li>Mesajı kontrol edip gönderin.</li>
              </ol>
            </div>
          )}
          <p className="prepared-message-trust">
            <ShieldCheck size={16} aria-hidden="true" />
            Son müsaitlik ve rezervasyon onayını işletme verir.
          </p>
        </aside>
      </section>
    </PageShell>
  );
}

type DatePreset = "today" | "tomorrow" | "weekend" | "custom";

function DateQuickPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputId = useId();
  const [selection, setSelection] = useState<DatePreset | "">("");
  const today = new Date();
  const todayIso = toLocalIsoDate(today);
  const presets: Array<{ key: Exclude<DatePreset, "custom">; label: string; value: string }> = [
    { key: "today", label: "Bugün", value: todayIso },
    { key: "tomorrow", label: "Yarın", value: toLocalIsoDate(addLocalDays(today, 1)) },
    { key: "weekend", label: "Hafta sonu", value: toLocalIsoDate(nextWeekendDate(today)) }
  ];

  function choosePreset(preset: (typeof presets)[number]) {
    setSelection(preset.key);
    onChange(preset.value);
  }

  return (
    <fieldset className="request-choice-group date-choice-group wide-field">
      <legend>Ne zaman?</legend>
      <div className="date-quick-options">
        {presets.map((preset) => {
          const isActive = selection === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              className={isActive ? "date-quick-option is-active" : "date-quick-option"}
              aria-pressed={isActive}
              aria-label={`${preset.label}: ${formatTurkishCalendarDate(preset.value)}`}
              onClick={() => choosePreset(preset)}
            >
              {preset.label}
            </button>
          );
        })}
        <label className={selection === "custom" ? "date-quick-option custom-date-option is-active" : "date-quick-option custom-date-option"} htmlFor={inputId}>
          <CalendarDays size={17} aria-hidden="true" />
          <span>{selection === "custom" && value ? formatTurkishCalendarDate(value) : "Tarih seç"}</span>
          <input
            id={inputId}
            className="native-date-control"
            type="date"
            required
            min={todayIso}
            value={value}
            aria-label="Tarih seç"
            onChange={(event) => {
              setSelection("custom");
              onChange(event.target.value);
            }}
          />
        </label>
      </div>
      <p className="selected-date" aria-live="polite">
        {value ? `Seçilen tarih: ${formatRequestDate(value)}` : "Tarih seçiminizi hızlı seçeneklerden yapabilirsiniz."}
      </p>
    </fieldset>
  );
}

function GuestStepper({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputId = useId();
  const parsedValue = Number(value);
  const safeValue = Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 1;

  function step(amount: number) {
    onChange(String(Math.min(30, Math.max(1, safeValue + amount))));
  }

  return (
    <fieldset className="guest-stepper-field">
      <legend>Kişi sayısı</legend>
      <div className="guest-stepper">
        <button type="button" aria-label="Kişi sayısını azalt" onClick={() => step(-1)} disabled={safeValue <= 1}>
          <Minus size={17} aria-hidden="true" />
        </button>
        <input
          id={inputId}
          required
          aria-label="Kişi sayısı"
          inputMode="numeric"
          min="1"
          max="30"
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" aria-label="Kişi sayısını artır" onClick={() => step(1)} disabled={safeValue >= 30}>
          <Plus size={17} aria-hidden="true" />
        </button>
      </div>
    </fieldset>
  );
}

function SettingsPage() {
  const [copyStatus, setCopyStatus] = useState("");
  const webModuleUrl = getWebModuleBaseUrl();
  const displayedSyncSecret = DEMO_SYNC_SECRET || "Canlı demo paketi oluşturulurken eklenir";

  async function copyConnectionValue(label: string, value: string) {
    if (!value || (label === "Güvenlik anahtarı" && !DEMO_SYNC_SECRET)) {
      setCopyStatus("Demo güvenlik anahtarı bu yerel build'e eklenmemiş.");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} kopyalandı.`);
    } catch {
      setCopyStatus("Tarayıcı kopyalamaya izin vermedi; alanı seçerek elle kopyalayabilirsiniz.");
    }
  }

  return (
    <PageShell
      className="settings-page"
      title="Kurulum"
      text="Yardımcı Asistan uygulamalarını indirin ve masaüstü bağlantısını aşağıdaki hazır demo bilgileriyle tamamlayın."
    >
      <section className="connection-setup-card" aria-labelledby="connection-setup-title">
        <div className="connection-setup-heading">
          <div className="connection-setup-icon" aria-hidden="true">
            <KeyRound size={29} />
          </div>
          <div>
            <p className="eyebrow">Demo Bağlantısı</p>
            <h2 id="connection-setup-title">Ortak kurulum bilgileri</h2>
            <p>Masaüstü uygulamasındaki Web Bağlantısı alanına bu iki değeri girin. Android demo APK aynı bağlantıyla hazır gelir.</p>
          </div>
        </div>

        <div className="connection-fields">
          <label className="connection-field">
            <span><Link2 size={16} aria-hidden="true" /> Yardımcı Asistan kurulum yolu</span>
            <div className="connection-field-control">
              <input aria-label="Yardımcı Asistan kurulum yolu" readOnly spellCheck={false} value={webModuleUrl} />
              <button type="button" onClick={() => void copyConnectionValue("Kurulum yolu", webModuleUrl)}>
                <Copy size={16} aria-hidden="true" />
                Kopyala
              </button>
            </div>
            <small>Masaüstünde: Ayarlar → Gelişmiş Ayarlar → Web Bağlantısı → Web eşitleme adresi</small>
          </label>

          <label className="connection-field">
            <span><KeyRound size={16} aria-hidden="true" /> Web güvenlik anahtarı</span>
            <div className="connection-field-control">
              <input aria-label="Web güvenlik anahtarı" readOnly spellCheck={false} value={displayedSyncSecret} />
              <button
                type="button"
                disabled={!DEMO_SYNC_SECRET}
                onClick={() => void copyConnectionValue("Güvenlik anahtarı", displayedSyncSecret)}
              >
                <Copy size={16} aria-hidden="true" />
                Kopyala
              </button>
            </div>
            <small>Masaüstü, Android ve web modülünün kullandığı ortak demo anahtarı</small>
          </label>
        </div>
        <p className="connection-copy-status" role="status" aria-live="polite">{copyStatus}</p>
      </section>

      <section className="installation-steps" aria-labelledby="installation-steps-title">
        <div className="installation-steps-heading">
          <p className="eyebrow">Adım Adım</p>
          <h2 id="installation-steps-title">Yardımcı Asistan nasıl kurulur?</h2>
        </div>
        <ol>
          <li>
            <span>1</span>
            <div><strong>Windows uygulamasını indirin</strong><p>Bilgisayarınıza uygun 64 bit veya 32 bit kurulum dosyasını aşağıdan çalıştırın.</p></div>
          </li>
          <li>
            <span>2</span>
            <div><strong>Demo bağlantısını kaydedin</strong><p>İlk açılışta yukarıdaki kurulum yolunu ve güvenlik anahtarını Web Bağlantısı alanlarına yapıştırın.</p></div>
          </li>
          <li>
            <span>3</span>
            <div><strong>Android uygulamasını kurun</strong><p>APK dosyasını telefona yükleyin. Demo bağlantısı uygulamanın içinde hazır olduğundan ayrıca anahtar girmeniz gerekmez.</p></div>
          </li>
        </ol>
      </section>

      <section className="desktop-download-card" aria-labelledby="desktop-download-title">
        <div className="download-icon" aria-hidden="true">
          <MonitorDown size={34} />
        </div>
        <div className="download-copy">
          <p className="eyebrow">Masaüstü Uygulaması</p>
          <h2 id="desktop-download-title">Windows kurulum dosyası</h2>
          <p>
            Talep takibi, QR menü, AI yardımcı ve işletme ayarlarına masaüstünden erişmek için Yardımcı Asistan'ı kurun.
          </p>
          <div className="download-meta" aria-label="Kurulum dosyası bilgileri">
            <span>Windows 10 / 11</span>
            <span>64 bit (x64)</span>
            <span>Sürüm {DESKTOP_INSTALLER_VERSION}</span>
          </div>
          <a className="primary-button download-button" href={DESKTOP_INSTALLER_URL} download>
            <Download size={19} aria-hidden="true" />
            Kurulum Dosyasını İndir
          </a>
        </div>
      </section>

      <section className="additional-downloads" aria-label="Diğer uygulama indirmeleri">
        <article className="platform-download-card">
          <div className="platform-download-icon" aria-hidden="true">
            <MonitorDown size={27} />
          </div>
          <div>
            <p className="eyebrow">Eski Windows Cihazlar</p>
            <h2>Windows 32 bit</h2>
            <p>32 bit işlemci veya 32 bit Windows kullanan bilgisayarlar için ayrı NSIS kurulum paketidir.</p>
            <div className="download-meta" aria-label="Windows 32 bit kurulum bilgileri">
              <span>Windows 10 / 11</span>
              <span>32 bit (x86)</span>
              <span>Sürüm {DESKTOP_INSTALLER_VERSION}</span>
            </div>
            <a className="ghost-button platform-download-button" href={DESKTOP_INSTALLER_X86_URL} download>
              <Download size={18} aria-hidden="true" />
              Windows 32 Bit İndir
            </a>
          </div>
        </article>

        <article className="platform-download-card">
          <div className="platform-download-icon android" aria-hidden="true">
            <Smartphone size={27} />
          </div>
          <div>
            <p className="eyebrow">Android Uygulaması</p>
            <h2>Android APK</h2>
            <p>Telefon üzerinden talepleri ve işletme özetini takip etmek için Android test uygulamasıdır.</p>
            <div className="download-meta" aria-label="Android APK bilgileri">
              <span>Android 8.0+</span>
              <span>APK</span>
              <span>Sürüm {ANDROID_APP_VERSION}</span>
            </div>
            <a className="ghost-button platform-download-button" href={ANDROID_APK_URL} download>
              <Download size={18} aria-hidden="true" />
              Android APK İndir
            </a>
          </div>
        </article>
      </section>

      <section className="installer-notes" aria-label="Kurulum bilgileri">
        <article className="info-panel">
          <ShieldCheck size={24} aria-hidden="true" />
          <h3>Veriler bu bilgisayarda kalır</h3>
          <p>Masaüstü uygulaması işletme verilerini yerel SQLite veritabanında saklar ve manuel yedek almanızı sağlar.</p>
        </article>
        <article className="info-panel">
          <Settings size={24} aria-hidden="true" />
          <h3>Kurulumdan sonra</h3>
          <p>Firma, web modülü, WhatsApp ve isteğe bağlı AI bağlantısı bilgilerini ilk açılış ekranında tamamlayabilirsiniz.</p>
        </article>
      </section>

      <p className="installer-warning">
        Windows geliştirme paketleri henüz ticari kod imzasına sahip değildir ve yayıncı uyarısı gösterebilir. Android APK debug/test anahtarıyla imzalıdır; kurulum için tarayıcıya “bilinmeyen uygulama yükleme” izni vermeniz gerekebilir.
      </p>
    </PageShell>
  );
}

function SectionHeading({ title, text }: { title: string; text: string }) {
  return (
    <section className="section-heading">
      <p className="eyebrow">Yardımcı Asistan</p>
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}

function PageShell({
  title,
  text,
  children,
  className = ""
}: {
  title: string;
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`page-shell ${className}`.trim()}>
      <div className="page-title">
        <p className="eyebrow">{business.display_name}</p>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {children}
    </section>
  );
}

function Footer({ onNavigate }: { onNavigate: NavigateToPage }) {
  return (
    <footer className="site-footer">
      <div>
        <strong>{business.display_name}</strong>
        <p>{business.address}</p>
      </div>
      <div className="footer-actions">
        <button className="ghost-button" onClick={() => onNavigate("settings")}>
          <Download size={17} aria-hidden="true" />
          Kurulum
        </button>
        <button className="ghost-button" onClick={() => onNavigate("location")}>
          <MapPin size={17} aria-hidden="true" />
          Ulaşım
        </button>
        <a className="primary-button" href={createWhatsAppLink(business.whatsapp, "Merhaba, bilgi almak istiyorum.")} target="_blank" rel="noreferrer">
          <MessageCircle size={17} aria-hidden="true" />
          WhatsApp
        </a>
      </div>
    </footer>
  );
}

function buildRequestMessage(form: {
  requestType: string;
  name: string;
  phone: string;
  date: string;
  time: string;
  guests: string;
  note: string;
}) {
  return buildCustomerRequestWhatsAppMessage(
    {
      request_type: form.requestType,
      customer_name: form.name,
      customer_phone: form.phone,
      date_text: formatRequestDate(form.date),
      time_text: form.time,
      guest_count: form.guests,
      message: form.note
    },
    business.display_name
  );
}

function toRequestApiPayload(
  form: {
    requestType: string;
    name: string;
    phone: string;
    date: string;
    time: string;
    guests: string;
    note: string;
  },
  whatsappMessage: string
) {
  return {
    source: "web_form",
    request_type: form.requestType,
    customer_name: form.name,
    customer_phone: form.phone,
    date_text: formatRequestDate(form.date),
    start_date: form.date,
    time: form.time,
    guest_count: Number(form.guests),
    message: form.note,
    whatsapp_message: whatsappMessage
  };
}

function getRequestApiEndpoint() {
  const baseUrl = getWebModuleApiBaseUrl();
  return baseUrl ? `${baseUrl}/api/request.php` : "";
}

function getWebModuleBaseUrl() {
  return String(import.meta.env.VITE_YA_WEB_MODULE_URL ?? DEFAULT_WEB_MODULE_URL).trim().replace(/\/+$/, "");
}

function getWebModuleApiBaseUrl() {
  const configuredUrl = String(import.meta.env.VITE_YA_WEB_MODULE_URL ?? "").trim().replace(/\/+$/, "");
  if (configuredUrl) {
    return configuredUrl;
  }

  return import.meta.env.DEV ? "/__yardimci_asistan_live" : DEFAULT_WEB_MODULE_URL;
}

async function submitRequestToMiniApi(endpoint: string, payload: Record<string, string | number>) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; request_id?: string } | null;

    if (response.ok && result?.ok === true) {
      return {
        ok: true,
        message: result.request_id ? `Talep web modülüne kaydedildi: ${result.request_id}` : "Talep web modülüne kaydedildi."
      };
    }

    return {
      ok: false,
      message: result?.message ? `${result.message} WhatsApp mesajı hazırlandı.` : "Talep web modülüne kaydedilemedi. WhatsApp mesajı hazırlandı."
    };
  } catch {
    return {
      ok: false,
      message: "Web modülüne ulaşılamadı. WhatsApp mesajı hazırlandı."
    };
  }
}

function createWhatsAppLink(phone: string, message: string) {
  return createWhatsAppUrl(phone, message);
}

function getPageFromLocation(): PageKey {
  const hashPage = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
  return pageKeys.includes(hashPage as PageKey) ? (hashPage as PageKey) : "home";
}

function addLocalDays(date: Date, amount: number) {
  const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function nextWeekendDate(date: Date) {
  const day = date.getDay();
  const daysUntilWeekend = day === 0 || day === 6 ? 0 : 6 - day;
  return addLocalDays(date, daysUntilWeekend);
}

function toLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTurkishCalendarDate(value: string) {
  const date = parseLocalIsoDate(value);
  if (!date) {
    return "Tarih seç";
  }

  const includeYear = date.getFullYear() !== new Date().getFullYear();
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" as const } : {})
  }).format(date);
}

function formatRequestDate(value: string) {
  const date = parseLocalIsoDate(value);
  if (!date) {
    return value;
  }

  const calendarDate = formatTurkishCalendarDate(value);
  const today = toLocalIsoDate(new Date());
  const tomorrow = toLocalIsoDate(addLocalDays(new Date(), 1));

  if (value === today) {
    return `Bugün, ${calendarDate}`;
  }
  if (value === tomorrow) {
    return `Yarın, ${calendarDate}`;
  }

  return calendarDate;
}

export default App;
