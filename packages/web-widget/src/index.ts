import {
  buildCustomerRequestWhatsAppMessage,
  createWhatsAppUrl,
  normalizeTRMobilePhone as normalizeBridgeTRMobilePhone
} from "@yardimci-asistan/whatsapp-bridge";

type RequestType = "pension_reservation" | "restaurant_reservation" | "general_info";
type WidgetView = "home" | "form" | "info" | "whatsapp" | "directions";
type DatePreset = "today" | "tomorrow" | "weekend" | "custom";
type WidgetIntent = "home" | "accommodation.reserve" | "accommodation.info" | "food.reserve" | "info" | "directions";

interface WidgetContext {
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  imageUrl?: string;
  sourcePath?: string;
  question?: string;
  address?: string;
  mapUrl?: string;
}

interface WidgetOpenOptions {
  intent?: WidgetIntent;
  context?: WidgetContext;
}
type BusinessProfileId = "pension_restaurant" | "pension" | "restaurant" | "cafe" | "market";
type PublicSurface = "accommodation" | "food_service" | "menu" | "catalog" | "directions";

interface WidgetConfig {
  businessName: string;
  whatsappPhone: string;
  apiBaseUrl: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  profileId: BusinessProfileId | "";
  publicSurfaces: PublicSurface[];
  aiEnabled: boolean;
  address: string;
  mapUrl: string;
}

