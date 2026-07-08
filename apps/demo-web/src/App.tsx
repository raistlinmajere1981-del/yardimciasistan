import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { buildCustomerRequestWhatsAppMessage, createWhatsAppUrl } from "@yardimci-asistan/whatsapp-bridge";
import {
  BedDouble,
  CalendarPlus,
  Coffee,
  Home,
  Images,
  MapPin,
  Menu as MenuIcon,
  MessageCircle,
  Navigation,
  Phone,
  Send,
  UtensilsCrossed,
  Users
} from "lucide-react";
import businessJson from "../config/business.json";
import type { BusinessConfig, PageKey } from "./types";

const business = businessJson as BusinessConfig;
type RequestSubmitState = "idle" | "saving" | "saved" | "fallback" | "error";

const navItems: Array<{ key: PageKey; label: string; icon: typeof Home }> = [
  { key: "home", label: "Ana Sayfa", icon: Home },
  { key: "rooms", label: "Odalar", icon: BedDouble },
  { key: "restaurant", label: "Restoran / Kafe", icon: Coffee },
  { key: "menu", label: "QR Menü", icon: MenuIcon },
  { key: "gallery", label: "Galeri", icon: Images },
  { key: "location", label: "Ulaşım", icon: MapPin },
  { key: "contact", label: "İletişim", icon: Phone },
  { key: "request", label: "Talep Oluştur", icon: CalendarPlus }
];

const serviceIcons = {
  bed: BedDouble,
  coffee: Coffee,
  table: UtensilsCrossed
};

function App() {
  const [activePage, setActivePage] = useState<PageKey>("home");
  const themeStyle = {
    "--primary": business.colors.primary,
    "--accent": business.colors.accent,
    "--ink": business.colors.ink
  } as CSSProperties;

  function goToPage(page: PageKey) {
    setActivePage(page);
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
        {activePage === "request" && <RequestPage />}
      </main>
      <Footer onNavigate={goToPage} />
    </div>
  );
}

function Header({ activePage, onNavigate }: { activePage: PageKey; onNavigate: (page: PageKey) => void }) {
  return (
    <header className="site-header">
      <button className="brand-button" onClick={() => onNavigate("home")} aria-label="Ana sayfaya git">
        <img className="brand-symbol" src="/assets/yardimci-asistan-symbol.png" alt="" aria-hidden="true" />
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

function HomePage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  return (
    <>
      <section className="hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(23, 32, 51, 0.78), rgba(23, 32, 51, 0.2)), url(${business.hero.image_url})` }}>
        <div className="hero-content">
          <p className="eyebrow">{business.hero.eyebrow}</p>
          <h1>{business.hero.title}</h1>
          <p>{business.hero.summary}</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => onNavigate("request")}>
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

function RoomsPage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
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
              <button className="primary-button" onClick={() => onNavigate("request")}>
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

function RestaurantPage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
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
            <button className="primary-button" onClick={() => onNavigate("request")}>
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

function MenuPage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const formatter = useMemo(() => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }), []);

  return (
    <PageShell title="QR Menü" text="Öne çıkan ürünler ve günlük lezzetler.">
      <section className="menu-layout">
        {business.menu.categories.map((category) => {
          const items = business.menu.items.filter((item) => item.category_id === category.id);
          return (
            <article className="menu-category" key={category.id}>
              <h3>{category.name}</h3>
              <div className="menu-items">
                {items.map((item) => (
                  <div className="menu-item" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.description}</p>
                    </div>
                    <span>{formatter.format(item.price)}</span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>
      <div className="center-actions">
        <button className="primary-button" onClick={() => onNavigate("request")}>
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

function ContactPage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
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
          <button className="ghost-button" onClick={() => onNavigate("request")}>
            <Send size={18} aria-hidden="true" />
            Talep Oluştur
          </button>
        </article>
      </section>
    </PageShell>
  );
}

function RequestPage() {
  const [form, setForm] = useState({
    requestType: "pension_reservation",
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
    <PageShell title="Rezervasyon / Bilgi Al" text="Talebinizi kısa bilgilerle iletin; işletme müsaitlik ve detayları kontrol edip size dönüş yapsın.">
      <form className="request-form" onSubmit={handleSubmit}>
        <label>
          Talep türü
          <select value={form.requestType} onChange={(event) => updateField("requestType", event.target.value)}>
            <option value="pension_reservation">Pansiyon rezervasyonu</option>
            <option value="restaurant_reservation">Masa rezervasyonu</option>
            <option value="general_info">Bilgi almak istiyorum</option>
          </select>
        </label>
        <label>
          Ad soyad
          <input required value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Adınız soyadınız" />
        </label>
        <label>
          Telefon
          <input required value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="05xx xxx xx xx" inputMode="tel" />
        </label>
        <label>
          Tarih
          <input required type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} />
        </label>
        {form.requestType === "restaurant_reservation" && (
          <label>
            Saat
            <input type="time" value={form.time} onChange={(event) => updateField("time", event.target.value)} />
          </label>
        )}
        <label>
          Kişi sayısı
          <input required min="1" type="number" value={form.guests} onChange={(event) => updateField("guests", event.target.value)} />
        </label>
        <label className="wide-field">
          Not
          <textarea value={form.note} onChange={(event) => updateField("note", event.target.value)} placeholder="Oda tercihi, çocuk sayısı veya masa notu" />
        </label>
        <p className="form-note">Formdaki bilgileriniz talebinize dönüş yapılması amacıyla işletmeye iletilir.</p>
        {submitMessage && (
          <p className={`form-status status-${submitState}`} role="status">
            {submitMessage}
          </p>
        )}
        <button className="primary-button wide-button" type="submit">
          <MessageCircle size={18} aria-hidden="true" />
          WhatsApp'ta Aç
        </button>
      </form>
      <aside className="prepared-message">
        <h3>Hazır mesaj</h3>
        <p>WhatsApp açıldığında mesajınız hazır olarak gelecektir. Bilgileri kontrol edip gönder tuşuna basmanız yeterlidir.</p>
        {lastMessage && <pre>{lastMessage}</pre>}
      </aside>
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

function PageShell({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="page-shell">
      <div className="page-title">
        <p className="eyebrow">{business.display_name}</p>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {children}
    </section>
  );
}

function Footer({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  return (
    <footer className="site-footer">
      <div>
        <strong>{business.display_name}</strong>
        <p>{business.address}</p>
      </div>
      <div className="footer-actions">
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
      date_text: form.date,
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
    date_text: form.date,
    start_date: form.date,
    time: form.time,
    guest_count: Number(form.guests),
    message: form.note,
    whatsapp_message: whatsappMessage
  };
}

function getRequestApiEndpoint() {
  const baseUrl = String(import.meta.env.VITE_YA_WEB_MODULE_URL ?? "").trim();
  return baseUrl ? `${baseUrl.replace(/\/+$/, "")}/api/request.php` : "";
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

export default App;
