import {
  buildCustomerRequestWhatsAppMessage,
  createWhatsAppUrl,
  normalizeTRMobilePhone as normalizeBridgeTRMobilePhone
} from "@yardimci-asistan/whatsapp-bridge";

type RequestType = "pension_reservation" | "restaurant_reservation" | "general_info";
type WidgetView = "home" | "form" | "info" | "whatsapp";
type DatePreset = "today" | "tomorrow" | "weekend" | "custom";

interface WidgetConfig {
  businessName: string;
  whatsappPhone: string;
  apiBaseUrl: string;
  menuUrl: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
}

interface RequestPayload {
  request_type: RequestType;
  customer_name: string;
  customer_phone: string;
  date_text: string;
  start_date: string;
  guest_count: number;
  message: string;
  source: "web_form";
  whatsapp_message: string;
}

interface WidgetState {
  isOpen: boolean;
  view: WidgetView;
  requestType: RequestType;
  status: string;
  aiAnswer: string;
  aiLoading: boolean;
  questionDraft: string;
  whatsappDraft: string;
  whatsappTopic: string;
}

interface AiErrorDetail {
  code?: string;
  message?: string;
  retryable?: boolean;
  provider_status?: number | null;
}

interface AiChatResponse {
  ok?: boolean;
  answer?: string;
  message?: string;
  fallback?: boolean;
  error?: AiErrorDetail | null;
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
  logoUrl: "",
  primaryColor: "#2F6F5E",
  accentColor: "#E47863"
};

const initialScriptConfig = getScriptConfig();

let config: WidgetConfig = { ...defaultConfig };
let state: WidgetState = {
  isOpen: false,
  view: "home",
  requestType: "pension_reservation",
  status: "",
  aiAnswer: "",
  aiLoading: false,
  questionDraft: "",
  whatsappDraft: "",
  whatsappTopic: ""
};

export function init(userConfig: Partial<WidgetConfig> = {}) {
  config = {
    ...defaultConfig,
    ...initialScriptConfig,
    ...getScriptConfig(),
    ...userConfig
  };

  injectStyles(config);
  render();
}

export function open() {
  state = { ...state, isOpen: true, status: "" };
  render();
  focusWidgetElement("[data-ya-close]");
}

export function close() {
  state = {
    ...state,
    isOpen: false,
    view: "home",
    status: "",
    aiLoading: false,
    aiAnswer: ""
  };
  render();
  focusWidgetElement("[data-ya-open]");
}

export function createWhatsAppLink(phone: string, message: string): string {
  return createWhatsAppUrl(phone, message);
}

