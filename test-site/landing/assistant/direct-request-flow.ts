import { ui, html } from "./site-language";
import { requestMessage } from "./request-message";
import { widgetNexa } from "./widget-nexa";
import {
  createWhatsAppUrl,
  normalizeInternationalPhone
} from "@yardimci-asistan/whatsapp-bridge";

type RequestType = "pension_reservation" | "restaurant_reservation" | "general_info";

interface RequestPayload {
  idempotency_key?: string;
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
  context: {
    resourceType: string;
    resourceId: string;
    resourceName: string;
    sourcePath: string;
  };
}

interface RequestApiResponse {
  ok?: boolean;
  message?: string;
  request_id?: string;
  whatsapp_message?: string;
}

interface RuntimeConfig {
  businessName: string;
  whatsappPhone: string;
  apiBaseUrl: string;
}

interface WidgetApi {
  init: (config?: Partial<RuntimeConfig>) => void;
}

const ROOT_SELECTOR = "#yardimci-asistan-widget";
const STYLE_ID = "yardimci-asistan-direct-request-style";
const submissionIntents = new WeakMap<HTMLFormElement, { intent: string; key: string }>();
let installed = false;
let submitting = false;
let runtimeConfig: RuntimeConfig = {
  businessName: "Yardımcı Asistan",
  whatsappPhone: "",
  apiBaseUrl: ""
};

export function installDirectRequestFlow() {
  if (installed) return;
  installed = true;
  runtimeConfig = { ...runtimeConfig, ...readScriptConfig() };
  injectDirectRequestStyles();
  wrapWidgetInit();
  queueMicrotask(wrapWidgetInit);

  document.addEventListener("submit", interceptRequestSubmit, true);

  const root = document.querySelector<HTMLElement>(ROOT_SELECTOR);
  if (root) {
    observeRoot(root);
    enhanceRequestForm(root);
  }
}

function wrapWidgetInit() {
  const widget = window.YardimciAsistanWidget as (WidgetApi & Record<string, unknown>) | undefined;
  if (!widget || typeof widget.init !== "function" || widget.__directRequestInitWrapped === true) return;

  const originalInit = widget.init.bind(widget);
  widget.init = (nextConfig = {}) => {
    runtimeConfig = {
      ...runtimeConfig,
      ...pickRuntimeConfig(nextConfig)
    };
    originalInit(nextConfig);
    const root = document.querySelector<HTMLElement>(ROOT_SELECTOR);
    if (root) {
      observeRoot(root);
      queueMicrotask(() => enhanceRequestForm(root));
    }
  };
  widget.__directRequestInitWrapped = true;
}

function observeRoot(root: HTMLElement) {
  if (root.dataset.yaDirectRequestObserved === "1") return;
  root.dataset.yaDirectRequestObserved = "1";
  const observer = new MutationObserver(() => enhanceRequestForm(root));
  observer.observe(root, { childList: true, subtree: true });
}

function enhanceRequestForm(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>(".ya-widget-form[data-ya-form]");
  if (!form) return;

  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submitButton && submitButton.dataset.yaDirectRequestButton !== "1") {
    submitButton.dataset.yaDirectRequestButton = "1";
    submitButton.innerHTML = `${sendIcon()}<span>${html("Talebi Gönder")}</span>`;
  }
}

function interceptRequestSubmit(event: Event) {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form?.matches(".ya-widget-form[data-ya-form]")) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (!submitting) void submitRequest(form);
}