interface RequestPayload {
  request_type: RequestType;
  customer_name: string;
  customer_phone: string;
  date_text: string;
  start_date: string;
  end_date: string;
  time: string;
  guest_count: number;
  message: string;
  source: "web_form";
  whatsapp_message: string;
  context: Pick<WidgetContext, "resourceType" | "resourceId" | "resourceName" | "sourcePath">;
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
  context: WidgetContext | null;
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

interface PublicBusinessApiResponse {
  ok?: boolean;
  business?: {
    display_name?: string;
    whatsapp?: string;
    profile_id?: string;
    primary_color?: string;
    accent_color?: string;
    public_surfaces?: unknown[];
    ai_enabled?: boolean;
    address?: string;
    map_url?: string;
  };
}

declare global {
  interface Window {
    YardimciAsistanWidget?: {
      init: (config?: Partial<WidgetConfig>) => void;
      open: (options?: WidgetOpenOptions) => void;
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
  logoUrl: "",
  primaryColor: "#2F6F5E",
  accentColor: "#E47863",
  profileId: "",
  publicSurfaces: [],
  aiEnabled: true,
  address: "",
  mapUrl: ""
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
  whatsappTopic: "",
  context: null
};
let footerAvoidanceBound = false;
let externalActionBound = false;
let footerPositionFrame = 0;
let closeAnimationTimer = 0;
let panelEntrancePending = false;
let businessContextLoadId = 0;

export function init(userConfig: Partial<WidgetConfig> = {}) {
  const mergedConfig = {
    ...defaultConfig,
    ...initialScriptConfig,
    ...getScriptConfig(),
    ...userConfig
  };

  config = {
    ...mergedConfig,
    profileId: normalizeBusinessProfileId(mergedConfig.profileId),
    publicSurfaces: normalizePublicSurfaces(mergedConfig.publicSurfaces)
  };

  injectStyles(config);
  ensureExternalActionBinding();
  render();
  const loadId = ++businessContextLoadId;
  void hydrateBusinessContext(loadId);
}

export function open(options: WidgetOpenOptions = {}) {
  panelEntrancePending = !state.isOpen;
  if (closeAnimationTimer) {
    window.clearTimeout(closeAnimationTimer);
    closeAnimationTimer = 0;
  }
  state = {
    ...state,
    ...resolveOpenOptions(options),
    isOpen: true,
    status: "",
    aiLoading: false,
    aiAnswer: ""
  };
  render();
  focusWidgetElement(".ya-widget-view-title, [data-ya-close]");
}

export function close() {
  const panel = document.querySelector<HTMLElement>(`#${ROOT_ID} .ya-widget-panel`);
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  if (panel && !reduceMotion) {
    panel.classList.add("is-closing");
    if (closeAnimationTimer) window.clearTimeout(closeAnimationTimer);
    closeAnimationTimer = window.setTimeout(() => {
      closeAnimationTimer = 0;
      finalizeClose();
    }, 150);
    return;
  }
  finalizeClose();
}

function finalizeClose() {
  state = {
    ...state,
    isOpen: false,
    view: "home",
    status: "",
    aiLoading: false,
    aiAnswer: "",
    questionDraft: "",
    context: null
  };
  render();
  focusWidgetElement("[data-ya-open]");
}

export function createWhatsAppLink(phone: string, message: string): string {
  return createWhatsAppUrl(phone, message);
}

export function buildWhatsAppMessage(
  payload: Pick<RequestPayload, "request_type" | "customer_name" | "customer_phone" | "date_text" | "guest_count" | "message" | "time">,
  businessName = config.businessName
): string {
  return buildCustomerRequestWhatsAppMessage({
    ...payload,
    time_text: payload.time
  }, businessName);
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
  if (state.isOpen) panelEntrancePending = false;
  bindEvents(root);
  ensureFooterAvoidance();
  updateFooterSafePosition();
}

function buttonTemplate() {
  return `
    <button class="ya-widget-button" type="button" data-ya-open aria-label="Yardımcı Asistan'ı aç">
      <span class="ya-widget-launcher-avatar">
        ${brandMarkTemplate()}
        <span class="ya-widget-online-dot" aria-hidden="true"></span>
      </span>
      <span class="ya-widget-launcher-copy">
        <strong>${config.aiEnabled ? "AI Asistan" : "İşletme Yardımcısı"}</strong>
        <small>Size yardımcı olayım</small>
      </span>
      ${iconTemplate("sparkles", "ya-widget-launcher-sparkle")}
    </button>
  `;
}

function panelTemplate() {
  return `
    <section class="ya-widget-panel${panelEntrancePending ? " is-opening" : ""}" role="dialog" aria-labelledby="ya-widget-title">
      <header class="ya-widget-header">
        <div class="ya-widget-identity">
          <span class="ya-widget-avatar">
            ${brandMarkTemplate()}
            <span class="ya-widget-avatar-spark" aria-hidden="true">${iconTemplate("sparkles")}</span>
          </span>
          <span class="ya-widget-title-copy">
            <strong id="ya-widget-title">${escapeHtml(getAssistantTitle())}</strong>
            <small>${escapeHtml(getAssistantSubtitle())}</small>
          </span>
        </div>
        <button class="ya-widget-close" type="button" data-ya-close aria-label="Asistanı kapat">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div class="ya-widget-notice" data-ya-status role="status" ${state.status ? "" : "hidden"}>
        <span class="ya-widget-notice-icon" aria-hidden="true">${iconTemplate("info")}</span>
        <span data-ya-status-text>${escapeHtml(state.status)}</span>
      </div>
      <div class="ya-widget-content">
        ${state.view === "home" ? homeTemplate() : ""}
        ${state.view === "form" ? formTemplate() : ""}
        ${state.view === "info" ? infoTemplate() : ""}
        ${state.view === "whatsapp" ? whatsappTemplate() : ""}
        ${state.view === "directions" ? directionsTemplate() : ""}
      </div>
    </section>
  `;
}

function brandMarkTemplate() {
  if (!config.logoUrl) {
    return `<span class="ya-widget-mark ya-widget-mark-fallback">${config.aiEnabled ? "AI" : "YA"}</span>`;
  }

  return `<img class="ya-widget-mark" src="${escapeAttribute(config.logoUrl)}" alt="" aria-hidden="true" />`;
}

function homeTemplate() {
  const surfaces = currentPublicSurfaces();
  const actions: string[] = [];

  if (surfaces.has("accommodation")) {
    actions.push(homeActionCard({
      requestType: "pension_reservation",
      icon: "calendar",
      title: "Rezervasyon yap",
      description: "Tarih ve kişi bilgilerini iletin"
    }));
  }
  if (surfaces.has("food_service")) {
    actions.push(homeActionCard({
      requestType: "restaurant_reservation",
      icon: "table",
      title: "Masa sor",
      description: "Tarih, saat ve kişi sayısını seçin"
    }));
  }
  if (config.aiEnabled && surfaces.has("catalog")) {
    actions.push(homeActionCard({
      view: "info",
      icon: "search",
      title: "Ürün / stok sor",
      description: "Ürün ve stok bilgisini hızlıca öğrenin"
    }));
  }

  if (config.aiEnabled) {
    actions.push(homeActionCard({
      view: "info",
      icon: "sparkles",
      title: "Asistana sor",
      description: "İşletme hakkında kısa bir soru sorun"
    }));
  }

  if (surfaces.has("directions")) {
    actions.push(homeActionCard({
      view: "directions",
      icon: "pin",
      title: "Yol tarifi",
      description: "Konumu açın veya ulaşımı sorun"
    }));
  }

  if (config.whatsappPhone.trim()) {
    actions.push(homeActionCard({
      view: "whatsapp",
      icon: "whatsapp",
      title: "WhatsApp",
      description: "Hazır bir mesaj oluşturun"
    }));
  }

  return `
    <div class="ya-widget-home">
      <div class="ya-widget-welcome">
        <span class="ya-widget-bot-bubble" aria-hidden="true">${iconTemplate("sparkles")}</span>
        <div>
          <span class="ya-widget-kicker">İşletme yardımcısı</span>
          <h2 class="ya-widget-view-title" tabindex="-1">Ne yapmak istiyorsunuz?</h2>
          <p>İşlemi seçin; gerekli alanı doğrudan açayım.</p>
        </div>
      </div>
      <div class="ya-widget-actions" role="group" aria-label="Hızlı asistan seçenekleri">
        ${actions.join("")}
      </div>
    </div>
  `;
}

function homeActionCard(input: {
  view?: WidgetView;
  requestType?: RequestType;
  icon: IconName;
  title: string;
  description: string;
}) {
  const actionAttribute = input.requestType
    ? `data-ya-request-type="${input.requestType}"`
    : `data-ya-view="${input.view ?? "home"}"`;
  return `
    <button class="ya-widget-action-card" type="button" ${actionAttribute}>
      <span class="ya-widget-action-icon" aria-hidden="true">${iconTemplate(input.icon)}</span>
      <span class="ya-widget-action-copy">
        <strong>${escapeHtml(input.title)}</strong>
        <small>${escapeHtml(input.description)}</small>
      </span>
      <span class="ya-widget-action-arrow" aria-hidden="true">${iconTemplate("chevron-right")}</span>
    </button>
  `;
}

function formTemplate() {
  const isTableRequest = state.requestType === "restaurant_reservation";
  const requestLabel = isTableRequest ? "Masa talebi" : "Rezervasyon talebi";
  const title = isTableRequest ? "Masa talebinizi hazırlayalım" : "Rezervasyonunuzu hazırlayalım";
  const scheduleControls = isTableRequest
    ? restaurantScheduleControlsTemplate()
    : accommodationScheduleControlsTemplate();

  return `
    <div class="ya-widget-subview">
      ${subviewNavigationTemplate(requestLabel, isTableRequest ? "table" : "calendar")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${iconTemplate("sparkles")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">${title}</h2>
          <p>Tarih ve iletişim bilgilerinizi ekleyin.</p>
        </div>
      </div>
      ${contextCardTemplate()}
      <form class="ya-widget-form" data-ya-form>
        <input type="hidden" name="request_type" value="${state.requestType}" />
        ${requestContextFieldsTemplate()}
        ${scheduleControls}
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
          ${iconTemplate("send")}
          <span>Talebi Gönder</span>
        </button>
      </form>
    </div>
  `;
}

function accommodationScheduleControlsTemplate() {
  const todayIso = toLocalIsoDate(new Date());
  const tomorrowIso = toLocalIsoDate(addLocalDays(new Date(), 1));

  return `
    <fieldset class="ya-widget-date-group" data-ya-accommodation-dates>
      <legend>Konaklama tarihleri</legend>
      <div class="ya-widget-date-range">
        ${datePickerControlTemplate("start_date", "Giriş", "Giriş tarihi", todayIso)}
        ${datePickerControlTemplate("end_date", "Çıkış", "Çıkış tarihi", tomorrowIso)}
      </div>
      <input name="date_text" type="hidden" />
      <div class="ya-widget-calendar" data-ya-calendar hidden></div>
      <p data-ya-selected-date aria-live="polite">Giriş ve çıkış tarihlerini seçin.</p>
    </fieldset>
  `;
}

function restaurantScheduleControlsTemplate() {
  const today = new Date();
  const todayIso = toLocalIsoDate(today);
  const tomorrowIso = toLocalIsoDate(addLocalDays(today, 1));
  const weekendIso = toLocalIsoDate(nextWeekendDate(today));

  return `
    <fieldset class="ya-widget-date-group" data-ya-restaurant-date>
      <legend>Tarih ve saat</legend>
      <div class="ya-widget-date-options">
        <button type="button" data-ya-date-preset="today" data-ya-date-value="${todayIso}" aria-pressed="false">Bugün</button>
        <button type="button" data-ya-date-preset="tomorrow" data-ya-date-value="${tomorrowIso}" aria-pressed="false">Yarın</button>
        <button type="button" data-ya-date-preset="weekend" data-ya-date-value="${weekendIso}" aria-pressed="false">Hafta sonu</button>
        <button class="ya-widget-date-custom" type="button" data-ya-open-date-picker="start_date">
          ${iconTemplate("calendar")}
          <span data-ya-custom-date-label>Tarih seç</span>
        </button>
      </div>
      <input name="start_date" type="hidden" data-ya-date-value-input min="${todayIso}" />
      <input name="date_text" type="hidden" />
      <div class="ya-widget-calendar" data-ya-calendar hidden></div>
      <label class="ya-widget-time-field">
        <span>Saat</span>
        <input name="time" type="time" required step="900" aria-label="Rezervasyon saati" />
      </label>
      <p data-ya-selected-date aria-live="polite">Tarih ve saat seçiminizi yapın.</p>
    </fieldset>
  `;
}

function datePickerControlTemplate(name: "start_date" | "end_date", label: string, placeholder: string, min: string) {
  return `
    <div class="ya-widget-date-picker" data-ya-date-picker-control="${name}">
      <span>${label}</span>
      <button type="button" data-ya-open-date-picker="${name}">
        ${iconTemplate("calendar")}
        <strong data-ya-date-label="${name}">${placeholder}</strong>
      </button>
      <input name="${name}" type="hidden" data-ya-date-value-input min="${min}" />
    </div>
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
  const suggestions = getInfoSuggestions();

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
      ${contextCardTemplate()}
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
          <button class="ya-widget-primary-action ${state.aiLoading ? "is-loading" : ""}" type="submit" ${state.aiLoading ? "disabled" : ""}>
            ${state.aiLoading ? '<span class="ya-widget-spinner" aria-hidden="true"></span>' : iconTemplate("sparkles")}
            <span>${state.aiLoading ? "Yanıt hazırlanıyor…" : "AI Yardımcıya Sor"}</span>
          </button>
          ${config.whatsappPhone.trim()
            ? `<button class="ya-widget-secondary-action" type="button" data-ya-ai-whatsapp>
                ${iconTemplate("whatsapp")}
                <span>WhatsApp'tan Yaz</span>
              </button>`
            : ""}
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
    </div>
  `;
}

function whatsappTemplate() {
  const topics = getWhatsAppTopics();

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

function directionsTemplate() {
  const address = String(state.context?.address || config.address || "").trim();
  const mapUrl = String(state.context?.mapUrl || config.mapUrl || buildMapSearchUrl(address)).trim();

  return `
    <div class="ya-widget-subview ya-widget-directions">
      ${subviewNavigationTemplate("Yol tarifi", "pin")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${iconTemplate("pin")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">Bize nasıl ulaşabilirsiniz?</h2>
          <p>Konumu açabilir veya ulaşım hakkında kısa bir soru sorabilirsiniz.</p>
        </div>
      </div>
      ${contextCardTemplate()}
      <div class="ya-widget-location-card">
        <span>${iconTemplate("pin")}</span>
        <div>
          <strong>${escapeHtml(config.businessName)}</strong>
          <p>${escapeHtml(address || "Adres bilgisi site tarafından iletilmedi.")}</p>
        </div>
      </div>
      <div class="ya-widget-ai-actions">
        ${mapUrl ? `<a class="ya-widget-primary-action" href="${escapeAttribute(mapUrl)}" target="_blank" rel="noopener noreferrer">${iconTemplate("pin")}<span>Haritada Aç</span></a>` : ""}
        ${config.aiEnabled ? `<button class="ya-widget-secondary-action" type="button" data-ya-directions-question>
          ${iconTemplate("help")}<span>Yol Tarifi Sor</span>
        </button>` : ""}
      </div>
    </div>
  `;
}

function contextCardTemplate() {
  const context = state.context;
  const name = String(context?.resourceName ?? "").trim();
  if (!name) return "";

  const type = String(context?.resourceType ?? "").trim();
  const label = type === "room" ? "Seçili oda"
    : type === "table" ? "Seçili masa"
      : type === "product" ? "Seçili ürün"
        : "Sayfa bağlamı";
  const imageUrl = String(context?.imageUrl ?? "").trim();

  return `
    <div class="ya-widget-context-card" data-ya-context-card>
      ${imageUrl ? `<img src="${escapeAttribute(imageUrl)}" alt="" />` : `<span class="ya-widget-context-icon">${iconTemplate(type === "room" ? "bed" : "sparkles")}</span>`}
      <div>
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(name)}</strong>
      </div>
    </div>
  `;
}

function requestContextFieldsTemplate() {
  const context = state.context ?? {};
  return `
    <input type="hidden" name="context_resource_type" value="${escapeAttribute(String(context.resourceType ?? ""))}" />
    <input type="hidden" name="context_resource_id" value="${escapeAttribute(String(context.resourceId ?? ""))}" />
    <input type="hidden" name="context_resource_name" value="${escapeAttribute(String(context.resourceName ?? ""))}" />
    <input type="hidden" name="context_source_path" value="${escapeAttribute(String(context.sourcePath ?? ""))}" />
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
  root.querySelector("[data-ya-open]")?.addEventListener("click", () => open());
  root.querySelector("[data-ya-close]")?.addEventListener("click", close);

  root.querySelectorAll<HTMLElement>("[data-ya-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.yaView as WidgetView;
      state = {
        ...state,
        isOpen: true,
        view: nextView,
        status: "",
        aiLoading: false,
        context: nextView === "home" ? null : state.context,
        questionDraft: nextView === "home" ? "" : state.questionDraft
      };
      render();
      focusWidgetElement(".ya-widget-view-title");
    });
  });

  root.querySelectorAll<HTMLElement>("[data-ya-request-type]").forEach((button) => {
    button.addEventListener("click", () => {
      const requestType = button.dataset.yaRequestType as RequestType;
      if (!isRequestTypeEnabled(requestType)) {
        setStatus("Bu işlem işletmenin etkin web seçeneklerinde kullanılamıyor.");
        return;
      }
      state = {
        ...state,
        view: "form",
        requestType,
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
  bindDirectionsControls(root);

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
  root.querySelectorAll<HTMLButtonElement>("[data-ya-open-date-picker]").forEach((button) => {
    button.addEventListener("click", () => openTurkishDatePicker(root, String(button.dataset.yaOpenDatePicker ?? "")));
  });

  root.querySelectorAll<HTMLButtonElement>("[data-ya-date-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      updateRestaurantDateControls(root, button.dataset.yaDatePreset as DatePreset, String(button.dataset.yaDateValue ?? ""));
      closeTurkishDatePicker(root);
    });
  });

  const calendar = root.querySelector<HTMLElement>("[data-ya-calendar]");
  calendar?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!button || button.disabled) return;

    if (button.dataset.yaCalendarShortcut) {
      applyCalendarShortcut(root, String(button.dataset.yaCalendarShortcut), calendar);
      return;
    }

    if (button.dataset.yaCalendarShift) {
      const amount = Number(button.dataset.yaCalendarShift);
      const current = parseLocalIsoDate(String(calendar.dataset.yaCalendarMonth ?? ""));
      if (!current || !Number.isFinite(amount)) return;
      calendar.dataset.yaCalendarMonth = toLocalIsoDate(new Date(current.getFullYear(), current.getMonth() + amount, 1));
      renderTurkishCalendar(root);
      return;
    }

    const dateValue = String(button.dataset.yaCalendarDay ?? "");
    const input = root.querySelector<HTMLInputElement>(`input[name="${String(calendar.dataset.yaCalendarTarget ?? "")}"]`);
    if (!dateValue || !input) return;
    input.value = dateValue;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    closeTurkishDatePicker(root);
  });

  const startDate = root.querySelector<HTMLInputElement>('input[name="start_date"]');
  const endDate = root.querySelector<HTMLInputElement>('input[name="end_date"]');
  startDate?.addEventListener("change", () => {
    if (root.querySelector("[data-ya-accommodation-dates]")) updateAccommodationDateControls(root);
    else updateRestaurantDateControls(root, "custom", startDate.value);
  });
  endDate?.addEventListener("change", () => updateAccommodationDateControls(root));
}

function openTurkishDatePicker(root: HTMLElement, inputName: string) {
  const calendar = root.querySelector<HTMLElement>("[data-ya-calendar]");
  const input = root.querySelector<HTMLInputElement>(`input[name="${inputName}"]`);
  if (!calendar || !input) return;
  const preferred = parseLocalIsoDate(input.value) ?? parseLocalIsoDate(input.min) ?? new Date();
  calendar.dataset.yaCalendarTarget = inputName;
  calendar.dataset.yaCalendarMonth = toLocalIsoDate(new Date(preferred.getFullYear(), preferred.getMonth(), 1));
  calendar.hidden = false;
  renderTurkishCalendar(root);
}

function closeTurkishDatePicker(root: HTMLElement) {
  const calendar = root.querySelector<HTMLElement>("[data-ya-calendar]");
  if (calendar) calendar.hidden = true;
}

function renderTurkishCalendar(root: HTMLElement) {
  const calendar = root.querySelector<HTMLElement>("[data-ya-calendar]");
  if (!calendar) return;
  const target = String(calendar.dataset.yaCalendarTarget ?? "");
  const input = root.querySelector<HTMLInputElement>(`input[name="${target}"]`);
  const monthDate = parseLocalIsoDate(String(calendar.dataset.yaCalendarMonth ?? ""));
  if (!input || !monthDate) return;

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const leading = (monthStart.getDay() + 6) % 7;
  const minValue = input.min || toLocalIsoDate(new Date());
  const selectedValue = input.value;
  const todayValue = toLocalIsoDate(new Date());
  const startValue = root.querySelector<HTMLInputElement>('input[name="start_date"]')?.value ?? "";
  const endValue = root.querySelector<HTMLInputElement>('input[name="end_date"]')?.value ?? "";
  const isAccommodation = Boolean(root.querySelector("[data-ya-accommodation-dates]"));
  const cells: string[] = [];

  for (let i = 0; i < leading; i += 1) cells.push('<span class="ya-widget-calendar-empty" aria-hidden="true"></span>');
  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const value = toLocalIsoDate(new Date(year, month, day));
    const disabled = value < minValue;
    const inRange = Boolean(isAccommodation && startValue && endValue && value > startValue && value < endValue);
    const rangeEdge = Boolean(isAccommodation && (value === startValue || value === endValue));
    const classes = [
      value === selectedValue ? "is-selected" : "",
      value === todayValue ? "is-today" : "",
      inRange ? "is-in-range" : "",
      rangeEdge ? "is-range-edge" : ""
    ].filter(Boolean).join(" ");
    cells.push(`<button type="button" data-ya-calendar-day="${value}" class="${classes}" ${disabled ? "disabled" : ""} aria-label="${escapeAttribute(formatTurkishCalendarDate(value))}">${day}</button>`);
  }

  const shortcuts = isAccommodation
    ? [["clear", "Temizle"], ["today", "Bugün"], ["tomorrow", "Yarın"], ["night1", "1 gece"], ["night2", "2 gece"]]
    : [["clear", "Temizle"], ["today", "Bugün"], ["tomorrow", "Yarın"], ["weekend", "Hafta sonu"]];

  const previousMonthEnd = toLocalIsoDate(new Date(year, month, 0));
  calendar.innerHTML = `
    <div class="ya-widget-calendar-head">
      <button type="button" data-ya-calendar-shift="-1" aria-label="Önceki ay" ${previousMonthEnd < minValue ? "disabled" : ""}>${iconTemplate("chevron-left")}</button>
      <strong class="ya-widget-calendar-title">${escapeHtml(formatTurkishMonth(monthDate))}</strong>
      <button type="button" data-ya-calendar-shift="1" aria-label="Sonraki ay">${iconTemplate("chevron-right")}</button>
    </div>
    <div class="ya-widget-calendar-shortcuts">
      ${shortcuts.map(([key, label]) => `<button type="button" data-ya-calendar-shortcut="${key}">${label}</button>`).join("")}
    </div>
    <div class="ya-widget-calendar-weekdays" aria-hidden="true"><span>Pzt</span><span>Sal</span><span>Çar</span><span>Per</span><span>Cum</span><span>Cmt</span><span>Paz</span></div>
    <div class="ya-widget-calendar-days">${cells.join("")}</div>
  `;
}

function applyCalendarShortcut(root: HTMLElement, shortcut: string, calendar: HTMLElement) {
  const target = String(calendar.dataset.yaCalendarTarget ?? "");
  const input = root.querySelector<HTMLInputElement>(`input[name="${target}"]`);
  if (!input) return;
  const isAccommodation = Boolean(root.querySelector("[data-ya-accommodation-dates]"));
  const today = new Date();

  if (shortcut === "clear") {
    clearCalendarSelection(root, target);
    closeTurkishDatePicker(root);
    return;
  }

  if (shortcut === "night1" || shortcut === "night2") {
    const nights = shortcut === "night2" ? 2 : 1;
    const startInput = root.querySelector<HTMLInputElement>('input[name="start_date"]');
    const endInput = root.querySelector<HTMLInputElement>('input[name="end_date"]');
    if (!isAccommodation || !startInput || !endInput) return;
    const start = parseLocalIsoDate(startInput.value) ?? today;
    startInput.value = toLocalIsoDate(start);
    endInput.value = toLocalIsoDate(addLocalDays(start, nights));
    startInput.dispatchEvent(new Event("change", { bubbles: true }));
    endInput.dispatchEvent(new Event("change", { bubbles: true }));
    closeTurkishDatePicker(root);
    return;
  }

  const chosen = shortcut === "tomorrow"
    ? addLocalDays(today, 1)
    : shortcut === "weekend"
      ? nextWeekendDate(today)
      : today;
  const value = toLocalIsoDate(chosen);
  if (input.min && value < input.min) return;
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  closeTurkishDatePicker(root);
}

function clearCalendarSelection(root: HTMLElement, target: string) {
  const input = root.querySelector<HTMLInputElement>(`input[name="${target}"]`);
  if (input) input.value = "";

  if (root.querySelector("[data-ya-accommodation-dates]")) {
    const start = root.querySelector<HTMLInputElement>('input[name="start_date"]');
    const end = root.querySelector<HTMLInputElement>('input[name="end_date"]');
    if (target === "start_date" && start && end) {
      start.value = "";
      end.value = "";
      end.min = toLocalIsoDate(addLocalDays(new Date(), 1));
    }
    updateAccommodationDateControls(root);
    return;
  }

  const dateText = root.querySelector<HTMLInputElement>('input[name="date_text"]');
  const label = root.querySelector<HTMLElement>("[data-ya-custom-date-label]");
  const selectedDate = root.querySelector<HTMLElement>("[data-ya-selected-date]");
  if (dateText) dateText.value = "";
  if (label) label.textContent = "Tarih seç";
  if (selectedDate) selectedDate.textContent = "Tarih ve saat seçiminizi yapın.";
  root.querySelectorAll<HTMLButtonElement>("[data-ya-date-preset]").forEach((button) => {
    button.classList.remove("is-active");
    button.setAttribute("aria-pressed", "false");
  });
}

function updateAccommodationDateControls(root: HTMLElement) {
  const startInput = root.querySelector<HTMLInputElement>('input[name="start_date"]');
  const endInput = root.querySelector<HTMLInputElement>('input[name="end_date"]');
  const dateTextInput = root.querySelector<HTMLInputElement>('input[name="date_text"]');
  const selectedDate = root.querySelector<HTMLElement>("[data-ya-selected-date]");
  if (!startInput || !endInput || !dateTextInput) return;
  if (startInput.value) {
    const parsedStart = parseLocalIsoDate(startInput.value);
    if (parsedStart) {
      endInput.min = toLocalIsoDate(addLocalDays(parsedStart, 1));
      if (endInput.value && endInput.value <= startInput.value) endInput.value = "";
    }
  }
  const startLabel = root.querySelector<HTMLElement>('[data-ya-date-label="start_date"]');
  const endLabel = root.querySelector<HTMLElement>('[data-ya-date-label="end_date"]');
  if (startLabel) startLabel.textContent = startInput.value ? formatTurkishCalendarDate(startInput.value) : "Giriş tarihi";
  if (endLabel) endLabel.textContent = endInput.value ? formatTurkishCalendarDate(endInput.value) : "Çıkış tarihi";
  if (startInput.value && endInput.value) {
    const dateText = `${formatTurkishCalendarDate(startInput.value)} – ${formatTurkishCalendarDate(endInput.value)}`;
    dateTextInput.value = dateText;
    if (selectedDate) selectedDate.textContent = `Konaklama: ${dateText}`;
    return;
  }
  dateTextInput.value = "";
  if (selectedDate) selectedDate.textContent = "Giriş ve çıkış tarihlerini seçin.";
}

function updateRestaurantDateControls(root: HTMLElement, preset: DatePreset, dateValue: string) {
  const dateInput = root.querySelector<HTMLInputElement>('input[name="start_date"]');
  const dateTextInput = root.querySelector<HTMLInputElement>('input[name="date_text"]');
  const customControl = root.querySelector<HTMLElement>("[data-ya-open-date-picker]");
  const customLabel = root.querySelector<HTMLElement>("[data-ya-custom-date-label]");
  const selectedDate = root.querySelector<HTMLElement>("[data-ya-selected-date]");
  if (!dateInput || !dateTextInput || !dateValue) return;
  const dateText = formatDateForRequest(dateValue, preset);
  dateInput.value = dateValue;
  dateTextInput.value = dateText;
  root.querySelectorAll<HTMLButtonElement>("[data-ya-date-preset]").forEach((button) => {
    const active = button.dataset.yaDatePreset === preset;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  customControl?.classList.toggle("is-active", preset === "custom");
  if (customLabel) customLabel.textContent = preset === "custom" ? formatTurkishCalendarDate(dateValue) : "Tarih seç";
  if (selectedDate) selectedDate.textContent = `Seçilen tarih: ${dateText}`;
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
    setStatus("");
  });
}

function bindDirectionsControls(root: HTMLElement) {
  root.querySelector<HTMLButtonElement>("[data-ya-directions-question]")?.addEventListener("click", () => {
    const address = String(state.context?.address || config.address || "").trim();
    state = {
      ...state,
      view: "info",
      questionDraft: state.context?.question?.trim() || (address ? `${address} adresine nasıl gelebilirim?` : "İşletmenize nasıl gelebilirim?"),
      status: ""
    };
    render();
    focusWidgetElement(".ya-widget-ai textarea");
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
  if (!isRequestTypeEnabled(state.requestType)) {
    setStatus("Bu işlem işletmenin etkin web seçeneklerinde kullanılamıyor.");
    return;
  }
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
    start_date: String(formData.get("start_date") ?? "").trim(),
    end_date: String(formData.get("end_date") ?? "").trim(),
    time: String(formData.get("time") ?? "").trim(),
    guest_count: Number(formData.get("guest_count") ?? 1),
    message: contextualRequestMessage(
      String(formData.get("message") ?? "").trim(),
      String(formData.get("context_resource_type") ?? "").trim(),
      String(formData.get("context_resource_name") ?? "").trim()
    ),
    source: "web_form",
    whatsapp_message: "",
    context: {
      resourceType: String(formData.get("context_resource_type") ?? "").trim(),
      resourceId: String(formData.get("context_resource_id") ?? "").trim(),
      resourceName: String(formData.get("context_resource_name") ?? "").trim(),
      sourcePath: String(formData.get("context_source_path") ?? "").trim()
    }
  };

  const scheduleError = validateRequestSchedule(payload);
  if (!payload.customer_name || scheduleError || !Number.isFinite(payload.guest_count) || payload.guest_count < 1) {
    setStatus(scheduleError || "Lütfen gerekli alanları kontrol edin.");
    return;
  }

  payload.whatsapp_message = buildWhatsAppMessage(payload);
  void saveRequest(payload);
  window.open(createWhatsAppLink(config.whatsappPhone, payload.whatsapp_message), "_blank", "noopener,noreferrer");
  setStatus("WhatsApp mesajı hazırlandı. Bilgileri kontrol edip gönder tuşuna basın.");
}

function contextualRequestMessage(note: string, resourceType: string, resourceName: string): string {
  if (!resourceName) return note;
  const label = resourceType === "room" ? "İlgili oda" : resourceType === "table" ? "İlgili masa" : resourceType === "product" ? "İlgili ürün" : "İlgili kayıt";
  return [`${label}: ${resourceName}`, note].filter(Boolean).join("\n");
}

function validateRequestSchedule(payload: RequestPayload): string {
  if (payload.request_type === "pension_reservation") {
    if (!payload.start_date || !payload.end_date) {
      return "Lütfen giriş ve çıkış tarihlerini seçin.";
    }
    if (payload.end_date <= payload.start_date) {
      return "Çıkış tarihi giriş tarihinden sonra olmalı.";
    }
    return "";
  }

  if (payload.request_type === "restaurant_reservation") {
    if (!payload.start_date) return "Lütfen rezervasyon tarihini seçin.";
    if (!payload.time) return "Lütfen rezervasyon saatini seçin.";
  }
  return "";
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
  if (!config.aiEnabled) {
    state = { ...state, view: "home", status: "", aiLoading: false, aiAnswer: "" };
    render();
    return;
  }
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

  state = { ...state, questionDraft: message, status: "", aiLoading: true };
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
  setStatus("");
}

function setStatus(message: string) {
  state.status = message;
  const notice = document.querySelector<HTMLElement>(`#${ROOT_ID} [data-ya-status]`);
  const text = notice?.querySelector<HTMLElement>("[data-ya-status-text]");
  if (!notice || !text) return;
  text.textContent = message;
  notice.hidden = !message;
}

function formatAiError(error?: AiErrorDetail | null, fallbackMessage = ""): string {
  const message = String(error?.message || fallbackMessage || "AI yanıtı alınamadı.").trim();
  const code = String(error?.code || "unknown_ai_error").trim();
  const providerStatus = Number(error?.provider_status || 0);
  const statusText = providerStatus > 0 ? ` (HTTP ${providerStatus})` : "";
  const retryText = error?.retryable === true ? " Biraz sonra yeniden deneyebilirsiniz." : "";

  return `${message} Hata kodu: ${code}${statusText}.${retryText}`;
}

function getAssistantSubtitle() {
  const surfaces = currentPublicSurfaces();
  if (surfaces.has("accommodation") && surfaces.has("food_service")) {
    return "Rezervasyon, masa ve bilgi taleplerinizi hızlıca hazırlayayım.";
  }
  if (surfaces.has("accommodation")) {
    return "Oda, rezervasyon ve konaklama sorularınızda yardımcı olayım.";
  }
  if (surfaces.has("food_service")) {
    return "Masa, menü ve restoran sorularınızda yardımcı olayım.";
  }
  if (surfaces.has("catalog")) {
    return "Ürün, stok ve işletme bilgileri için yardımcı olayım.";
  }
  return "İşletme hakkında bilgi ve iletişim taleplerinizde yardımcı olayım.";
}

function getAssistantTitle() {
  const businessName = config.businessName.trim() || "Yardımcı";
  const shortName = businessName
    .replace(/\s+(?:Pansiyon|Otel|Butik Otel|Restoran|Kafe)(?:\s*(?:&|\/)\s*(?:Pansiyon|Otel|Restoran|Kafe))*\s*$/i, "")
    .trim();
  const baseName = shortName && shortName.toLocaleLowerCase("tr-TR") !== "yardımcı asistan" ? shortName : "Yardımcı";
  return `${baseName} ${config.aiEnabled ? "AI Asistanı" : "Yardımcısı"}`;
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
      bottom: var(--ya-widget-bottom, 18px);
      z-index: 2147483000;
      color: #172033;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.4;
      transition: bottom 180ms ease;
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

    .ya-widget-button:active { transform: translateY(0) scale(.98); }

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
      transform-origin: right bottom;
    }

    .ya-widget-panel.is-opening {
      animation: ya-widget-panel-in 210ms cubic-bezier(.2,.8,.2,1) both;
    }

    .ya-widget-panel.is-closing {
      animation: ya-widget-panel-out 150ms ease-in both;
      pointer-events: none;
    }

    @keyframes ya-widget-panel-in {
      from { opacity: 0; transform: translateY(14px) scale(.975); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes ya-widget-panel-out {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(10px) scale(.985); }
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

    .ya-widget-notice {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 9px 13px;
      border-bottom: 1px solid rgba(185, 112, 25, 0.18);
      color: #6c4719;
      background: #fff4df;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.4;
      animation: ya-widget-notice-in 150ms ease-out both;
    }

    .ya-widget-notice-icon {
      display: grid;
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 7px;
      color: #8b5b1c;
      background: rgba(255,255,255,.72);
    }

    .ya-widget-notice-icon .ya-widget-icon { width: 13px !important; height: 13px !important; }

    @keyframes ya-widget-notice-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
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
      animation: ya-widget-view-in 170ms ease-out both;
    }

    @keyframes ya-widget-view-in {
      from { opacity: 0; transform: translateX(7px); }
      to { opacity: 1; transform: translateX(0); }
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
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .ya-widget-action-card {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) 16px;
      align-items: center;
      gap: 8px;
      min-width: 0;
      min-height: 72px;
      padding: 10px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 15px;
      color: #24313a;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 5px 16px rgba(23, 32, 51, 0.04);
      text-align: left;
      cursor: pointer;
      transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
    }

    .ya-widget-action-card:hover {
      transform: translateY(-2px);
      border-color: rgba(47, 111, 94, 0.36);
      box-shadow: 0 8px 20px rgba(23, 32, 51, 0.07);
    }

    .ya-widget-action-card:active { transform: translateY(0) scale(.985); }

    .ya-widget-action-icon {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      border-radius: 11px;
      color: ${widgetConfig.primaryColor};
      background: #edf6ec;
    }

    .ya-widget-action-copy { display: grid; min-width: 0; gap: 2px; }
    .ya-widget-action-copy strong { color: #172033; font-size: 11px; font-weight: 850; }

    .ya-widget-action-copy small {
      display: -webkit-box;
      overflow: hidden;
      color: #6d737c;
      font-size: 9px;
      font-weight: 600;
      line-height: 1.3;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .ya-widget-action-arrow { display: grid; place-items: center; color: #8b918f; }
    .ya-widget-action-arrow .ya-widget-icon { width: 14px !important; height: 14px !important; }

    .ya-widget-suggestions button,
    .ya-widget-topic-chips button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 40px;
      padding: 8px 11px;
      border: 1px solid #ddd9d0;
      border-radius: 999px;
      color: #24313a;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 5px 16px rgba(23, 32, 51, 0.04);
      font-size: 11px;
      font-weight: 750;
      cursor: pointer;
      transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
    }

    .ya-widget-suggestions button:hover,
    .ya-widget-topic-chips button:hover {
      transform: translateY(-1px);
      border-color: rgba(47, 111, 94, 0.42);
    }

    .ya-widget-context-card,
    .ya-widget-location-card {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 10px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 14px;
      background: #f7faf5;
    }

    .ya-widget-context-card img,
    .ya-widget-context-icon {
      width: 48px;
      height: 42px;
      flex: 0 0 auto;
      border-radius: 10px;
      object-fit: cover;
    }

    .ya-widget-context-icon,
    .ya-widget-location-card > span {
      display: grid;
      place-items: center;
      color: ${widgetConfig.primaryColor};
      background: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.14);
    }

    .ya-widget-context-card > div,
    .ya-widget-location-card > div { display: grid; min-width: 0; gap: 2px; }

    .ya-widget-context-card small {
      color: ${widgetConfig.primaryColor};
      font-size: 9px;
      font-weight: 850;
      text-transform: uppercase;
    }

    .ya-widget-context-card strong,
    .ya-widget-location-card strong {
      overflow: hidden;
      color: #172033;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ya-widget-location-card > span {
      width: 38px;
      height: 38px;
      flex: 0 0 auto;
      border-radius: 12px;
    }

    .ya-widget-location-card p { margin: 0; color: #626875; font-size: 11px; line-height: 1.4; }
    .ya-widget-directions .ya-widget-primary-action { text-decoration: none; }

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
      position: relative;
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

    .ya-widget-date-custom .ya-widget-icon,
    .ya-widget-date-picker .ya-widget-icon {
      width: 14px !important;
      height: 14px !important;
    }

    .ya-widget-date-range {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .ya-widget-date-picker {
      position: relative;
      display: grid;
      gap: 5px;
      min-width: 0;
    }

    .ya-widget-date-picker > span,
    .ya-widget-time-field > span {
      color: #5f6872;
      font-size: 10px;
      font-weight: 800;
    }

    .ya-widget-date-picker > button {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      min-height: 44px;
      padding: 9px 10px;
      border: 1px solid #dcd7cf;
      border-radius: 11px;
      color: #334048;
      background: rgba(255, 255, 255, 0.94);
      cursor: pointer;
      text-align: left;
    }

    .ya-widget-date-picker > button strong {
      min-width: 0;
      overflow: hidden;
      font-size: 11px;
      font-weight: 800;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ya-widget-calendar {
      position: absolute;
      top: 69px;
      right: 10px;
      left: 10px;
      z-index: 24;
      display: grid;
      gap: 8px;
      padding: 11px;
      border: 1px solid rgba(47, 111, 94, 0.2);
      border-radius: 14px;
      background: #fffdf8;
      box-shadow: 0 18px 44px rgba(23, 32, 51, 0.2);
    }

    .ya-widget-calendar[hidden] { display: none; }

    .ya-widget-calendar-head {
      display: grid;
      grid-template-columns: 34px 1fr 34px;
      align-items: center;
      gap: 6px;
    }

    .ya-widget-calendar-head > button {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      padding: 0;
      border: 1px solid #e1ddd5;
      border-radius: 10px;
      color: #334048;
      background: #ffffff;
      cursor: pointer;
    }

    .ya-widget-calendar-head > button:disabled { cursor: not-allowed; opacity: .35; }
    .ya-widget-calendar-title { color: #172033; font-size: 12px; font-weight: 850; text-align: center; }

    .ya-widget-calendar-shortcuts {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .ya-widget-calendar-shortcuts button {
      min-height: 28px;
      padding: 5px 8px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 999px;
      color: #52605c;
      background: #f5faf4;
      font-size: 9px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease;
    }

    .ya-widget-calendar-shortcuts button:first-child { color: #7a6557; background: #fff8ef; }
    .ya-widget-calendar-shortcuts button:hover { transform: translateY(-1px); border-color: rgba(47, 111, 94, 0.34); }

    .ya-widget-calendar-weekdays,
    .ya-widget-calendar-days {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
    }

    .ya-widget-calendar-weekdays span {
      color: #7a8089;
      font-size: 9px;
      font-weight: 800;
      text-align: center;
    }

    .ya-widget-calendar-days button,
    .ya-widget-calendar-empty { aspect-ratio: 1; min-width: 0; }

    .ya-widget-calendar-days button {
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 9px;
      color: #334048;
      background: transparent;
      font-size: 10px;
      font-weight: 800;
      cursor: pointer;
    }

    .ya-widget-calendar-days button:hover:not(:disabled) { border-color: rgba(47, 111, 94, 0.28); background: #f1f7f0; }
    .ya-widget-calendar-days button.is-today { border-color: rgba(47, 111, 94, 0.3); }
    .ya-widget-calendar-days button.is-in-range { border-radius: 7px; background: rgba(47, 111, 94, 0.10); }

    .ya-widget-calendar-days button.is-range-edge,
    .ya-widget-calendar-days button.is-selected {
      color: #ffffff;
      border-color: transparent;
      background: ${widgetConfig.primaryColor};
    }

    .ya-widget-calendar-days button:disabled { color: #c4c5c7; cursor: not-allowed; }

    .ya-widget-time-field {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 9px;
      margin-top: 9px;
    }

    .ya-widget-time-field input {
      min-height: 42px;
      padding: 8px 10px;
      border: 1px solid #dcd7cf;
      border-radius: 10px;
      color: #334048;
      background: rgba(255, 255, 255, 0.94);
      font-size: 12px;
      font-weight: 700;
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

    .ya-widget-primary-action,
    .ya-widget-secondary-action {
      transition: transform 140ms ease, filter 140ms ease, opacity 140ms ease;
    }

    .ya-widget-primary-action:active:not(:disabled),
    .ya-widget-secondary-action:active:not(:disabled) { transform: scale(.985); }

    .ya-widget-primary-action.is-loading { cursor: wait; }

    .ya-widget-spinner {
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: ya-widget-spin 700ms linear infinite;
    }

    @keyframes ya-widget-spin { to { transform: rotate(360deg); } }

    .ya-widget-ai-answer,
    .ya-widget-request-success { animation: ya-widget-result-in 190ms ease-out both; }

    @keyframes ya-widget-result-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
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

      .ya-widget-date-options,
      .ya-widget-date-range {
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
      .ya-widget-action-card,
      .ya-widget-suggestions button,
      .ya-widget-topic-chips button,
      .ya-widget-primary-action,
      .ya-widget-secondary-action {
        transition: none;
      }

      .ya-widget-panel.is-opening,
      .ya-widget-panel.is-closing,
      .ya-widget-home,
      .ya-widget-subview,
      .ya-widget-notice,
      .ya-widget-ai-answer,
      .ya-widget-request-success,
      .ya-widget-spinner {
        animation: none;
      }
    }
  `;
}

const iconPaths = {
  sparkles: '<path d="m12 3-1.4 3.5L7 8l3.6 1.4L12 13l1.4-3.6L17 8l-3.6-1.5L12 3Z"/><path d="m5 15-.8 2-2.2.8 2.2.9L5 21l.8-2.3 2.2-.9-2.2-.8L5 15Z"/>',
  bot: '<rect x="5" y="7" width="14" height="11" rx="4"/><path d="M12 4v3M9 12h.01M15 12h.01M9 15h6"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 9h16M8 13h.01M12 13h.01M16 13h.01"/>',
  table: '<path d="M4 10h16M6 10l-1 10M18 10l1 10M8 6h8a2 2 0 0 1 2 2v2H6V8a2 2 0 0 1 2-2Z"/>',
  bed: '<path d="M3 18v-7M21 18v-5a2 2 0 0 0-2-2H9a3 3 0 0 0-3 3v1M3 15h18M7 11V8h5a2 2 0 0 1 2 2v1"/>',
  pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-.9.8-.9 1.6M12 17h.01"/>',
  whatsapp: '<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8.7c.5 2.5 2 4 4.5 4.8l1-1"/>',
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
  const scriptConfig = removeEmptyValues({
    businessName: dataset.businessName,
    whatsappPhone: dataset.whatsappPhone,
    apiBaseUrl: dataset.apiBaseUrl,
    logoUrl: dataset.logoUrl,
    primaryColor: dataset.primaryColor,
    accentColor: dataset.accentColor,
    address: dataset.address,
    mapUrl: dataset.mapUrl
  });
  const profileId = normalizeBusinessProfileId(dataset.profileId);
  if (profileId) {
    scriptConfig.profileId = profileId;
  }
  if (dataset.aiEnabled === "true" || dataset.aiEnabled === "false") {
    scriptConfig.aiEnabled = dataset.aiEnabled === "true";
  }
  return scriptConfig;
}

function removeEmptyValues(values: Partial<WidgetConfig>): Partial<WidgetConfig> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === "string" && value.length > 0)) as Partial<WidgetConfig>;
}

function normalizeBusinessProfileId(value: unknown): BusinessProfileId | "" {
  const profileId = String(value ?? "").trim();
  return ["pension_restaurant", "pension", "restaurant", "cafe", "market"].includes(profileId)
    ? profileId as BusinessProfileId
    : "";
}

function normalizePublicSurfaces(value: unknown): PublicSurface[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<PublicSurface>(["accommodation", "food_service", "menu", "catalog", "directions"]);
  return [...new Set(
    value
      .map((item) => String(item ?? "").trim() as PublicSurface)
      .filter((item) => allowed.has(item))
  )];
}

function profilePublicSurfaces(profileId: BusinessProfileId | ""): PublicSurface[] {
  if (profileId === "pension_restaurant") return ["accommodation", "food_service", "menu", "directions"];
  if (profileId === "pension") return ["accommodation", "directions"];
  if (profileId === "restaurant" || profileId === "cafe") return ["food_service", "menu", "directions"];
  if (profileId === "market") return ["catalog", "directions"];
  return [];
}

function currentPublicSurfaces(): ReadonlySet<PublicSurface> {
  const configured = normalizePublicSurfaces(config.publicSurfaces);
  return new Set(configured.length > 0 ? configured : profilePublicSurfaces(config.profileId));
}

function isRequestTypeEnabled(requestType: RequestType): boolean {
  const surfaces = currentPublicSurfaces();
  if (requestType === "pension_reservation") return surfaces.has("accommodation");
  if (requestType === "restaurant_reservation") return surfaces.has("food_service");
  return true;
}

function getInfoSuggestions(): string[] {
  const surfaces = currentPublicSurfaces();
  const suggestions: string[] = [];
  if (surfaces.has("accommodation")) {
    suggestions.push("Oda fiyatları", "Oda müsaitliği", "Kahvaltı saatleri");
  }
  if (surfaces.has("food_service")) {
    suggestions.push("Masa var mı?", "Menü hakkında bilgi", "Çocuklar için uygun mu?");
  }
  if (surfaces.has("catalog")) {
    suggestions.push("Ürün stokta mı?", "Ürün fiyatı", "Çalışma saatleri");
  }
  if (surfaces.has("directions")) {
    suggestions.push("Konum ve yol tarifi");
  }
  if (suggestions.length === 0) {
    suggestions.push("Çalışma saatleri", "İletişim", "Konum");
  }
  return [...new Set(suggestions)].slice(0, 6);
}

function getWhatsAppTopics() {
  const surfaces = currentPublicSurfaces();
  const topics: Array<{ key: string; label: string; message: string }> = [];
  if (surfaces.has("accommodation")) {
    topics.push({
      key: "reservation",
      label: "Rezervasyon soracağım",
      message: `Merhaba, ${config.businessName} için oda müsaitliği ve rezervasyon hakkında bilgi almak istiyorum.`
    });
  }
  if (surfaces.has("food_service")) {
    topics.push({
      key: "table",
      label: "Masa soracağım",
      message: `Merhaba, ${config.businessName} için masa müsaitliği hakkında bilgi almak istiyorum.`
    });
  }
  if (surfaces.has("menu")) {
    topics.push({
      key: "menu",
      label: "Menü hakkında soracağım",
      message: `Merhaba, ${config.businessName} menüsü hakkında bilgi almak istiyorum.`
    });
  }
  if (surfaces.has("catalog")) {
    topics.push({
      key: "product",
      label: "Ürün / stok soracağım",
      message: `Merhaba, ${config.businessName} için ürün ve stok bilgisi almak istiyorum.`
    });
  }
  topics.push({ key: "custom", label: "Kendi mesajımı yazacağım", message: "" });
  return topics;
}

async function hydrateBusinessContext(loadId: number) {
  const apiBaseUrl = config.apiBaseUrl.trim().replace(/\/$/, "");
  if (!apiBaseUrl) return;

  try {
    const response = await fetch(`${apiBaseUrl}/api/business.php`, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    const result = (await response.json().catch(() => null)) as PublicBusinessApiResponse | null;
    if (loadId !== businessContextLoadId || !response.ok || result?.ok !== true || !result.business) return;

    const business = result.business;
    const profileId = normalizeBusinessProfileId(business.profile_id);
    const publicSurfaces = normalizePublicSurfaces(business.public_surfaces);
    config = {
      ...config,
      businessName: String(business.display_name ?? "").trim() || config.businessName,
      whatsappPhone: String(business.whatsapp ?? "").trim() || config.whatsappPhone,
      primaryColor: String(business.primary_color ?? "").trim() || config.primaryColor,
      accentColor: String(business.accent_color ?? "").trim() || config.accentColor,
      address: String(business.address ?? "").trim() || config.address,
      mapUrl: String(business.map_url ?? "").trim() || config.mapUrl,
      aiEnabled: typeof business.ai_enabled === "boolean" ? business.ai_enabled : config.aiEnabled,
      profileId: profileId || config.profileId,
      publicSurfaces: publicSurfaces.length > 0 ? publicSurfaces : config.publicSurfaces
    };

    if ((state.view === "form" && !isRequestTypeEnabled(state.requestType)) || (state.view === "info" && !config.aiEnabled)) {
      state = { ...state, view: "home", status: "", aiLoading: false, aiAnswer: "", questionDraft: "" };
    }
    injectStyles(config);
    render();
  } catch {
    // Script configuration remains the offline/failure fallback.
  }
}

function resolveOpenOptions(options: WidgetOpenOptions): Partial<WidgetState> {
  const intent = options.intent ?? "home";
  const context = normalizeWidgetContext(options.context);
  if (intent === "accommodation.reserve") return { view: "form", requestType: "pension_reservation", context, questionDraft: "" };
  if (intent === "food.reserve") return { view: "form", requestType: "restaurant_reservation", context, questionDraft: "" };
  if (intent === "directions") return { view: "directions", context, questionDraft: context?.question ?? "" };
  if (intent === "accommodation.info" || intent === "info") {
    if (!config.aiEnabled) return { view: "home", context: null, questionDraft: "" };
    const name = String(context?.resourceName ?? "").trim();
    const question = String(context?.question ?? "").trim() || (name ? `${name} hakkında bilgi almak istiyorum.` : "");
    return { view: "info", context, questionDraft: question };
  }
  return { view: "home", context, questionDraft: "" };
}

function normalizeWidgetContext(value: WidgetContext | undefined): WidgetContext | null {
  if (!value) return null;
  const normalized: WidgetContext = {
    resourceType: String(value.resourceType ?? "").trim(),
    resourceId: String(value.resourceId ?? "").trim(),
    resourceName: String(value.resourceName ?? "").trim(),
    imageUrl: String(value.imageUrl ?? "").trim(),
    sourcePath: String(value.sourcePath ?? "").trim() || window.location.pathname,
    question: String(value.question ?? "").trim(),
    address: String(value.address ?? "").trim(),
    mapUrl: String(value.mapUrl ?? "").trim()
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function ensureExternalActionBinding() {
  if (externalActionBound) return;
  externalActionBound = true;
  document.addEventListener("click", (event) => {
    const trigger = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-ya-action]") : null;
    if (!trigger || trigger.closest(`#${ROOT_ID}`)) return;
    const intent = normalizeWidgetIntent(trigger.dataset.yaAction);
    if (!intent) return;
    event.preventDefault();
    open({
      intent,
      context: {
        resourceType: trigger.dataset.yaResourceType,
        resourceId: trigger.dataset.yaResourceId,
        resourceName: trigger.dataset.yaResourceName,
        imageUrl: trigger.dataset.yaImageUrl,
        sourcePath: trigger.dataset.yaSourcePath || window.location.pathname,
        question: trigger.dataset.yaQuestion,
        address: trigger.dataset.yaAddress,
        mapUrl: trigger.dataset.yaMapUrl
      }
    });
  });
}

function normalizeWidgetIntent(value: unknown): WidgetIntent | null {
  const intent = String(value ?? "").trim();
  return ["home", "accommodation.reserve", "accommodation.info", "food.reserve", "info", "directions"].includes(intent) ? intent as WidgetIntent : null;
}

function buildMapSearchUrl(address: string): string {
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "";
}

function focusWidgetElement(selector: string) {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`#${ROOT_ID} ${selector}`)?.focus();
  });
}

function ensureFooterAvoidance() {
  if (footerAvoidanceBound) {
    return;
  }

  footerAvoidanceBound = true;
  window.addEventListener("scroll", scheduleFooterPositionUpdate, { passive: true });
  window.addEventListener("resize", scheduleFooterPositionUpdate);
}

function scheduleFooterPositionUpdate() {
  if (footerPositionFrame) {
    return;
  }

  footerPositionFrame = window.requestAnimationFrame(() => {
    footerPositionFrame = 0;
    updateFooterSafePosition();
  });
}

function updateFooterSafePosition() {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    return;
  }

  const defaultBottom = 18;
  if (state.isOpen || window.innerWidth <= 520) {
    root.style.setProperty("--ya-widget-bottom", `${defaultBottom}px`);
    return;
  }

  const footer = document.querySelector<HTMLElement>(".site-footer, footer");
  if (!footer) {
    root.style.setProperty("--ya-widget-bottom", `${defaultBottom}px`);
    return;
  }

  const footerBox = footer.getBoundingClientRect();
  const footerIsVisible = footerBox.top > 0 && footerBox.top < window.innerHeight && footerBox.bottom > 0;
  const safeBottom = footerIsVisible
    ? Math.min(window.innerHeight - 76, Math.ceil(window.innerHeight - footerBox.top + 14))
    : defaultBottom;
  root.style.setProperty("--ya-widget-bottom", `${Math.max(defaultBottom, safeBottom)}px`);
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

function formatTurkishMonth(value: Date) {
  return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" })
    .format(value)
    .replace(/^./u, (letter) => letter.toLocaleUpperCase("tr-TR"));
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