export function buildWhatsAppMessage(
  payload: Pick<RequestPayload, "request_type" | "customer_name" | "customer_phone" | "date_text" | "guest_count" | "message">,
  businessName = config.businessName
): string {
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
      <span class="ya-widget-launcher-avatar">
        ${brandMarkTemplate()}
        <span class="ya-widget-online-dot" aria-hidden="true"></span>
      </span>
      <span class="ya-widget-launcher-copy">
        <strong>AI Asistan</strong>
        <small>Size yardımcı olayım</small>
      </span>
      ${iconTemplate("sparkles", "ya-widget-launcher-sparkle")}
    </button>
  `;
}

function panelTemplate() {
  return `
    <section class="ya-widget-panel" role="dialog" aria-labelledby="ya-widget-title">
      <header class="ya-widget-header">
        <div class="ya-widget-identity">
          <span class="ya-widget-avatar">
            ${brandMarkTemplate()}
            <span class="ya-widget-avatar-spark" aria-hidden="true">${iconTemplate("sparkles")}</span>
          </span>
          <span class="ya-widget-title-copy">
            <strong id="ya-widget-title">${escapeHtml(getAssistantTitle())}</strong>
            <small>Rezervasyon, masa ve bilgi taleplerinizi hızlıca hazırlayayım.</small>
          </span>
        </div>
        <button class="ya-widget-close" type="button" data-ya-close aria-label="Asistanı kapat">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div class="ya-widget-content">
        ${state.view === "home" ? homeTemplate() : ""}
        ${state.view === "form" ? formTemplate() : ""}
        ${state.view === "info" ? infoTemplate() : ""}
        ${state.view === "whatsapp" ? whatsappTemplate() : ""}
        <p class="ya-widget-status" data-ya-status role="status" ${state.status ? "" : "hidden"}>${escapeHtml(state.status)}</p>
      </div>
    </section>
  `;
}

function brandMarkTemplate() {
  if (!config.logoUrl) {
    return `<span class="ya-widget-mark ya-widget-mark-fallback">AI</span>`;
  }

  return `<img class="ya-widget-mark" src="${escapeAttribute(config.logoUrl)}" alt="" aria-hidden="true" />`;
}

function homeTemplate() {
  return `
    <div class="ya-widget-home">
      <div class="ya-widget-welcome">
        <span class="ya-widget-bot-bubble" aria-hidden="true">${iconTemplate("bot")}</span>
        <div>
          <span class="ya-widget-kicker">AI destekli hızlı yardımcı</span>
          <h2 class="ya-widget-view-title" tabindex="-1">Size nasıl yardımcı olayım?</h2>
          <p>İhtiyacınızı seçin, gerekli adımları birlikte tamamlayalım.</p>
        </div>
      </div>
      <div class="ya-widget-actions" role="group" aria-label="Hızlı asistan seçenekleri">
        <button type="button" data-ya-request-type="pension_reservation">
          ${iconTemplate("calendar")}
          <span>Rezervasyon yap</span>
        </button>
        <button type="button" data-ya-request-type="restaurant_reservation">
          ${iconTemplate("table")}
          <span>Masa sor</span>
        </button>
        <button type="button" data-ya-view="info">
          ${iconTemplate("help")}
          <span>Bilgi al</span>
        </button>
        <button type="button" data-ya-view="whatsapp">
          ${iconTemplate("whatsapp")}
          <span>WhatsApp mesajı hazırla</span>
        </button>
        ${
          config.menuUrl
            ? `<a class="ya-widget-menu-link" href="${escapeAttribute(config.menuUrl)}" target="_blank" rel="noreferrer">
                ${iconTemplate("menu")}
                <span>Menüyü gör</span>
              </a>`
            : ""
        }
      </div>
      <p class="ya-widget-trust">
        ${iconTemplate("shield")}
        <span>Bilgileriniz işletmeye iletilir, son onayı işletme yapar.</span>
      </p>
    </div>
  `;
}

function formTemplate() {
  const isTableRequest = state.requestType === "restaurant_reservation";
  const requestLabel = isTableRequest ? "Masa talebi" : "Rezervasyon talebi";
  const title = isTableRequest ? "Masa talebinizi hazırlayalım" : "Rezervasyonunuzu hazırlayalım";

  return `
    <div class="ya-widget-subview">
      ${subviewNavigationTemplate(requestLabel, isTableRequest ? "table" : "calendar")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${iconTemplate("sparkles")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">${title}</h2>
          <p>Sadece gerekli bilgileri ekleyin; mesajınız WhatsApp'ta hazır açılsın.</p>
        </div>
      </div>
      <form class="ya-widget-form" data-ya-form>
        <input type="hidden" name="request_type" value="${state.requestType}" />
        ${dateControlsTemplate()}
        <div class="ya-widget-field-grid">
          <label class="ya-widget-field">
            <span>Ad soyad</span>
            <input name="customer_name" required autocomplete="name" placeholder="Adınız soyadınız" />
          </label>
          <label class="ya-widget-field">
            <span>Telefon</span>
            <input name="customer_phone" required inputmode="tel" autocomplete="tel" placeholder="05xx xxx xx xx" />
          </label>
        </div>
        ${guestStepperTemplate()}
        <label class="ya-widget-field">
          <span>Kısa not <small>(isteğe bağlı)</small></span>
          <textarea name="message" rows="2" placeholder="Tercihiniz veya eklemek istediğiniz kısa not"></textarea>
        </label>
        <button class="ya-widget-primary-action" type="submit">
          ${iconTemplate("whatsapp")}
          <span>WhatsApp mesajını hazırla</span>
        </button>
        <p class="ya-widget-form-note">${iconTemplate("shield")} Bilgileriniz yalnızca talebinize dönüş yapılması için kullanılır.</p>
      </form>
    </div>
  `;
}

function dateControlsTemplate() {
  const today = new Date();
  const todayIso = toLocalIsoDate(today);
  const tomorrowIso = toLocalIsoDate(addLocalDays(today, 1));
  const weekendIso = toLocalIsoDate(nextWeekendDate(today));

  return `
    <fieldset class="ya-widget-date-group">
      <legend>Ne zaman?</legend>
      <div class="ya-widget-date-options">
        <button type="button" data-ya-date-preset="today" data-ya-date-value="${todayIso}" aria-pressed="false">Bugün</button>
        <button type="button" data-ya-date-preset="tomorrow" data-ya-date-value="${tomorrowIso}" aria-pressed="false">Yarın</button>
        <button type="button" data-ya-date-preset="weekend" data-ya-date-value="${weekendIso}" aria-pressed="false">Hafta sonu</button>
        <label class="ya-widget-date-custom" data-ya-date-custom>
          ${iconTemplate("calendar")}
          <span data-ya-custom-date-label>Tarih seç</span>
          <input name="date_iso" type="date" min="${todayIso}" required aria-label="Tarih seç" />
        </label>
        <input name="date_text" type="hidden" />
      </div>
      <p data-ya-selected-date aria-live="polite">Tarih seçiminizi yukarıdan yapın.</p>
    </fieldset>
  `;
}

function guestStepperTemplate() {
  return `
    <fieldset class="ya-widget-guest-group">
      <legend>Kişi sayısı</legend>
      <div class="ya-widget-stepper">
        <button type="button" data-ya-guest-step="-1" aria-label="Kişi sayısını azalt" disabled>${iconTemplate("minus")}</button>
        <input name="guest_count" required type="number" min="1" max="30" value="2" inputmode="numeric" aria-label="Kişi sayısı" />
        <button type="button" data-ya-guest-step="1" aria-label="Kişi sayısını artır">${iconTemplate("plus")}</button>
      </div>
    </fieldset>
  `;
}

function infoTemplate() {
  const suggestions = ["Oda fiyatları", "Kahvaltı saatleri", "Konum", "Masa var mı?", "Çocuk uygun mu?"];

  return `
    <div class="ya-widget-subview ya-widget-info">
      ${subviewNavigationTemplate("Bilgi al", "help")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${iconTemplate("bot")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">Merak ettiğiniz şeyi sorun</h2>
          <p>Kısa sorunuzu yazın veya sık sorulanlardan birini seçin.</p>
        </div>
      </div>
      <div class="ya-widget-suggestions" role="group" aria-label="Sık sorulan sorular">
        ${suggestions
          .map(
            (suggestion) =>
              `<button type="button" data-ya-question-suggestion="${escapeAttribute(suggestion)}">${escapeHtml(suggestion)}</button>`
          )
          .join("")}
      </div>
      <form class="ya-widget-ai" data-ya-ai-form>
        <label class="ya-widget-field">
          <span>Kısa soru</span>
          <textarea name="message" required maxlength="1200" rows="3" placeholder="Örn. Bu akşam 4 kişilik masa var mı?">${escapeHtml(
            state.questionDraft
          )}</textarea>
        </label>
        <div class="ya-widget-ai-actions">
          <button class="ya-widget-primary-action" type="submit" ${state.aiLoading ? "disabled" : ""}>
            ${iconTemplate("sparkles")}
            <span>${state.aiLoading ? "Yanıt hazırlanıyor" : "AI Yardımcıya Sor"}</span>
          </button>
          <button class="ya-widget-secondary-action" type="button" data-ya-ai-whatsapp>
            ${iconTemplate("whatsapp")}
            <span>WhatsApp'tan Yaz</span>
          </button>
        </div>
      </form>
      ${
        state.aiAnswer
          ? `<div class="ya-widget-ai-answer">
              <span class="ya-widget-answer-avatar" aria-hidden="true">${iconTemplate("sparkles")}</span>
              <p><strong>AI Yardımcı</strong><span>${escapeHtml(state.aiAnswer)}</span></p>
            </div>`
          : ""
      }
      <p class="ya-widget-trust ya-widget-inline-trust">${iconTemplate("shield")} Kesin fiyat ve müsaitlik bilgisini işletme onaylar.</p>
    </div>
  `;
}

function whatsappTemplate() {
  const topics = [
    {
      key: "reservation",
      label: "Rezervasyon soracağım",
      message: `Merhaba, ${config.businessName} için oda müsaitliği ve rezervasyon hakkında bilgi almak istiyorum.`
    },
    {
      key: "table",
      label: "Masa soracağım",
      message: `Merhaba, ${config.businessName} için masa müsaitliği hakkında bilgi almak istiyorum.`
    },
    {
      key: "menu",
      label: "Menü hakkında soracağım",
      message: `Merhaba, ${config.businessName} menüsü hakkında bilgi almak istiyorum.`
    },
    { key: "custom", label: "Kendi mesajımı yazacağım", message: "" }
  ];

  return `
    <div class="ya-widget-subview ya-widget-whatsapp-view">
      ${subviewNavigationTemplate("WhatsApp", "whatsapp")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${iconTemplate("whatsapp")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">Mesajınızı birlikte hazırlayalım</h2>
          <p>Konuyu seçin; metni isterseniz göndermeden önce düzenleyin.</p>
        </div>
      </div>
      <div class="ya-widget-topic-chips" role="group" aria-label="WhatsApp mesaj konusu">
        ${topics
          .map(
            (topic) => `
              <button
                type="button"
                data-ya-whatsapp-topic="${topic.key}"
                data-ya-whatsapp-message="${escapeAttribute(topic.message)}"
                aria-pressed="${state.whatsappTopic === topic.key ? "true" : "false"}"
                class="${state.whatsappTopic === topic.key ? "is-active" : ""}"
              >${escapeHtml(topic.label)}</button>
            `
          )
          .join("")}
      </div>
      <form class="ya-widget-direct-whatsapp" data-ya-whatsapp-form>
        <label class="ya-widget-field">
          <span>Mesajınız</span>
          <textarea name="message" required rows="3" maxlength="1200" placeholder="Kısa mesajınızı yazın">${escapeHtml(
            state.whatsappDraft
          )}</textarea>
        </label>
        <div class="ya-widget-message-preview">
          <span>Hazır mesaj</span>
          <p data-ya-message-preview>${
            state.whatsappDraft ? escapeHtml(state.whatsappDraft) : "Bir konu seçtiğinizde mesajınız burada görünecek."
          }</p>
        </div>
        <button class="ya-widget-primary-action" type="submit">
          ${iconTemplate("send")}
          <span>WhatsApp'ta Aç</span>
        </button>
      </form>
    </div>
  `;
}

function subviewNavigationTemplate(label: string, icon: IconName) {
  return `
    <div class="ya-widget-subview-nav">
      <button type="button" data-ya-view="home">${iconTemplate("arrow-left")}<span>Geri</span></button>
      <span class="ya-widget-active-flow">${iconTemplate(icon)} ${escapeHtml(label)}</span>
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
        status: "",
        aiLoading: false
      };
      render();
      focusWidgetElement(".ya-widget-view-title");
    });
  });

  root.querySelectorAll<HTMLElement>("[data-ya-request-type]").forEach((button) => {
    button.addEventListener("click", () => {
      state = {
        ...state,
        view: "form",
        requestType: button.dataset.yaRequestType as RequestType,
        status: ""
      };
      render();
      focusWidgetElement(".ya-widget-view-title");
    });
  });

  bindDateControls(root);
  bindGuestStepper(root);
  bindInfoControls(root);
  bindWhatsAppControls(root);

  root.querySelector<HTMLFormElement>("[data-ya-form]")?.addEventListener("submit", handleFormSubmit);
  root.querySelector<HTMLFormElement>("[data-ya-ai-form]")?.addEventListener("submit", handleAiSubmit);
  root.querySelector<HTMLFormElement>("[data-ya-whatsapp-form]")?.addEventListener("submit", handleDirectWhatsAppSubmit);

  root.onkeydown = (event) => {
    if (event.key === "Escape" && state.isOpen) {
      event.preventDefault();
      close();
    }
  };
}

function bindDateControls(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>("[data-ya-date-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = button.dataset.yaDatePreset as DatePreset;
      const dateValue = String(button.dataset.yaDateValue ?? "");
      updateDateControls(root, preset, dateValue);
    });
  });

  root.querySelector<HTMLInputElement>('input[name="date_iso"]')?.addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    updateDateControls(root, "custom", input.value);
  });
}

