import { dealerApplicationForm, mountDealerApplicationForm } from "./dealer-application-flow";
import { ui, html, locale } from "./site-language";
import { requestMessage } from "./request-message";
import {
  createWhatsAppUrl,
  normalizeInternationalPhone as normalizeBridgeInternationalPhone
} from "@yardimci-asistan/whatsapp-bridge";
import { widgetStyles } from "./widget-styles";
import { mountWidgetNexa, unmountWidgetNexa, updateWidgetNexa, widgetNexa } from "./widget-nexa";
import { iconTemplate, type IconName } from "./widget-icons";
import {
  buildInfoSuggestions,
  buildWhatsAppTopics,
  isRequestTypeAvailable,
  isWhatsAppAvailable,
  normalizeBusinessProfileId,
  normalizePublicSurfaces,
  readScriptConfig as getScriptConfig,
  resolvePublicSurfaces,
  type PublicSurface,
  type WidgetConfig
} from "./widget-config";
import {
  addLocalDays,
  formatDateForRequest,
  formatTurkishCalendarDate,
  formatTurkishMonth,
  parseLocalIsoDate,
  readGuestCount,
  toLocalIsoDate,
  type DatePreset
} from "./widget-date-utils";
import {
  buildMapSearchUrl,
  normalizeWidgetIntent,
  resolveWidgetOpenOptions,
  type WidgetContext,
  type WidgetOpenOptions,
  type WidgetView
} from "./widget-navigation";

type RequestType = "pension_reservation" | "restaurant_reservation" | "general_info" | "dealer_application";
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
    whatsapp_enabled?: boolean;
    requests_enabled?: boolean;
    dealer_application_enabled?: boolean;
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
  whatsappEnabled: true,
  requestsEnabled: true,
  dealerApplicationEnabled: false,
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
let externalActionBound = false;
let closeAnimationTimer = 0;
let panelEntrancePending = false;
let businessContextLoadId = 0;
let nexaLifecycleBound = false;

function nexaCharacter(role: "launcher" | "welcome" | "header") {
  return `<span class="ya-widget-nexa" data-nexa-role="${role}" aria-hidden="true"></span>`;
}

function updateNexaPresentation() {
  const root = document.getElementById(ROOT_ID);
  const active = state.isOpen && !closeAnimationTimer && document.visibilityState === "visible" && document.hasFocus();
  widgetNexa.setActive(active);
  if (!root) return;
  const motion = active && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.dataset.nexaMotionActive = String(motion);
  root.dataset.nexaState = widgetNexa.getState();
  updateWidgetNexa(motion, config.apiBaseUrl);
}

function bindNexaLifecycle() {
  if (nexaLifecycleBound) return;
  nexaLifecycleBound = true;
  widgetNexa.subscribe(updateNexaPresentation);
  document.addEventListener("visibilitychange", updateNexaPresentation);
  window.addEventListener("focus", updateNexaPresentation);
  window.addEventListener("blur", updateNexaPresentation);
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", updateNexaPresentation);
}

export function init(userConfig: Partial<WidgetConfig> = {}) {
  widgetNexa.reset();
  bindNexaLifecycle();
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
  widgetNexa.reset();
  panelEntrancePending = !state.isOpen;
  if (closeAnimationTimer) {
    window.clearTimeout(closeAnimationTimer);
    closeAnimationTimer = 0;
  }
  state = {
    ...state,
    ...resolveWidgetOpenOptions(options, config),
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
    updateNexaPresentation();
    return;
  }
  finalizeClose();
}

function finalizeClose() {
  widgetNexa.reset();
  widgetNexa.setActive(false);
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
  return requestMessage({
    ...payload,
    time_text: payload.time
  }, businessName);
}

export function normalizeInternationalPhone(phone: string): { ok: true; whatsapp: string } | { ok: false; error: string } {
  const result = normalizeBridgeInternationalPhone(phone);
  if (!result.ok) {
    return {
      ok: false,
      error: ui(result.error)
    };
  }

  return {
    ok: true,
    whatsapp: result.whatsapp
  };
}

function render() {
  const root = getOrCreateRoot();
  root.dataset.yaWhatsappEnabled = config.whatsappEnabled ? "1" : "0";
  unmountWidgetNexa();
  root.innerHTML = state.isOpen ? panelTemplate() : buttonTemplate();
  mountWidgetNexa(root, config.apiBaseUrl);
  if (state.isOpen) panelEntrancePending = false;
  bindEvents(root);
  updateNexaPresentation();
}

