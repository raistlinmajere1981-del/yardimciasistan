import {
  buildCustomerRequestWhatsAppMessage,
  createWhatsAppUrl,
  normalizeTRMobilePhone as normalizeBridgeTRMobilePhone
} from "@yardimci-asistan/whatsapp-bridge";

type RequestType = "pension_reservation" | "restaurant_reservation" | "general_info";
type WidgetView = "home" | "form" | "info";

interface WidgetConfig {
  businessName: string;
  whatsappPhone: string;
  apiBaseUrl: string;
  menuUrl: string;
  primaryColor: string;
  accentColor: string;
}

interface RequestPayload {
  request_type: RequestType;
  customer_name: string;
  customer_phone: string;
  date_text: string;
  guest_count: number;
  message: string;
  source: "web_form";
  whatsapp_message: string;
}

interface WidgetState {
  isOpen: boolean;
  view: WidgetView;
  status: string;
}

declare global {
  interface Window {
    YardimciAsistanWidget?: {
      init: (config?: Partial<WidgetConfig>) => void;
      open: () => void;
      close: () => void;
    };
  }
}

const ROOT_ID = "yardimci-asistan-widget";
const STYLE_ID = "yardimci-asistan-widget-style";

const defaultConfig: WidgetConfig = {
  businessName: "Yardımcı Asistan",
  whatsappPhone: "",
  apiBaseUrl: "",
  menuUrl: "",
  primaryColor: "#2F6F5E",
  accentColor: "#E47863"
};

let config: WidgetConfig = { ...defaultConfig };
let state: WidgetState = {
  isOpen: false,
  view: "home",
  status: ""
};

export function init(userConfig: Partial<WidgetConfig> = {}) {
  config = {
    ...defaultConfig,
    ...getScriptConfig(),
    ...userConfig
  };

  injectStyles(config);
  render();
}

export function open() {
  state = { ...state, isOpen: true };
  render();
}

export function close() {
  state = { ...state, isOpen: false, view: "home", status: "" };
  render();
}

export function createWhatsAppLink(phone: string, message: string): string {
  return createWhatsAppUrl(phone, message);
}

export function buildWhatsAppMessage(payload: Pick<RequestPayload, "request_type" | "customer_name" | "customer_phone" | "date_text" | "guest_count" | "message">, businessName = config.businessName): string {
  return buildCustomerRequestWhatsAppMessage(payload, businessName);
}

export function normalizeTRMobilePhone(phone: string): { ok: true; whatsapp: string } | { ok: false; error: string } {
  const result = normalizeBridgeTRMobilePhone(phone);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error
    };
  }

  return {
    ok: true,
    whatsapp: result.whatsapp
  };
}

function render() {
  const root = getOrCreateRoot();
  root.innerHTML = state.isOpen ? panelTemplate() : buttonTemplate();
  bindEvents(root);
}

function buttonTemplate() {
  return `
    <button class="ya-widget-button" type="button" data-ya-open aria-label="Yardımcı Asistan'ı aç">
      <span>YA</span>
      <strong>Yardımcı Asistan</strong>
    </button>
  `;
}

function panelTemplate() {
  return `
    <section class="ya-widget-panel" aria-label="Yardımcı Asistan">
      <header class="ya-widget-header">
        <div>
          <span>YA</span>
          <strong>${escapeHtml(config.businessName)}</strong>
        </div>
        <button type="button" data-ya-close aria-label="Kapat">x</button>
      </header>
      ${state.view === "home" ? homeTemplate() : ""}
      ${state.view === "form" ? formTemplate() : ""}
      ${state.view === "info" ? infoTemplate() : ""}
      ${state.status ? `<p class="ya-widget-status">${escapeHtml(state.status)}</p>` : ""}
    </section>
  `;
}

function homeTemplate() {
  return `
    <div class="ya-widget-home">
      <button type="button" data-ya-view="form">
        <strong>Rezervasyon Talebi</strong>
        <span>Oda veya masa için kısa talep bırakın.</span>
      </button>
      <button type="button" data-ya-view="info">
        <strong>Bilgi Al</strong>
        <span>Telefon, adres ve çalışma saatlerini görün.</span>
      </button>
      <a href="${createWhatsAppLink(config.whatsappPhone, "Merhaba, bilgi almak istiyorum.")}" target="_blank" rel="noreferrer">
        <strong>WhatsApp'tan Yaz</strong>
        <span>Mesajınız hazır açılsın.</span>
      </a>
      ${config.menuUrl ? `<a class="ya-widget-menu-link" href="${escapeAttribute(config.menuUrl)}" target="_blank" rel="noreferrer">Menüyü Gör</a>` : ""}
    </div>
  `;
}