function updateDateControls(root: HTMLElement, preset: DatePreset, dateValue: string) {
  const dateInput = root.querySelector<HTMLInputElement>('input[name="date_iso"]');
  const dateTextInput = root.querySelector<HTMLInputElement>('input[name="date_text"]');
  const customControl = root.querySelector<HTMLElement>("[data-ya-date-custom]");
  const customLabel = root.querySelector<HTMLElement>("[data-ya-custom-date-label]");
  const selectedDate = root.querySelector<HTMLElement>("[data-ya-selected-date]");
  if (!dateInput || !dateTextInput || !dateValue) {
    return;
  }

  const dateText = formatDateForRequest(dateValue, preset);
  dateInput.value = dateValue;
  dateTextInput.value = dateText;

  root.querySelectorAll<HTMLButtonElement>("[data-ya-date-preset]").forEach((button) => {
    const isActive = button.dataset.yaDatePreset === preset;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  customControl?.classList.toggle("is-active", preset === "custom");
  if (customLabel) {
    customLabel.textContent = preset === "custom" ? formatTurkishCalendarDate(dateValue) : "Tarih seç";
  }
  if (selectedDate) {
    selectedDate.textContent = `Seçilen tarih: ${dateText}`;
  }
}

function bindGuestStepper(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('input[name="guest_count"]');
  if (!input) {
    return;
  }

  const syncButtons = () => {
    const value = readGuestCount(input.value);
    root.querySelectorAll<HTMLButtonElement>("[data-ya-guest-step]").forEach((button) => {
      const amount = Number(button.dataset.yaGuestStep ?? 0);
      button.disabled = (amount < 0 && value <= 1) || (amount > 0 && value >= 30);
    });
  };

  root.querySelectorAll<HTMLButtonElement>("[data-ya-guest-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const amount = Number(button.dataset.yaGuestStep ?? 0);
      input.value = String(Math.min(30, Math.max(1, readGuestCount(input.value) + amount)));
      syncButtons();
    });
  });

  input.addEventListener("input", syncButtons);
  syncButtons();
}