function buttonTemplate() {
  return `
    <button class="ya-widget-button" type="button" data-ya-open aria-label="${html("Yardımcı Asistan'ı aç")}">
      <span class="ya-widget-launcher-avatar">
        ${nexaCharacter("launcher")}
      </span>
      <span class="ya-widget-launcher-copy">
        <strong>${html("Yardımcı")}</strong>
        <small>${html("Asistan")}</small>
      </span>
    </button>
  `;
}

function panelTemplate() {
  return `
    <section class="ya-widget-panel${panelEntrancePending ? " is-opening" : ""}" role="dialog" aria-labelledby="ya-widget-title">
      <header class="ya-widget-header">
        ${state.view === "home" ? "" : `<div class="ya-widget-nexa-speech-slot" data-ya-nexa-speech-slot hidden><span class="ya-widget-nexa-speech" data-ya-nexa-speech role="status" aria-atomic="true"></span></div>`}
        <div class="ya-widget-identity">
          ${state.view === "home" ? "" : `<span class="ya-widget-avatar">${nexaCharacter("header")}</span>`}
          <span class="ya-widget-title-copy">
            <strong id="ya-widget-title">${state.view === "home" && config.logoUrl ? `<span class="ya-widget-business-mark">${brandMarkTemplate()}</span>` : ""}${escapeHtml(getAssistantTitle())}</strong>
            <small>${escapeHtml(getAssistantSubtitle())}</small>
          </span>
        </div>
        <button class="ya-widget-close" type="button" data-ya-close aria-label="${html("Asistanı kapat")}">
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
    return "";
  }

  return `<img class="ya-widget-mark" src="${escapeAttribute(config.logoUrl)}" alt="" aria-hidden="true" />`;
}

function homeTemplate() {
  const surfaces = currentPublicSurfaces();
  const actions: string[] = [];

  if (config.requestsEnabled && surfaces.has("accommodation")) {
    actions.push(homeActionCard({
      requestType: "pension_reservation",
      icon: "calendar",
      title: ui("Rezervasyon yap"),
      description: ui("Tarih ve kişi bilgilerini iletin")
    }));
  }
  if (config.requestsEnabled && surfaces.has("food_service")) {
    actions.push(homeActionCard({
      requestType: "restaurant_reservation",
      icon: "table",
      title: ui("Masa sor"),
      description: ui("Tarih, saat ve kişi sayısını seçin")
    }));
  }
  if (config.requestsEnabled && config.dealerApplicationEnabled) actions.push(homeActionCard({ requestType: "dealer_application", icon: "send", title: "Bayi Başvurusu", description: "Firma bilgilerinizi iletin" }));
  if (config.aiEnabled && surfaces.has("catalog")) {
    actions.push(homeActionCard({
      view: "info",
      icon: "search",
      title: ui("Ürün / stok sor"),
      description: ui("Ürün ve stok bilgisini hızlıca öğrenin")
    }));
  }

  if (config.aiEnabled) {
    actions.push(homeActionCard({
      view: "info",
      icon: "sparkles",
      title: ui("Asistana sor"),
      description: ui("İşletme hakkında kısa bir soru sorun")
    }));
  }

  if (surfaces.has("directions")) {
    actions.push(homeActionCard({
      view: "directions",
      icon: "pin",
      title: ui("Yol tarifi"),
      description: ui("Konumu açın veya ulaşımı sorun")
    }));
  }

  if (config.whatsappEnabled && config.whatsappPhone.trim()) {
    actions.push(homeActionCard({
      view: "whatsapp",
      icon: "whatsapp",
      title: "WhatsApp",
      description: ui("Hazır bir mesaj oluşturun")
    }));
  }

  return `
    <div class="ya-widget-home">
      <div class="ya-widget-welcome">
        <span class="ya-widget-nexa-welcome">${nexaCharacter("welcome")}</span>
        <div>
          <span class="ya-widget-kicker">${html("İşletme yardımcısı")}</span>
          <h2 class="ya-widget-view-title" tabindex="-1">${html("Merhaba, ben Nexa.")}</h2>
          <p>${html("İşlemi seçin; gerekli alanı doğrudan açayım.")}</p>
        </div>
      </div>
      <div class="ya-widget-actions" role="group" aria-label="${html("Hızlı asistan seçenekleri")}">
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
  if (state.requestType === "dealer_application") return dealerApplicationForm();
  const isTableRequest = state.requestType === "restaurant_reservation";
  const requestLabel = isTableRequest ? ui("Masa talebi") : ui("Rezervasyon talebi");
  const title = isTableRequest ? ui("Masa talebinizi hazırlayalım") : ui("Rezervasyonunuzu hazırlayalım");
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
          <p>${html("Tarih ve iletişim bilgilerinizi ekleyin.")}</p>
        </div>
      </div>
      ${contextCardTemplate()}
      <form class="ya-widget-form" data-ya-form>
        <input type="hidden" name="request_type" value="${state.requestType}" />
        ${requestContextFieldsTemplate()}
        ${scheduleControls}
        <div class="ya-widget-field-grid">
          <label class="ya-widget-field">
            <span>${html("Ad soyad")}</span>
            <input name="customer_name" required autocomplete="name" placeholder="${html("Adınız soyadınız")}" />
          </label>
          <label class="ya-widget-field">
            <span>${html("Telefon")}</span>
            <input name="customer_phone" required inputmode="tel" autocomplete="tel" placeholder="+90 5xx… / +44…" />
          </label>
        </div>
        ${guestStepperTemplate()}
        <label class="ya-widget-field">
          <span>${html("Kısa not")} <small>${html("(isteğe bağlı)")}</small></span>
          <textarea name="message" rows="2" placeholder="${html("Tercihiniz veya eklemek istediğiniz kısa not")}"></textarea>
        </label>
        <button class="ya-widget-primary-action" type="submit">
          ${iconTemplate("send")}
          <span>${html("Talebi Gönder")}</span>
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
      <legend>${html("Konaklama tarihleri")}</legend>
      <div class="ya-widget-date-range">
        ${datePickerControlTemplate("start_date", ui("Giriş"), ui("Giriş tarihi"), todayIso)}
        ${datePickerControlTemplate("end_date", ui("Çıkış"), ui("Çıkış tarihi"), tomorrowIso)}
      </div>
      <input name="date_text" type="hidden" />
      <div class="ya-widget-calendar" data-ya-calendar hidden></div>
    </fieldset>
  `;
}

function restaurantScheduleControlsTemplate() {
  const todayIso = toLocalIsoDate(new Date());

  return `
    <fieldset class="ya-widget-date-group" data-ya-restaurant-date>
      <legend>${html("Tarih ve saat")}</legend>
      <div class="ya-widget-schedule-row">
        ${datePickerControlTemplate("start_date", ui("Tarih"), ui("Tarih seç"), todayIso)}
        ${timePickerControlTemplate()}
      </div>
      <input name="date_text" type="hidden" />
      <div class="ya-widget-calendar" data-ya-calendar hidden></div>
    </fieldset>
  `;
}

function timePickerControlTemplate() {
  return `
    <div class="ya-widget-time-field">
      <span>${html("Saat")}</span>
      <button class="ya-widget-time-trigger" type="button" data-ya-open-time-picker aria-expanded="false">
        ${iconTemplate("clock")}
        <strong data-ya-time-label>${html("Saat seç")}</strong>
        ${iconTemplate("chevron-right")}
      </button>
      <input name="time" type="hidden" />
      <div class="ya-widget-time-popover" data-ya-time-popover hidden></div>
    </div>
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
      <legend>${html("Kişi sayısı")}</legend>
      <div class="ya-widget-stepper">
        <button type="button" data-ya-guest-step="-1" aria-label="${html("Kişi sayısını azalt")}" disabled>${iconTemplate("minus")}</button>
        <input name="guest_count" required type="number" min="1" max="30" value="2" inputmode="numeric" aria-label="${html("Kişi sayısı")}" />
        <button type="button" data-ya-guest-step="1" aria-label="${html("Kişi sayısını artır")}">${iconTemplate("plus")}</button>
      </div>
    </fieldset>
  `;
}

function infoTemplate() {
  const suggestions = getInfoSuggestions();

  return `
    <div class="ya-widget-subview ya-widget-info">
      ${subviewNavigationTemplate(ui("Bilgi al"), "help")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${iconTemplate("bot")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">${html("Merak ettiğiniz şeyi sorun")}</h2>
          <p>${html("Kısa sorunuzu yazın veya sık sorulanlardan birini seçin.")}</p>
        </div>
      </div>
      ${contextCardTemplate()}
      <div class="ya-widget-suggestions" role="group" aria-label="${html("Sık sorulan sorular")}">
        ${suggestions
          .map(
            (suggestion) =>
              `<button type="button" data-ya-question-suggestion="${escapeAttribute(suggestion)}">${escapeHtml(suggestion)}</button>`
          )
          .join("")}
      </div>
      <form class="ya-widget-ai" data-ya-ai-form>
        <label class="ya-widget-field">
          <span>${html("Kısa soru")}</span>
          <textarea name="message" required maxlength="1200" rows="3" placeholder="${html("Örn. Bu akşam 4 kişilik masa var mı?")}">${escapeHtml(
            state.questionDraft
          )}</textarea>
        </label>
        <div class="ya-widget-ai-actions">
          <button class="ya-widget-primary-action ${state.aiLoading ? "is-loading" : ""}" type="submit" ${state.aiLoading ? "disabled" : ""}>
            ${state.aiLoading ? '<span class="ya-widget-spinner" aria-hidden="true"></span>' : iconTemplate("sparkles")}
            <span>${state.aiLoading ? ui("Yanıt hazırlanıyor…") : ui("AI Yardımcıya Sor")}</span>
          </button>
          ${config.whatsappEnabled && config.whatsappPhone.trim()
            ? `<button class="ya-widget-secondary-action" type="button" data-ya-ai-whatsapp>
                ${iconTemplate("whatsapp")}
                <span>${html("WhatsApp'tan Yaz")}</span>
              </button>`
            : ""}
        </div>
      </form>
      ${
        state.aiAnswer
          ? `<div class="ya-widget-ai-answer">
              <p><strong>${html("AI Yardımcı")}</strong><span>${escapeHtml(state.aiAnswer)}</span></p>
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
          <h2 class="ya-widget-view-title" tabindex="-1">${html("Mesajınızı birlikte hazırlayalım")}</h2>
          <p>${html("Konuyu seçin; metni isterseniz göndermeden önce düzenleyin.")}</p>
        </div>
      </div>
      <div class="ya-widget-topic-chips" role="group" aria-label="${html("WhatsApp mesaj konusu")}">
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
          <span>${html("Mesajınız")}</span>
          <textarea name="message" required rows="3" maxlength="1200" placeholder="${html("Kısa mesajınızı yazın")}">${escapeHtml(
            state.whatsappDraft
          )}</textarea>
        </label>
        <div class="ya-widget-message-preview">
          <span>${html("Hazır mesaj")}</span>
          <p data-ya-message-preview>${
            state.whatsappDraft ? escapeHtml(state.whatsappDraft) : ui("Bir konu seçtiğinizde mesajınız burada görünecek.")
          }</p>
        </div>
        <button class="ya-widget-primary-action" type="submit">
          ${iconTemplate("send")}
          <span>${html("WhatsApp'ta Aç")}</span>
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
      ${subviewNavigationTemplate(ui("Yol tarifi"), "pin")}
      <div class="ya-widget-subview-intro">
        <span aria-hidden="true">${iconTemplate("pin")}</span>
        <div>
          <h2 class="ya-widget-view-title" tabindex="-1">${html("Bize nasıl ulaşabilirsiniz?")}</h2>
          <p>${html("Konumu açabilir veya ulaşım hakkında kısa bir soru sorabilirsiniz.")}</p>
        </div>
      </div>
      ${contextCardTemplate()}
      <div class="ya-widget-location-card">
        <span>${iconTemplate("pin")}</span>
        <div>
          <strong>${escapeHtml(config.businessName)}</strong>
          <p>${escapeHtml(address || ui("Adres bilgisi site tarafından iletilmedi."))}</p>
        </div>
      </div>
      <div class="ya-widget-ai-actions">
        ${mapUrl ? `<a class="ya-widget-primary-action" href="${escapeAttribute(mapUrl)}" target="_blank" rel="noopener noreferrer">${iconTemplate("pin")}<span>${html("Haritada Aç")}</span></a>` : ""}
        ${config.aiEnabled ? `<button class="ya-widget-secondary-action" type="button" data-ya-directions-question>
          ${iconTemplate("help")}<span>${html("Yol Tarifi Sor")}</span>
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
  const label = type === "room" ? ui("Seçili oda")
    : type === "table" ? ui("Seçili masa")
      : type === "product" ? ui("Seçili ürün")
        : ui("Sayfa bağlamı");
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
      <button type="button" data-ya-view="home">${iconTemplate("arrow-left")}<span>${html("Geri")}</span></button>
      <span class="ya-widget-active-flow">${iconTemplate(icon)} ${escapeHtml(label)}</span>
    </div>
  `;
}

function bindEvents(root: HTMLElement) {
  mountDealerApplicationForm(root, config.apiBaseUrl);
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
        setStatus(ui("Bu işlem işletmenin etkin web seçeneklerinde kullanılamıyor."));
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
  bindTimeControls(root);
  bindGuestStepper(root);
  bindInfoControls(root);
  bindWhatsAppControls(root);
  bindDirectionsControls(root);

  root.querySelector<HTMLFormElement>("[data-ya-ai-form]")?.addEventListener("submit", (event) => void handleAiSubmit(event));
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

  const calendar = root.querySelector<HTMLElement>("[data-ya-calendar]");
  calendar?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!button || button.disabled) return;

    if (button.dataset.yaCalendarClose === "1") {
      closeTurkishDatePicker(root);
      return;
    }

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
  closeTimePicker(root);
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

  const shortcuts: Array<[string, string, boolean]> = isAccommodation
    ? target === "end_date"
      ? [
          ["clear", ui("Temizle"), !endValue],
          ["day1", ui("1 gün"), !startValue],
          ["day2", ui("2 gün"), !startValue],
          ["day7", ui("7 gün"), !startValue],
          ["day10", ui("10 gün"), !startValue]
        ]
      : [
          ["clear", ui("Temizle"), !startValue],
          ["today", ui("Bugün"), false],
          ["tomorrow", ui("Yarın"), false]
        ]
    : [
        ["clear", ui("Temizle"), !selectedValue],
        ["today", ui("Bugün"), false],
        ["tomorrow", ui("Yarın"), false]
      ];

  const previousMonthEnd = toLocalIsoDate(new Date(year, month, 0));
  calendar.innerHTML = `
    <div class="ya-widget-calendar-head">
      <button type="button" data-ya-calendar-shift="-1" aria-label="${html("Önceki ay")}" ${previousMonthEnd < minValue ? "disabled" : ""}>${iconTemplate("chevron-left")}</button>
      <strong class="ya-widget-calendar-title">${escapeHtml(formatTurkishMonth(monthDate))}</strong>
      <button type="button" data-ya-calendar-shift="1" aria-label="${html("Sonraki ay")}">${iconTemplate("chevron-right")}</button>
      <button class="ya-widget-calendar-close" type="button" data-ya-calendar-close="1" aria-label="${html("Takvimi kapat")}">×</button>
    </div>
    <div class="ya-widget-calendar-shortcuts">
      ${shortcuts.map(([key, label, disabled]) => `<button type="button" data-ya-calendar-shortcut="${key}" ${disabled ? "disabled" : ""}>${label}</button>`).join("")}
    </div>
    <div class="ya-widget-calendar-weekdays" aria-hidden="true"><span>${html("Pzt")}</span><span>${html("Sal")}</span><span>${html("Çar")}</span><span>${html("Per")}</span><span>${html("Cum")}</span><span>${html("Cmt")}</span><span>${html("Paz")}</span></div>
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
    clearDateSelection(root, target);
    closeTurkishDatePicker(root);
    return;
  }

  const dayShortcut = /^day(1|2|7|10)$/.exec(shortcut);
  if (dayShortcut) {
    const days = Number(dayShortcut[1]);
    const startInput = root.querySelector<HTMLInputElement>('input[name="start_date"]');
    const endInput = root.querySelector<HTMLInputElement>('input[name="end_date"]');
    const start = startInput ? parseLocalIsoDate(startInput.value) : null;
    if (!isAccommodation || target !== "end_date" || !startInput || !endInput || !start) return;
    endInput.value = toLocalIsoDate(addLocalDays(start, days));
    endInput.dispatchEvent(new Event("change", { bubbles: true }));
    closeTurkishDatePicker(root);
    return;
  }

  const chosen = shortcut === "tomorrow" ? addLocalDays(today, 1) : today;
  const value = toLocalIsoDate(chosen);
  if (input.min && value < input.min) return;
  input.value = value;
  if (isAccommodation) {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    updateRestaurantDateControls(root, shortcut === "tomorrow" ? "tomorrow" : "today", value);
  }
  closeTurkishDatePicker(root);
}

function clearDateSelection(root: HTMLElement, target: string) {
  const input = root.querySelector<HTMLInputElement>(`input[name="${target}"]`);
  if (!input) return;

  const isAccommodation = Boolean(root.querySelector("[data-ya-accommodation-dates]"));
  input.value = "";

  if (isAccommodation) {
    const startInput = root.querySelector<HTMLInputElement>('input[name="start_date"]');
    const endInput = root.querySelector<HTMLInputElement>('input[name="end_date"]');
    if (target === "start_date" && startInput && endInput) {
      endInput.value = "";
      endInput.min = toLocalIsoDate(addLocalDays(new Date(), 1));
    }
    updateAccommodationDateControls(root);
    return;
  }

  const dateTextInput = root.querySelector<HTMLInputElement>('input[name="date_text"]');
  const label = root.querySelector<HTMLElement>('[data-ya-date-label="start_date"]');
  if (dateTextInput) dateTextInput.value = "";
  if (label) label.textContent = ui("Tarih seç");
  root.querySelector<HTMLElement>("[data-ya-open-date-picker]")?.classList.remove("is-active");
}

function updateAccommodationDateControls(root: HTMLElement) {
  const startInput = root.querySelector<HTMLInputElement>('input[name="start_date"]');
  const endInput = root.querySelector<HTMLInputElement>('input[name="end_date"]');
  const dateTextInput = root.querySelector<HTMLInputElement>('input[name="date_text"]');
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
  if (startLabel) startLabel.textContent = startInput.value ? formatTurkishCalendarDate(startInput.value) : ui("Giriş tarihi");
  if (endLabel) endLabel.textContent = endInput.value ? formatTurkishCalendarDate(endInput.value) : ui("Çıkış tarihi");
  if (startInput.value && endInput.value) {
    const dateText = `${formatTurkishCalendarDate(startInput.value)} – ${formatTurkishCalendarDate(endInput.value)}`;
    dateTextInput.value = dateText;
    return;
  }
  dateTextInput.value = "";
}

function updateRestaurantDateControls(root: HTMLElement, preset: DatePreset, dateValue: string) {
  const dateInput = root.querySelector<HTMLInputElement>('input[name="start_date"]');
  const dateTextInput = root.querySelector<HTMLInputElement>('input[name="date_text"]');
  const customControl = root.querySelector<HTMLElement>("[data-ya-open-date-picker]");
  const customLabel = root.querySelector<HTMLElement>('[data-ya-date-label="start_date"]');
  if (!dateInput || !dateTextInput || !dateValue) return;
  const dateText = formatDateForRequest(dateValue, preset);
  dateInput.value = dateValue;
  dateTextInput.value = dateText;
  root.querySelectorAll<HTMLButtonElement>("[data-ya-date-preset]").forEach((button) => {
    const active = button.dataset.yaDatePreset === preset;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  customControl?.classList.add("is-active");
  if (customLabel) customLabel.textContent = formatTurkishCalendarDate(dateValue);
}

function bindTimeControls(root: HTMLElement) {
  const trigger = root.querySelector<HTMLButtonElement>("[data-ya-open-time-picker]");
  const popover = root.querySelector<HTMLElement>("[data-ya-time-popover]");
  const time = root.querySelector<HTMLInputElement>('input[name="time"]');
  if (!trigger || !popover || !time) return;

  trigger.addEventListener("click", () => {
    closeTurkishDatePicker(root);
    const opening = popover.hidden;
    if (opening) renderTimePicker(root);
    popover.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
  });

  popover.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (!button || button.disabled) return;

    if (button.dataset.yaTimeClose === "1") {
      closeTimePicker(root);
      return;
    }

    if (button.dataset.yaTimeClear === "1") {
      clearTimeSelection(root);
      closeTimePicker(root);
      return;
    }

    const hour = button.dataset.yaTimeHour;
    const minute = button.dataset.yaTimeMinute;
    if (hour !== undefined) popover.dataset.yaSelectedHour = hour;
    if (minute !== undefined) popover.dataset.yaSelectedMinute = minute;

    const selectedHour = String(popover.dataset.yaSelectedHour ?? "");
    const selectedMinute = String(popover.dataset.yaSelectedMinute ?? "");
    if (selectedHour && selectedMinute) {
      time.value = `${selectedHour}:${selectedMinute}`;
      const label = root.querySelector<HTMLElement>("[data-ya-time-label]");
      if (label) label.textContent = new Intl.DateTimeFormat(locale, {hour:"2-digit",minute:"2-digit"}).format(new Date(2000,0,1,Number(selectedHour),Number(selectedMinute)));
    }
    renderTimePicker(root);

    if (minute !== undefined && selectedHour && selectedMinute) {
      closeTimePicker(root);
    }
  });
}

function renderTimePicker(root: HTMLElement) {
  const popover = root.querySelector<HTMLElement>("[data-ya-time-popover]");
  const time = root.querySelector<HTMLInputElement>('input[name="time"]');
  if (!popover || !time) return;

  const current = /^([01]\\d|2[0-3]):([0-5]\\d)$/.exec(time.value);
  if (current) {
    popover.dataset.yaSelectedHour = current[1];
    popover.dataset.yaSelectedMinute = current[2];
  }

  const selectedHour = String(popover.dataset.yaSelectedHour ?? "");
  const selectedMinute = String(popover.dataset.yaSelectedMinute ?? "");
  const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
  const minutes = ["00", "15", "30", "45"];

  popover.innerHTML = `
    <div class="ya-widget-time-popover-head">
      <div>
        <small>${html("Saat seçimi")}</small>
        <strong>${selectedHour || "--"}:${selectedMinute || "--"}</strong>
      </div>
      <div class="ya-widget-time-popover-actions">
        <button class="ya-widget-time-clear" type="button" data-ya-time-clear="1" ${time.value ? "" : "disabled"}>${html("Temizle")}</button>
        <button class="ya-widget-time-close" type="button" data-ya-time-close="1" aria-label="${html("Saat seçimini kapat")}">×</button>
      </div>
    </div>
    <div class="ya-widget-time-columns">
      <div class="ya-widget-time-column" aria-label="${html("Saatler")}">
        <span>${html("Saat")}</span>
        <div class="ya-widget-time-scroll">
          ${hours.map((hour) => `<button type="button" data-ya-time-hour="${hour}" class="${selectedHour === hour ? "is-selected" : ""}">${hour}</button>`).join("")}
        </div>
      </div>
      <div class="ya-widget-time-column" aria-label="${html("Dakikalar")}">
        <span>${html("Dakika")}</span>
        <div class="ya-widget-time-scroll ya-widget-time-minutes">
          ${minutes.map((minute) => `<button type="button" data-ya-time-minute="${minute}" class="${selectedMinute === minute ? "is-selected" : ""}">${minute}</button>`).join("")}
        </div>
      </div>
    </div>
  `;

  window.requestAnimationFrame(() => {
    popover.querySelector<HTMLElement>(".ya-widget-time-scroll .is-selected")?.scrollIntoView({ block: "center" });
  });
}

function clearTimeSelection(root: HTMLElement) {
  const popover = root.querySelector<HTMLElement>("[data-ya-time-popover]");
  const time = root.querySelector<HTMLInputElement>('input[name="time"]');
  const label = root.querySelector<HTMLElement>("[data-ya-time-label]");
  if (time) time.value = "";
  if (label) label.textContent = ui("Saat seç");
  if (popover) {
    delete popover.dataset.yaSelectedHour;
    delete popover.dataset.yaSelectedMinute;
  }
}

function closeTimePicker(root: HTMLElement) {
  const popover = root.querySelector<HTMLElement>("[data-ya-time-popover]");
  const trigger = root.querySelector<HTMLButtonElement>("[data-ya-open-time-picker]");
  if (popover) popover.hidden = true;
  trigger?.setAttribute("aria-expanded", "false");
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
    const question = textarea.value.trim() || ui("Bilgi almak istiyorum.");
    state.questionDraft = textarea.value;
    const message = ui("Merhaba, {0} hakkında bilgi almak istiyorum. Sorum: {1}", {0: config.businessName, 1: question});
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
      questionDraft: state.context?.question?.trim() || (address ? ui("{0} adresine nasıl gelebilirim?", {0: address}) : ui("İşletmenize nasıl gelebilirim?")),
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
    preview.textContent = textarea.value.trim() || ui("Mesajınızı yazdığınızda burada görünecek.");
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
    setStatus(ui("Lütfen kısa sorunuzu yazın."));
    return;
  }

  if (!config.apiBaseUrl) {
    setStatus(ui("AI bağlantısı bu sitede etkin değil. Sorunuzu WhatsApp'tan iletebilirsiniz."));
    return;
  }

  state = { ...state, questionDraft: message, status: "", aiLoading: true };
  const settleNexa = widgetNexa.begin();
  render();

  let failureStatus = "";
  try {
    const endpoint = `${config.apiBaseUrl.replace(/\/$/, "")}/api/chat.php`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message, ...(locale === "en-GB" ? { response_language: "en" } : {}) })
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
    settleNexa(result.fallback ? "error" : "response");
    render();
  } catch {
    settleNexa("error");
    state = {
      ...state,
      aiLoading: false,
      status: failureStatus || ui("AI servisine ulaşılamadı. İnternet veya sunucu bağlantısını kontrol edin. Hata kodu: widget_connection_failed.")
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
    setStatus(ui("Lütfen bir konu seçin veya kısa mesajınızı yazın."));
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
  const message = locale === "en-GB" ? ui("AI hizmeti şu anda kullanılamıyor. Lütfen tekrar deneyin.") : String(error?.message || fallbackMessage || ui("AI yanıtı alınamadı.")).trim();
  const code = String(error?.code || "unknown_ai_error").trim();
  const providerStatus = Number(error?.provider_status || 0);
  const statusText = providerStatus > 0 ? ` (HTTP ${providerStatus})` : "";
  const retryText = error?.retryable === true ? ui(" Biraz sonra yeniden deneyebilirsiniz.") : "";

  return ui("{0} Hata kodu: {1}{2}.{3}", {0: message, 1: code, 2: statusText, 3: retryText});
}

function getAssistantSubtitle() {
  const surfaces = currentPublicSurfaces();
  if (surfaces.has("accommodation") && surfaces.has("food_service")) {
    return ui("Rezervasyon, masa ve bilgi taleplerinizi hızlıca hazırlayayım.");
  }
  if (surfaces.has("accommodation")) {
    return ui("Oda, rezervasyon ve konaklama sorularınızda yardımcı olayım.");
  }
  if (surfaces.has("food_service")) {
    return ui("Masa, menü ve restoran sorularınızda yardımcı olayım.");
  }
  if (surfaces.has("catalog")) {
    return ui("Ürün, stok ve işletme bilgileri için yardımcı olayım.");
  }
  return ui("İşletme hakkında bilgi ve iletişim taleplerinizde yardımcı olayım.");
}

function getAssistantTitle() {
  const businessName = config.businessName.trim() || ui("Yardımcı");
  const shortName = businessName
    .replace(/\s+(?:Pansiyon|Otel|Butik Otel|Restoran|Kafe)(?:\s*(?:&|\/)\s*(?:Pansiyon|Otel|Restoran|Kafe))*\s*$/i, "")
    .trim();
  const baseName = shortName && shortName.toLocaleLowerCase("tr-TR") !== "yardımcı asistan" ? shortName : ui("Yardımcı");
  return `${baseName} ${config.aiEnabled ? ui("AI Asistanı") : ui("Yardımcısı")}`;
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

  style.textContent = widgetStyles(ROOT_ID, widgetConfig);
}


function currentPublicSurfaces(): ReadonlySet<PublicSurface> {
  return resolvePublicSurfaces(config);
}

function isWhatsAppEnabled(): boolean {
  return isWhatsAppAvailable(config);
}

function isRequestTypeEnabled(requestType: RequestType): boolean {
  return isRequestTypeAvailable(config, requestType);
}

function getInfoSuggestions(): string[] {
  return buildInfoSuggestions(config);
}

function getWhatsAppTopics() {
  return buildWhatsAppTopics(config);
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
      whatsappEnabled: typeof business.whatsapp_enabled === "boolean" ? business.whatsapp_enabled : config.whatsappEnabled,
      dealerApplicationEnabled: business.dealer_application_enabled === true,
      requestsEnabled: typeof business.requests_enabled === "boolean" ? business.requests_enabled : config.requestsEnabled,
      profileId: profileId || config.profileId,
      publicSurfaces: publicSurfaces.length > 0 ? publicSurfaces : config.publicSurfaces
    };

    if (
      (state.view === "form" && !isRequestTypeEnabled(state.requestType))
      || (state.view === "info" && !config.aiEnabled)
      || (state.view === "whatsapp" && !isWhatsAppEnabled())
    ) {
      state = { ...state, view: "home", status: "", aiLoading: false, aiAnswer: "", questionDraft: "" };
    }
    injectStyles(config);
    render();
  } catch {
    // Script configuration remains the offline/failure fallback.
  }
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
        ...(trigger.dataset.yaResourceType === undefined ? {} : { resourceType: trigger.dataset.yaResourceType }),
        ...(trigger.dataset.yaResourceId === undefined ? {} : { resourceId: trigger.dataset.yaResourceId }),
        ...(trigger.dataset.yaResourceName === undefined ? {} : { resourceName: trigger.dataset.yaResourceName }),
        ...(trigger.dataset.yaImageUrl === undefined ? {} : { imageUrl: trigger.dataset.yaImageUrl }),
        sourcePath: trigger.dataset.yaSourcePath || window.location.pathname,
        ...(trigger.dataset.yaQuestion === undefined ? {} : { question: trigger.dataset.yaQuestion }),
        ...(trigger.dataset.yaAddress === undefined ? {} : { address: trigger.dataset.yaAddress }),
        ...(trigger.dataset.yaMapUrl === undefined ? {} : { mapUrl: trigger.dataset.yaMapUrl })
      }
    });
  });
}

function focusWidgetElement(selector: string) {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`#${ROOT_ID} ${selector}`)?.focus();
  });
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