function formTemplate() {
  return `
    <form class="ya-widget-form" data-ya-form>
      <label>
        Talep türü
        <select name="request_type">
          <option value="pension_reservation">Pansiyon rezervasyonu</option>
          <option value="restaurant_reservation">Masa rezervasyonu</option>
          <option value="general_info">Bilgi talebi</option>
        </select>
      </label>
      <label>
        Ad soyad
        <input name="customer_name" required autocomplete="name" placeholder="Adınız soyadınız" />
      </label>
      <label>
        Telefon
        <input name="customer_phone" required inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx" />
      </label>
      <label>
        Tarih
        <input name="date_text" required placeholder="Örn. 12 Temmuz" />
      </label>
      <label>
        Kişi sayısı
        <input name="guest_count" required type="number" min="1" value="2" />
      </label>
      <label>
        Not
        <textarea name="message" placeholder="Kısa notunuz"></textarea>
      </label>
      <p>Formdaki bilgileriniz talebinize dönüş yapılması amacıyla işletmeye iletilir.</p>
      <button type="submit">WhatsApp Mesajını Hazırla</button>
      <button type="button" class="ya-widget-back" data-ya-view="home">Geri</button>
    </form>
  `;
}

function infoTemplate() {
  return `
    <div class="ya-widget-info">
      <p><strong>${escapeHtml(config.businessName)}</strong></p>
      ${config.whatsappPhone ? `<p>${escapeHtml(config.whatsappPhone)}</p>` : ""}
      <a href="${createWhatsAppLink(config.whatsappPhone, "Merhaba, bilgi almak istiyorum.")}" target="_blank" rel="noreferrer">WhatsApp'tan Yaz</a>
      <button type="button" class="ya-widget-back" data-ya-view="home">Geri</button>
    </div>
  `;
}

function bindEvents(root: HTMLElement) {
  root.querySelector("[data-ya-open]")?.addEventListener("click", open);
  root.querySelector("[data-ya-close]")?.addEventListener("click", close);

  root.querySelectorAll<HTMLElement>("[data-ya-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state = {
        ...state,
        isOpen: true,
        view: button.dataset.yaView as WidgetView,
        status: ""
      };
      render();
    });
  });

  root.querySelector<HTMLFormElement>("[data-ya-form]")?.addEventListener("submit", handleFormSubmit);
}

function handleFormSubmit(event: Event) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const formData = new FormData(form);
  const customerPhone = String(formData.get("customer_phone") ?? "");
  const normalizedPhone = normalizeTRMobilePhone(customerPhone);

  if (!normalizedPhone.ok) {
    state = { ...state, status: normalizedPhone.error };
    render();
    return;
  }

  const payload: RequestPayload = {
    request_type: String(formData.get("request_type") ?? "general_info") as RequestType,
    customer_name: String(formData.get("customer_name") ?? "").trim(),
    customer_phone: customerPhone.trim(),
    date_text: String(formData.get("date_text") ?? "").trim(),
    guest_count: Number(formData.get("guest_count") ?? 1),
    message: String(formData.get("message") ?? "").trim(),
    source: "web_form",
    whatsapp_message: ""
  };

  if (!payload.customer_name || !payload.date_text || !payload.guest_count) {
    state = { ...state, status: "Lütfen gerekli alanları doldurun." };
    render();
    return;
  }

  payload.whatsapp_message = buildWhatsAppMessage(payload);
  void saveRequest(payload);
  window.open(createWhatsAppLink(config.whatsappPhone, payload.whatsapp_message), "_blank", "noopener,noreferrer");
  state = {
    ...state,
    status: "WhatsApp mesajı hazırlandı. Bilgileri kontrol edip gönder tuşuna basın."
  };
  render();
}

async function saveRequest(payload: RequestPayload) {
  if (!config.apiBaseUrl) {
    return;
  }

  try {
    const endpoint = `${config.apiBaseUrl.replace(/\/$/, "")}/api/request.php`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      keepalive: true
    });

    if (!response.ok) {
      throw new Error("request_failed");
    }
  } catch {
    state = {
      ...state,
      status: "Talep kaydı sırasında sorun oldu. WhatsApp mesajınız hazırlandı."
    };
    render();
  }
}