function bindInfoControls(root: HTMLElement) {
  const textarea = root.querySelector<HTMLTextAreaElement>(".ya-widget-ai textarea");
  if (!textarea) {
    return;
  }

  textarea.addEventListener("input", () => {
    state.questionDraft = textarea.value;
  });

  root.querySelectorAll<HTMLButtonElement>("[data-ya-question-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      const question = String(button.dataset.yaQuestionSuggestion ?? "");
      textarea.value = question;
      state.questionDraft = question;
      root.querySelectorAll("[data-ya-question-suggestion]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      textarea.focus();
    });
  });

  root.querySelector<HTMLButtonElement>("[data-ya-ai-whatsapp]")?.addEventListener("click", () => {
    const question = textarea.value.trim() || "Bilgi almak istiyorum.";
    state.questionDraft = textarea.value;
    const message = `Merhaba, ${config.businessName} hakkında bilgi almak istiyorum. Sorum: ${question}`;
    window.open(createWhatsAppLink(config.whatsappPhone, message), "_blank", "noopener,noreferrer");
    setStatus("Sorunuz WhatsApp mesajı olarak hazırlandı.");
  });
}

function bindWhatsAppControls(root: HTMLElement) {
  const textarea = root.querySelector<HTMLTextAreaElement>(".ya-widget-direct-whatsapp textarea");
  const preview = root.querySelector<HTMLElement>("[data-ya-message-preview]");
  if (!textarea || !preview) {
    return;
  }

  const updatePreview = () => {
    state.whatsappDraft = textarea.value;
    preview.textContent = textarea.value.trim() || "Mesajınızı yazdığınızda burada görünecek.";
  };

  textarea.addEventListener("input", () => {
    state.whatsappTopic = "custom";
    root.querySelectorAll<HTMLButtonElement>("[data-ya-whatsapp-topic]").forEach((button) => {
      const isActive = button.dataset.yaWhatsappTopic === "custom";
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    updatePreview();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-ya-whatsapp-topic]").forEach((button) => {
    button.addEventListener("click", () => {
      const topic = String(button.dataset.yaWhatsappTopic ?? "");
      const message = String(button.dataset.yaWhatsappMessage ?? "");
      state.whatsappTopic = topic;
      textarea.value = message;
      updatePreview();
      root.querySelectorAll<HTMLButtonElement>("[data-ya-whatsapp-topic]").forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });
      textarea.focus();
    });
  });
}

function handleFormSubmit(event: Event) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const formData = new FormData(form);
  const customerPhone = String(formData.get("customer_phone") ?? "");
  const normalizedPhone = normalizeTRMobilePhone(customerPhone);

  if (!normalizedPhone.ok) {
    setStatus(normalizedPhone.error);
    form.querySelector<HTMLInputElement>('input[name="customer_phone"]')?.focus();
    return;
  }

  const payload: RequestPayload = {
    request_type: String(formData.get("request_type") ?? state.requestType) as RequestType,
    customer_name: String(formData.get("customer_name") ?? "").trim(),
    customer_phone: customerPhone.trim(),
    date_text: String(formData.get("date_text") ?? "").trim(),
    start_date: String(formData.get("date_iso") ?? "").trim(),
    guest_count: Number(formData.get("guest_count") ?? 1),
    message: String(formData.get("message") ?? "").trim(),
    source: "web_form",
    whatsapp_message: ""
  };

  if (!payload.customer_name || (!payload.date_text && !payload.start_date) || !Number.isFinite(payload.guest_count) || payload.guest_count < 1) {
    setStatus("Lütfen gerekli alanları kontrol edin.");
    return;
  }

  payload.whatsapp_message = buildWhatsAppMessage(payload);
  void saveRequest(payload);
  window.open(createWhatsAppLink(config.whatsappPhone, payload.whatsapp_message), "_blank", "noopener,noreferrer");
  setStatus("WhatsApp mesajı hazırlandı. Bilgileri kontrol edip gönder tuşuna basın.");
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
    setStatus("Talep kaydı sırasında sorun oldu. WhatsApp mesajınız yine de hazırlandı.");
  }
}