async function submitRequest(form: HTMLFormElement) {
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const customerPhone = String(formData.get("customer_phone") ?? "").trim();
  const normalizedPhone = normalizeInternationalPhone(customerPhone);
  if (!normalizedPhone.ok) {
    showStatus(ui(normalizedPhone.error));
    form.querySelector<HTMLInputElement>('input[name="customer_phone"]')?.focus();
    return;
  }

  const requestType = String(formData.get("request_type") ?? "pension_reservation");
  if (requestType !== "pension_reservation" && requestType !== "restaurant_reservation" && requestType !== "general_info") {
    showStatus(ui("Talep türü geçerli değil. Lütfen yeniden deneyin."));
    return;
  }

  const payload: RequestPayload = {
    request_type: requestType,
    customer_name: String(formData.get("customer_name") ?? "").trim(),
    customer_phone: customerPhone,
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
    showStatus(scheduleError || ui("Lütfen gerekli alanları kontrol edin."));
    return;
  }

  payload.whatsapp_message = requestMessage({
    ...payload,
    time_text: payload.time
  }, runtimeConfig.businessName || ui("İşletme"));
  if (!runtimeConfig.apiBaseUrl.trim()) {
    showStatus(ui("Web talep bağlantısı bu sitede etkin değil. İsterseniz WhatsApp üzerinden yazabilirsiniz."));
    showWhatsAppFallback(form, payload.whatsapp_message);
    return;
  }

  const intent = JSON.stringify({ ...payload, customer_phone: normalizedPhone.e164, whatsapp_message: "" });
  const previous = submissionIntents.get(form);
  const key = previous?.intent === intent ? previous.key
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  submissionIntents.set(form, { intent, key });
  payload.idempotency_key = key;
  submitting = true;
  hideStatus();
  setFormBusy(form, true);
  const settleNexa = widgetNexa.begin();
  let failureMessage = ui("Talep işletmeye iletilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.");

  try {
    const response = await fetch(`${runtimeConfig.apiBaseUrl.trim().replace(/\/$/, "")}/api/request.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json().catch(() => null)) as RequestApiResponse | null;
    if (!response.ok || result?.ok !== true || !result.request_id) {
      failureMessage = response.status === 429 ? ui("Çok fazla istek gönderildi. Biraz sonra aynı talebi tekrar deneyin.")
        : response.status >= 400 && response.status < 500 ? ui("İstek işlenemedi. Lütfen bilgileri kontrol edip tekrar deneyin.")
          : ui("Talep işletmeye iletilemedi.");
      throw new Error("request_failed");
    }

    settleNexa(form.isConnected ? "success" : "cancel");
    submissionIntents.delete(form);
    hideStatus();
    renderSuccess(form, result.whatsapp_message || payload.whatsapp_message);
  } catch {
    settleNexa(form.isConnected ? "error" : "cancel");
    showStatus(failureMessage);
    showWhatsAppFallback(form, payload.whatsapp_message);
    setFormBusy(form, false);
  } finally {
    submitting = false;
  }
}

function contextualRequestMessage(note: string, resourceType: string, resourceName: string): string {
  if (!resourceName) return note;
  const label = resourceType === "room" ? ui("İlgili oda")
    : resourceType === "table" ? ui("İlgili masa")
      : resourceType === "product" ? ui("İlgili ürün")
        : ui("İlgili kayıt");
  return [`${label}: ${resourceName}`, note].filter(Boolean).join("\n");
}

function validateRequestSchedule(payload: RequestPayload): string {
  if (payload.request_type === "general_info") return "";
  if (payload.request_type === "pension_reservation") {
    if (!payload.start_date || !payload.end_date) {
      return ui("Lütfen giriş ve çıkış tarihlerini seçin.");
    }
    if (payload.end_date <= payload.start_date) {
      return ui("Çıkış tarihi giriş tarihinden sonra olmalı.");
    }
    return "";
  }

  if (!payload.start_date) return ui("Lütfen rezervasyon tarihini seçin.");
  if (!payload.time) return ui("Lütfen rezervasyon saatini seçin.");
  return "";
}

function renderSuccess(form: HTMLFormElement, whatsappMessage: string) {
  const subview = form.closest<HTMLElement>(".ya-widget-subview");
  const intro = subview?.querySelector<HTMLElement>(".ya-widget-subview-intro");
  const title = intro?.querySelector<HTMLElement>("h2");
  const description = intro?.querySelector<HTMLElement>("p");
  if (title) title.textContent = ui("Talebiniz işletmeye iletildi");
  if (description) description.textContent = ui("İşletme talebinizi inceleyip sizinle iletişime geçecek.");

  const success = document.createElement("div");
  success.className = "ya-widget-request-success";

  const summary = document.createElement("div");
  summary.className = "ya-widget-request-success-card";
  summary.innerHTML = `${checkIcon()}<div><strong>${html("Talebiniz kaydedildi.")}</strong></div>`;
  success.appendChild(summary);

  const actions = document.createElement("div");
  actions.className = "ya-widget-request-success-actions";

  if (isWhatsAppAvailable()) {
    const whatsappButton = document.createElement("button");
    whatsappButton.type = "button";
    whatsappButton.className = "ya-widget-secondary-action";
    whatsappButton.dataset.yaRequestWhatsapp = "1";
    whatsappButton.innerHTML = `${whatsappIcon()}<span>${html("WhatsApp'tan da yaz")}</span>`;
    whatsappButton.addEventListener("click", () => {
      const url = createWhatsAppUrl(runtimeConfig.whatsappPhone, whatsappMessage);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    });
    actions.appendChild(whatsappButton);
  }

  const doneButton = document.createElement("button");
  doneButton.type = "button";
  doneButton.className = "ya-widget-primary-action";
  doneButton.dataset.yaRequestDone = "1";
  doneButton.innerHTML = `${checkIcon()}<span>${html("Tamam")}</span>`;
  doneButton.addEventListener("click", () => {
    subview?.querySelector<HTMLButtonElement>('[data-ya-view="home"]')?.click();
  });
  actions.appendChild(doneButton);

  success.appendChild(actions);
  form.replaceWith(success);
}

function showWhatsAppFallback(form: HTMLFormElement, message: string) {
  if (!isWhatsAppAvailable() || form.querySelector("[data-ya-request-fallback]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ya-widget-secondary-action ya-widget-request-fallback";
  button.dataset.yaRequestFallback = "1";
  button.innerHTML = `${whatsappIcon()}<span>${html("WhatsApp'tan Yaz")}</span>`;
  button.addEventListener("click", () => {
    const url = createWhatsAppUrl(runtimeConfig.whatsappPhone, message);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });
  form.querySelector<HTMLButtonElement>('button[type="submit"]')?.insertAdjacentElement("afterend", button);
}

function isWhatsAppAvailable(): boolean {
  const root = document.querySelector<HTMLElement>(ROOT_SELECTOR);
  return root?.dataset.yaWhatsappEnabled !== "0" && runtimeConfig.whatsappPhone.trim() !== "";
}

function setFormBusy(form: HTMLFormElement, busy: boolean) {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("is-loading", busy);
  button.innerHTML = busy
    ? `<span class="ya-widget-spinner" aria-hidden="true"></span><span>${html("Talep gönderiliyor…")}</span>`
    : `${sendIcon()}<span>${html("Talebi Gönder")}</span>`;
}

function showStatus(message: string) {
  const notice = document.querySelector<HTMLElement>(`${ROOT_SELECTOR} [data-ya-status]`);
  const text = notice?.querySelector<HTMLElement>("[data-ya-status-text]");
  if (!notice || !text) return;
  text.textContent = message;
  notice.hidden = false;
}

function hideStatus() {
  const notice = document.querySelector<HTMLElement>(`${ROOT_SELECTOR} [data-ya-status]`);
  const text = notice?.querySelector<HTMLElement>("[data-ya-status-text]");
  if (!notice || !text) return;
  text.textContent = "";
  notice.hidden = true;
}

function readScriptConfig(): Partial<RuntimeConfig> {
  const scripts = Array.from(document.scripts).reverse();
  const script = (document.currentScript as HTMLScriptElement | null)
    ?? scripts.find((candidate) => candidate.dataset.apiBaseUrl !== undefined || /widget\.js(?:$|\?)/.test(candidate.src));
  const dataset = script?.dataset;
  return pickRuntimeConfig({
    ...(dataset?.businessName === undefined ? {} : { businessName: dataset.businessName }),
    ...(dataset?.whatsappPhone === undefined ? {} : { whatsappPhone: dataset.whatsappPhone }),
    ...(dataset?.apiBaseUrl === undefined ? {} : { apiBaseUrl: dataset.apiBaseUrl })
  });
}

function pickRuntimeConfig(input: Partial<RuntimeConfig>): Partial<RuntimeConfig> {
  const result: Partial<RuntimeConfig> = {};
  if (typeof input.businessName === "string" && input.businessName.trim()) result.businessName = input.businessName;
  if (typeof input.whatsappPhone === "string" && input.whatsappPhone.trim()) result.whatsappPhone = input.whatsappPhone;
  if (typeof input.apiBaseUrl === "string" && input.apiBaseUrl.trim()) result.apiBaseUrl = input.apiBaseUrl;
  return result;
}

function injectDirectRequestStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    ${ROOT_SELECTOR} .ya-widget-request-success { display: grid; gap: 12px; }
    ${ROOT_SELECTOR} .ya-widget-request-success-card {
      display: flex; align-items: flex-start; gap: 10px; padding: 13px;
      border: 1px solid rgba(47,111,94,.2); border-radius: 15px; background: #edf5ec;
    }
    ${ROOT_SELECTOR} .ya-widget-request-success-card > .ya-widget-icon { color: #2F6F5E; }
    ${ROOT_SELECTOR} .ya-widget-request-success-card div { display: grid; gap: 3px; }
    ${ROOT_SELECTOR} .ya-widget-request-success-card strong { color: #172033; font-size: 13px; }
    ${ROOT_SELECTOR} .ya-widget-request-success-actions { display: grid; gap: 8px; }
    ${ROOT_SELECTOR} .ya-widget-request-fallback { margin-top: -4px; }
  `;
  document.head.appendChild(style);
}

function icon(path: string) {
  return `<svg class="ya-widget-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
}

function sendIcon() {
  return icon('<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>');
}

function whatsappIcon() {
  return icon('<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8.7c.5 2.5 2 4 4.5 4.8l1-1"/>');
}

function checkIcon() {
  return icon('<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>');
}