function getOrCreateRoot() {
  const existingRoot = document.getElementById(ROOT_ID);
  if (existingRoot) {
    return existingRoot;
  }

  const root = document.createElement("div");
  root.id = ROOT_ID;
  document.body.appendChild(root);
  return root;
}

function injectStyles(widgetConfig: WidgetConfig) {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483000;
      color: #172033;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #${ROOT_ID} * {
      box-sizing: border-box;
    }

    .ya-widget-button {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 54px;
      padding: 8px 14px 8px 8px;
      border: 0;
      border-radius: 8px;
      color: #ffffff;
      background: ${widgetConfig.primaryColor};
      box-shadow: 0 16px 42px rgba(23, 32, 51, 0.24);
      cursor: pointer;
    }

    .ya-widget-button span,
    .ya-widget-header span {
      display: grid;
      width: 36px;
      height: 36px;
      place-items: center;
      border-radius: 8px;
      color: ${widgetConfig.primaryColor};
      background: #ffffff;
      font-weight: 800;
    }

    .ya-widget-panel {
      width: min(360px, calc(100vw - 28px));
      overflow: hidden;
      border: 1px solid #ded8ce;
      border-radius: 8px;
      background: #fff8ee;
      box-shadow: 0 18px 52px rgba(23, 32, 51, 0.24);
    }

    .ya-widget-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px;
      color: #ffffff;
      background: ${widgetConfig.primaryColor};
    }

    .ya-widget-header div {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }

    .ya-widget-header strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ya-widget-header button {
      width: 34px;
      height: 34px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 8px;
      color: #ffffff;
      background: transparent;
      cursor: pointer;
      font-size: 22px;
      line-height: 1;
    }

    .ya-widget-home,
    .ya-widget-info,
    .ya-widget-form {
      display: grid;
      gap: 10px;
      padding: 12px;
    }

    .ya-widget-home button,
    .ya-widget-home a,
    .ya-widget-info a,
    .ya-widget-form button {
      display: grid;
      gap: 4px;
      width: 100%;
      min-height: 52px;
      padding: 12px;
      border: 1px solid #ded8ce;
      border-radius: 8px;
      color: #172033;
      background: #ffffff;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
    }

    .ya-widget-home span,
    .ya-widget-form p,
    .ya-widget-info p,
    .ya-widget-status {
      margin: 0;
      color: #58606f;
      font-size: 13px;
      line-height: 1.45;
    }

    .ya-widget-menu-link {
      min-height: 40px !important;
      place-items: center;
      color: ${widgetConfig.primaryColor} !important;
      font-weight: 800;
    }

    .ya-widget-form label {
      display: grid;
      gap: 5px;
      color: #172033;
      font-size: 13px;
      font-weight: 800;
    }

    .ya-widget-form input,
    .ya-widget-form select,
    .ya-widget-form textarea {
      width: 100%;
      min-height: 40px;
      padding: 9px 10px;
      border: 1px solid #ded8ce;
      border-radius: 8px;
      color: #172033;
      background: #ffffff;
      font: inherit;
    }

    .ya-widget-form textarea {
      min-height: 76px;
      resize: vertical;
    }

    .ya-widget-form button[type="submit"],
    .ya-widget-info a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      background: ${widgetConfig.primaryColor};
      text-align: center;
      font-weight: 800;
    }

    .ya-widget-form .ya-widget-back,
    .ya-widget-info .ya-widget-back {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      background: transparent;
      text-align: center;
    }

    .ya-widget-status {
      padding: 0 12px 12px;
      color: ${widgetConfig.accentColor};
      font-weight: 700;
    }

    @media (max-width: 520px) {
      #${ROOT_ID} {
        right: 10px;
        bottom: 10px;
      }

      .ya-widget-button strong {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function getScriptConfig(): Partial<WidgetConfig> {
  const script = document.currentScript as HTMLScriptElement | null;
  const dataset = script?.dataset ?? {};

  return removeEmptyValues({
    businessName: dataset.businessName,
    whatsappPhone: dataset.whatsappPhone,
    apiBaseUrl: dataset.apiBaseUrl,
    menuUrl: dataset.menuUrl,
    primaryColor: dataset.primaryColor,
    accentColor: dataset.accentColor
  });
}

function removeEmptyValues(values: Partial<WidgetConfig>): Partial<WidgetConfig> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === "string" && value.length > 0)) as Partial<WidgetConfig>;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

window.YardimciAsistanWidget = {
  init,
  open,
  close
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => init(), { once: true });
} else {
  init();
}