async function handleAiSubmit(event: Event) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const formData = new FormData(form);
  const message = String(formData.get("message") ?? "").trim();

  if (!message) {
    setStatus("Lütfen kısa sorunuzu yazın.");
    return;
  }

  if (!config.apiBaseUrl) {
    setStatus("AI bağlantısı bu sitede etkin değil. Sorunuzu WhatsApp'tan iletebilirsiniz.");
    return;
  }

  state = { ...state, questionDraft: message, status: "Yanıt hazırlanıyor.", aiLoading: true };
  render();

  let failureStatus = "";
  try {
    const endpoint = `${config.apiBaseUrl.replace(/\/$/, "")}/api/chat.php`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message })
    });
    const result = (await response.json().catch(() => null)) as AiChatResponse | null;

    if (!response.ok || !result?.ok || !result.answer) {
      failureStatus = formatAiError(result?.error, result?.message);
      throw new Error("ai_failed");
    }

    state = {
      ...state,
      aiAnswer: result.answer,
      aiLoading: false,
      status: result.fallback ? formatAiError(result.error) : ""
    };
    render();
  } catch {
    state = {
      ...state,
      aiLoading: false,
      status: failureStatus || "AI servisine ulaşılamadı. İnternet veya sunucu bağlantısını kontrol edin. Hata kodu: widget_connection_failed."
    };
    render();
  }
}

function handleDirectWhatsAppSubmit(event: Event) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const formData = new FormData(form);
  const message = String(formData.get("message") ?? "").trim();

  if (!message) {
    setStatus("Lütfen bir konu seçin veya kısa mesajınızı yazın.");
    return;
  }

  state.whatsappDraft = message;
  window.open(createWhatsAppLink(config.whatsappPhone, message), "_blank", "noopener,noreferrer");
  setStatus("Mesajınız WhatsApp'ta hazırlandı.");
}

function setStatus(message: string) {
  state.status = message;
  const status = document.querySelector<HTMLElement>(`#${ROOT_ID} [data-ya-status]`);
  if (!status) {
    return;
  }

  status.textContent = message;
  status.hidden = !message;
}

function formatAiError(error?: AiErrorDetail | null, fallbackMessage = ""): string {
  const message = String(error?.message || fallbackMessage || "AI yanıtı alınamadı.").trim();
  const code = String(error?.code || "unknown_ai_error").trim();
  const providerStatus = Number(error?.provider_status || 0);
  const statusText = providerStatus > 0 ? ` (HTTP ${providerStatus})` : "";
  const retryText = error?.retryable === true ? " Biraz sonra yeniden deneyebilirsiniz." : "";

  return `${message} Hata kodu: ${code}${statusText}.${retryText}`;
}

function getAssistantTitle() {
  const businessName = config.businessName.trim() || "Yardımcı";
  const shortName = businessName
    .replace(/\s+(?:Pansiyon|Otel|Butik Otel|Restoran|Kafe)(?:\s*(?:&|\/)\s*(?:Pansiyon|Otel|Restoran|Kafe))*\s*$/i, "")
    .trim();
  const baseName = shortName && shortName.toLocaleLowerCase("tr-TR") !== "yardımcı asistan" ? shortName : "Yardımcı";
  return `${baseName} AI Asistanı`;
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
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = widgetStyles(widgetConfig);
}

function widgetStyles(widgetConfig: WidgetConfig) {
  return `
    #${ROOT_ID} {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483000;
      color: #172033;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.4;
    }

    #${ROOT_ID} * {
      box-sizing: border-box;
    }

    #${ROOT_ID} button,
    #${ROOT_ID} input,
    #${ROOT_ID} textarea {
      font: inherit;
    }

    #${ROOT_ID} button:focus-visible,
    #${ROOT_ID} a:focus-visible,
    #${ROOT_ID} input:focus-visible,
    #${ROOT_ID} textarea:focus-visible {
      outline: 3px solid rgba(255, 184, 146, 0.72);
      outline-offset: 2px;
    }

    #${ROOT_ID} [hidden] {
      display: none !important;
    }

    #${ROOT_ID} .ya-widget-icon {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.9;
    }

    .ya-widget-button {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 58px;
      padding: 8px 14px 8px 8px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 18px;
      color: #ffffff;
      background: linear-gradient(135deg, ${widgetConfig.primaryColor}, #174c44 78%);
      box-shadow: 0 18px 44px rgba(18, 59, 54, 0.3), 0 0 0 5px rgba(47, 111, 94, 0.08);
      cursor: pointer;
      isolation: isolate;
      transition: transform 180ms ease, box-shadow 180ms ease;
    }

    .ya-widget-button::before {
      position: absolute;
      inset: -100% 40% auto -30%;
      height: 140px;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.28), transparent 64%);
      content: "";
      z-index: -1;
    }

    .ya-widget-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 22px 52px rgba(18, 59, 54, 0.34), 0 0 0 6px rgba(47, 111, 94, 0.09);
    }

    .ya-widget-launcher-avatar {
      position: relative;
      display: grid;
      width: 42px;
      height: 42px;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 5px 14px rgba(18, 59, 54, 0.2);
    }

    .ya-widget-online-dot {
      position: absolute;
      right: -1px;
      bottom: -1px;
      width: 11px;
      height: 11px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      background: #62d39a;
      box-shadow: 0 0 0 3px rgba(98, 211, 154, 0.18);
    }

    .ya-widget-launcher-copy {
      display: grid;
      min-width: 108px;
      text-align: left;
    }

    .ya-widget-launcher-copy strong {
      font-size: 14px;
      letter-spacing: 0.01em;
    }

    .ya-widget-launcher-copy small {
      color: rgba(255, 255, 255, 0.78);
      font-size: 11px;
    }

    .ya-widget-launcher-sparkle {
      width: 17px !important;
      height: 17px !important;
      color: #ffd4bd;
    }

    .ya-widget-mark {
      width: 34px;
      height: 34px;
      object-fit: contain;
      border-radius: 10px;
    }

    .ya-widget-mark-fallback {
      display: grid;
      place-items: center;
      color: ${widgetConfig.primaryColor};
      background: #ffffff;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.04em;
    }

    .ya-widget-panel {
      display: flex;
      width: 410px;
      max-width: calc(100vw - 28px);
      max-height: min(710px, calc(100dvh - 36px));
      overflow: hidden;
      flex-direction: column;
      border: 1px solid rgba(47, 111, 94, 0.24);
      border-radius: 24px;
      background: #fff9ef;
      box-shadow: 0 28px 80px rgba(23, 32, 51, 0.26), 0 0 0 5px rgba(47, 111, 94, 0.07);
    }

    .ya-widget-header {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 92px;
      padding: 14px;
      overflow: hidden;
      color: #ffffff;
      background: linear-gradient(135deg, ${widgetConfig.primaryColor}, #18564e 56%, #123d3a);
      isolation: isolate;
    }

    .ya-widget-header::after {
      position: absolute;
      top: -75px;
      right: -45px;
      width: 190px;
      height: 190px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.18), transparent 64%);
      content: "";
      z-index: -1;
    }

    .ya-widget-identity {
      display: flex;
      align-items: center;
      gap: 11px;
      min-width: 0;
    }

    .ya-widget-avatar {
      position: relative;
      display: grid;
      width: 48px;
      height: 48px;
      flex: 0 0 auto;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.34);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 8px 24px rgba(10, 44, 40, 0.24);
    }

    .ya-widget-avatar-spark {
      position: absolute;
      top: -5px;
      right: -5px;
      display: grid;
      width: 19px;
      height: 19px;
      place-items: center;
      border: 2px solid ${widgetConfig.primaryColor};
      border-radius: 50%;
      color: ${widgetConfig.primaryColor};
      background: #ffe4d3;
    }

    .ya-widget-avatar-spark .ya-widget-icon {
      width: 11px !important;
      height: 11px !important;
    }

    .ya-widget-title-copy {
      display: grid;
      min-width: 0;
      gap: 3px;
    }

    .ya-widget-title-copy strong {
      overflow: hidden;
      font-size: 15px;
      line-height: 1.25;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ya-widget-title-copy small {
      max-width: 260px;
      color: rgba(255, 255, 255, 0.78);
      font-size: 11px;
      line-height: 1.35;
    }

    .ya-widget-close {
      display: grid;
      width: 44px;
      height: 44px;
      flex: 0 0 auto;
      place-items: center;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 14px;
      color: #ffffff;
      background: rgba(255, 255, 255, 0.08);
      cursor: pointer;
    }

    .ya-widget-close:hover {
      background: rgba(255, 255, 255, 0.16);
    }

    .ya-widget-close span {
      font-size: 25px;
      line-height: 1;
      transform: translateY(-1px);
    }

    .ya-widget-content {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-color: rgba(47, 111, 94, 0.32) transparent;
    }

    .ya-widget-home,
    .ya-widget-subview {
      display: grid;
      gap: 14px;
      padding: 16px;
    }

    .ya-widget-welcome,
    .ya-widget-subview-intro {
      display: flex;
      align-items: flex-start;
      gap: 11px;
    }

    .ya-widget-welcome {
      padding: 13px;
      border: 1px solid rgba(47, 111, 94, 0.13);
      border-radius: 17px 17px 17px 5px;
      background: linear-gradient(135deg, rgba(231, 240, 230, 0.78), rgba(255, 255, 255, 0.88));
    }

    .ya-widget-bot-bubble,
    .ya-widget-subview-intro > span,
    .ya-widget-answer-avatar {
      display: grid;
      width: 38px;
      height: 38px;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 13px;
      color: ${widgetConfig.primaryColor};
      background: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.15), 0 5px 14px rgba(23, 32, 51, 0.06);
    }

    .ya-widget-kicker {
      color: ${widgetConfig.primaryColor};
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.055em;
      text-transform: uppercase;
    }

    .ya-widget-welcome h2,
    .ya-widget-subview-intro h2 {
      margin: 3px 0 3px;
      color: #172033;
      font-size: 17px;
      line-height: 1.25;
    }

    .ya-widget-welcome p,
    .ya-widget-subview-intro p {
      margin: 0;
      color: #626875;
      font-size: 12px;
      line-height: 1.45;
    }

    .ya-widget-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .ya-widget-actions button,
    .ya-widget-actions a,
    .ya-widget-suggestions button,
    .ya-widget-topic-chips button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 44px;
      padding: 9px 12px;
      border: 1px solid #ddd9d0;
      border-radius: 999px;
      color: #24313a;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 5px 16px rgba(23, 32, 51, 0.04);
      font-size: 12px;
      font-weight: 750;
      text-decoration: none;
      cursor: pointer;
      transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
    }

    .ya-widget-actions button:hover,
    .ya-widget-actions a:hover,
    .ya-widget-suggestions button:hover,
    .ya-widget-topic-chips button:hover {
      transform: translateY(-1px);
      border-color: rgba(47, 111, 94, 0.42);
    }

    .ya-widget-actions button:nth-child(1),
    .ya-widget-actions button:nth-child(2) {
      color: ${widgetConfig.primaryColor};
      border-color: rgba(47, 111, 94, 0.2);
      background: #f5faf5;
    }

    .ya-widget-menu-link {
      color: ${widgetConfig.primaryColor} !important;
      border-color: rgba(47, 111, 94, 0.2) !important;
    }

    .ya-widget-trust,
    .ya-widget-form-note {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      margin: 0;
      color: #69707b;
      font-size: 11px;
      line-height: 1.45;
    }

    .ya-widget-trust .ya-widget-icon,
    .ya-widget-form-note .ya-widget-icon {
      width: 15px !important;
      height: 15px !important;
      color: ${widgetConfig.primaryColor};
    }

    .ya-widget-subview-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .ya-widget-subview-nav > button {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 40px;
      padding: 7px 9px;
      border: 0;
      border-radius: 11px;
      color: #58606f;
      background: transparent;
      font-size: 12px;
      font-weight: 750;
      cursor: pointer;
    }

    .ya-widget-subview-nav > button:hover {
      color: #172033;
      background: rgba(255, 255, 255, 0.76);
    }

    .ya-widget-active-flow {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 34px;
      padding: 6px 10px;
      border: 1px solid rgba(47, 111, 94, 0.16);
      border-radius: 999px;
      color: ${widgetConfig.primaryColor};
      background: #eef6ed;
      font-size: 11px;
      font-weight: 800;
    }

    .ya-widget-active-flow .ya-widget-icon {
      width: 15px !important;
      height: 15px !important;
    }

    .ya-widget-subview-intro {
      padding: 0 2px;
    }

    .ya-widget-form,
    .ya-widget-ai,
    .ya-widget-direct-whatsapp {
      display: grid;
      gap: 12px;
    }

    .ya-widget-field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .ya-widget-field {
      display: grid;
      min-width: 0;
      gap: 6px;
      color: #172033;
      font-size: 12px;
      font-weight: 800;
    }

    .ya-widget-field small {
      color: #777d87;
      font-size: 10px;
      font-weight: 600;
    }

    .ya-widget-field input,
    .ya-widget-field textarea {
      width: 100%;
      min-height: 44px;
      padding: 10px 11px;
      border: 1px solid #dcd7cf;
      border-radius: 12px;
      color: #172033;
      background: rgba(255, 255, 255, 0.94);
      font-size: 13px !important;
      font-weight: 500;
    }

    .ya-widget-field textarea {
      min-height: 64px;
      resize: vertical;
    }

    .ya-widget-field input::placeholder,
    .ya-widget-field textarea::placeholder {
      color: #777d87;
      opacity: 1;
    }

    .ya-widget-date-group,
    .ya-widget-guest-group {
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .ya-widget-date-group {
      padding: 11px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 15px;
      background: linear-gradient(135deg, rgba(231, 240, 230, 0.75), rgba(255, 255, 255, 0.78));
    }

    .ya-widget-date-group legend,
    .ya-widget-guest-group legend {
      margin-bottom: 7px;
      padding: 0;
      color: #172033;
      font-size: 12px;
      font-weight: 850;
    }

    .ya-widget-date-options {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }

    .ya-widget-date-options > button,
    .ya-widget-date-custom {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      min-width: 0;
      min-height: 42px;
      padding: 7px 5px;
      overflow: hidden;
      border: 1px solid #dcd7cf;
      border-radius: 10px;
      color: #334048;
      background: rgba(255, 255, 255, 0.9);
      font-size: 10px;
      font-weight: 800;
      text-align: center;
      cursor: pointer;
    }

    .ya-widget-date-options > button.is-active,
    .ya-widget-date-custom.is-active {
      color: ${widgetConfig.primaryColor};
      border-color: rgba(47, 111, 94, 0.5);
      background: #e7f1e6;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.07);
    }

    .ya-widget-date-custom .ya-widget-icon {
      width: 14px !important;
      height: 14px !important;
    }

    .ya-widget-date-custom input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      padding: 0;
      border: 0;
      opacity: 0;
      cursor: pointer;
    }

    .ya-widget-date-custom:focus-within {
      outline: 3px solid rgba(255, 184, 146, 0.72);
      outline-offset: 2px;
    }

    .ya-widget-date-options > input[type="hidden"] {
      display: none;
    }

    .ya-widget-date-group > p {
      margin: 7px 1px 0;
      color: #6b727c;
      font-size: 10px;
    }

    .ya-widget-stepper {
      display: grid;
      grid-template-columns: 44px 64px 44px;
      width: max-content;
      overflow: hidden;
      border: 1px solid #dcd7cf;
      border-radius: 12px;
      background: #ffffff;
    }

    .ya-widget-stepper button {
      display: grid;
      min-width: 44px;
      min-height: 44px;
      place-items: center;
      padding: 0;
      border: 0;
      color: ${widgetConfig.primaryColor};
      background: transparent;
      cursor: pointer;
    }

    .ya-widget-stepper button:first-child {
      border-right: 1px solid #e2ddd5;
    }

    .ya-widget-stepper button:last-child {
      border-left: 1px solid #e2ddd5;
    }

    .ya-widget-stepper button:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }

    .ya-widget-stepper input {
      width: 64px;
      min-width: 0;
      border: 0;
      color: #172033;
      background: transparent;
      text-align: center;
      font-size: 14px !important;
      font-weight: 850;
      appearance: textfield;
    }

    .ya-widget-stepper input::-webkit-inner-spin-button,
    .ya-widget-stepper input::-webkit-outer-spin-button {
      margin: 0;
      appearance: none;
    }

    .ya-widget-primary-action,
    .ya-widget-secondary-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: 46px;
      padding: 10px 13px;
      border-radius: 13px;
      font-size: 12px;
      font-weight: 850;
      cursor: pointer;
    }

    .ya-widget-primary-action {
      border: 1px solid transparent;
      color: #ffffff;
      background: linear-gradient(135deg, ${widgetConfig.primaryColor}, #1b5a50);
      box-shadow: 0 9px 22px rgba(47, 111, 94, 0.2);
    }

    .ya-widget-secondary-action {
      border: 1px solid rgba(47, 111, 94, 0.24);
      color: ${widgetConfig.primaryColor};
      background: #ffffff;
    }

    .ya-widget-primary-action:disabled {
      cursor: wait;
      opacity: 0.7;
    }

    .ya-widget-suggestions,
    .ya-widget-topic-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .ya-widget-suggestions button,
    .ya-widget-topic-chips button {
      min-height: 40px;
      padding: 7px 10px;
      font-size: 11px;
      box-shadow: none;
    }

    .ya-widget-suggestions button.is-active,
    .ya-widget-topic-chips button.is-active {
      color: ${widgetConfig.primaryColor};
      border-color: rgba(47, 111, 94, 0.44);
      background: #e9f3e8;
    }

    .ya-widget-ai-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .ya-widget-ai-answer {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      padding: 12px;
      border: 1px solid rgba(47, 111, 94, 0.16);
      border-radius: 16px 16px 16px 5px;
      background: linear-gradient(135deg, #edf5ec, #ffffff);
    }

    .ya-widget-answer-avatar {
      width: 32px;
      height: 32px;
      border-radius: 11px;
    }

    .ya-widget-answer-avatar .ya-widget-icon {
      width: 15px !important;
      height: 15px !important;
    }

    .ya-widget-ai-answer p {
      display: grid;
      gap: 3px;
      margin: 0;
      min-width: 0;
    }

    .ya-widget-ai-answer strong {
      color: #172033;
      font-size: 11px;
    }

    .ya-widget-ai-answer p span {
      color: #555e68;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .ya-widget-inline-trust {
      padding-top: 2px;
    }

    .ya-widget-message-preview {
      padding: 11px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 14px 14px 4px 14px;
      background: #edf5ec;
    }

    .ya-widget-message-preview > span {
      color: ${widgetConfig.primaryColor};
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .ya-widget-message-preview p {
      margin: 5px 0 0;
      color: #36444b;
      font-size: 11px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .ya-widget-status {
      margin: 0 16px 16px;
      padding: 10px 11px;
      border: 1px solid rgba(228, 120, 99, 0.26);
      border-radius: 12px;
      color: #8b4133;
      background: #fff0e7;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.45;
    }

    @media (max-width: 520px) {
      #${ROOT_ID} {
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        pointer-events: none;
      }

      #${ROOT_ID} > * {
        pointer-events: auto;
      }

      .ya-widget-button {
        margin: 0 12px max(12px, env(safe-area-inset-bottom));
      }

      .ya-widget-panel {
        width: 100%;
        max-width: none;
        max-height: min(92dvh, 760px);
        border-right: 0;
        border-bottom: 0;
        border-left: 0;
        border-radius: 24px 24px 0 0;
        box-shadow: 0 -18px 60px rgba(23, 32, 51, 0.28);
      }

      .ya-widget-content {
        padding-bottom: env(safe-area-inset-bottom);
      }
    }

    @media (max-width: 430px) {
      .ya-widget-header {
        min-height: 86px;
        padding: 12px;
      }

      .ya-widget-title-copy small {
        max-width: 235px;
      }

      .ya-widget-home,
      .ya-widget-subview {
        padding: 14px;
      }

      .ya-widget-field-grid {
        grid-template-columns: 1fr;
      }

      .ya-widget-date-options {
        grid-template-columns: 1fr 1fr;
      }

      .ya-widget-ai-actions {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 350px) {
      .ya-widget-launcher-copy,
      .ya-widget-launcher-sparkle {
        display: none;
      }

      .ya-widget-button {
        min-width: 58px;
        padding-right: 8px;
      }

      .ya-widget-title-copy small {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ya-widget-button,
      .ya-widget-actions button,
      .ya-widget-actions a,
      .ya-widget-suggestions button,
      .ya-widget-topic-chips button {
        transition: none;
      }
    }
  `;
}

const iconPaths = {
  sparkles: '<path d="m12 3-1.4 3.5L7 8l3.6 1.4L12 13l1.4-3.6L17 8l-3.6-1.5L12 3Z"/><path d="m5 15-.8 2-2.2.8 2.2.9L5 21l.8-2.3 2.2-.9-2.2-.8L5 15Z"/>',
  bot: '<rect x="5" y="7" width="14" height="11" rx="4"/><path d="M12 4v3M9 12h.01M15 12h.01M9 15h6"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 9h16M8 13h.01M12 13h.01M16 13h.01"/>',
  table: '<path d="M4 10h16M6 10l-1 10M18 10l1 10M8 6h8a2 2 0 0 1 2 2v2H6V8a2 2 0 0 1 2-2Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-.9.8-.9 1.6M12 17h.01"/>',
  whatsapp: '<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8.7c.5 2.5 2 4 4.5 4.8l1-1"/>',
  menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 2.8 7.8 7 10 4.2-2.2 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  "arrow-left": '<path d="m15 18-6-6 6-6M9 12h10"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>'
} as const;

type IconName = keyof typeof iconPaths;

function iconTemplate(name: IconName, className = "") {
  return `<svg class="ya-widget-icon${className ? ` ${className}` : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;
}

function getScriptConfig(): Partial<WidgetConfig> {
  const script = document.currentScript as HTMLScriptElement | null;
  const dataset = script?.dataset ?? {};

  return removeEmptyValues({
    businessName: dataset.businessName,
    whatsappPhone: dataset.whatsappPhone,
    apiBaseUrl: dataset.apiBaseUrl,
    menuUrl: dataset.menuUrl,
    logoUrl: dataset.logoUrl,
    primaryColor: dataset.primaryColor,
    accentColor: dataset.accentColor
  });
}

function removeEmptyValues(values: Partial<WidgetConfig>): Partial<WidgetConfig> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === "string" && value.length > 0)) as Partial<WidgetConfig>;
}

function focusWidgetElement(selector: string) {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`#${ROOT_ID} ${selector}`)?.focus();
  });
}

function readGuestCount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(30, Math.floor(parsed)) : 1;
}

function addLocalDays(date: Date, amount: number) {
  const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function nextWeekendDate(date: Date) {
  const day = date.getDay();
  return addLocalDays(date, day === 0 || day === 6 ? 0 : 6 - day);
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

function formatDateForRequest(value: string, preset: DatePreset) {
  const calendarDate = formatTurkishCalendarDate(value);
  if (preset === "today") {
    return `Bugün, ${calendarDate}`;
  }
  if (preset === "tomorrow") {
    return `Yarın, ${calendarDate}`;
  }
  if (preset === "weekend") {
    return `Hafta sonu, ${calendarDate}`;
  }
  return calendarDate;
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
