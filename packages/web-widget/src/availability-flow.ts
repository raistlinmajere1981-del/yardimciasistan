interface AvailabilityRuntimeConfig {
  apiBaseUrl: string;
}

interface AvailabilityWidgetApi {
  init: (config?: Partial<AvailabilityRuntimeConfig>) => void;
}

interface AvailabilityApiResponse {
  ok?: boolean;
  handled?: boolean;
  live?: boolean;
  complete?: boolean;
  code?: string;
  answer?: string;
  message?: string;
  missing?: string[];
}

const AVAILABILITY_ROOT_SELECTOR = "#yardimci-asistan-widget";
let availabilityInstalled = false;
let availabilityInFlight = false;
let availabilityPendingMessage = "";
let availabilityPendingMissing: string[] = [];
let availabilityRuntimeConfig: AvailabilityRuntimeConfig = {
  apiBaseUrl: ""
};

export function installAvailabilityFlow() {
  if (availabilityInstalled) return;
  availabilityInstalled = true;
  availabilityRuntimeConfig = {
    ...availabilityRuntimeConfig,
    ...readAvailabilityScriptConfig()
  };
  wrapAvailabilityWidgetInit();
  queueMicrotask(wrapAvailabilityWidgetInit);
  document.addEventListener("submit", interceptAvailabilitySubmit, true);
}

function wrapAvailabilityWidgetInit() {
  const widget = window.YardimciAsistanWidget as (AvailabilityWidgetApi & Record<string, unknown>) | undefined;
  if (!widget || typeof widget.init !== "function" || widget.__availabilityInitWrapped === true) return;

  const originalInit = widget.init.bind(widget);
  widget.init = (nextConfig = {}) => {
    availabilityRuntimeConfig = {
      ...availabilityRuntimeConfig,
      ...pickAvailabilityRuntimeConfig(nextConfig)
    };
    originalInit(nextConfig);
  };
  widget.__availabilityInitWrapped = true;
}

function interceptAvailabilitySubmit(event: Event) {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form?.matches(".ya-widget-ai[data-ya-ai-form]")) return;

  if (form.dataset.yaAvailabilityBypass === "1") {
    delete form.dataset.yaAvailabilityBypass;
    return;
  }

  const formData = new FormData(form);
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return;

  const isContinuation = availabilityPendingMessage !== ""
    && looksLikeAvailabilityContinuation(message, availabilityPendingMissing);
  const isAvailabilityQuestion = looksLikeRoomAvailabilityQuestion(message);

  if (!isContinuation && !isAvailabilityQuestion) {
    clearAvailabilityPendingContext();
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  if (!availabilityInFlight) {
    void submitAvailabilityQuery(form, message, isContinuation);
  }
}

async function submitAvailabilityQuery(form: HTMLFormElement, message: string, isContinuation: boolean) {
  const apiBaseUrl = availabilityRuntimeConfig.apiBaseUrl.trim().replace(/\/$/, "");
  if (!apiBaseUrl) {
    releaseAvailabilityToAi(form);
    return;
  }

  const queryMessage = isContinuation
    ? `${availabilityPendingMessage} ${message}`.trim()
    : message;

  availabilityInFlight = true;
  setAvailabilityFormBusy(form, true);
  showAvailabilityStatus("Canlı müsaitlik kontrol ediliyor...");

  try {
    const response = await fetch(`${apiBaseUrl}/api/availability.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: queryMessage })
    });
    const result = (await response.json().catch(() => null)) as AvailabilityApiResponse | null;

    if (result?.handled !== true || !result.answer) {
      clearAvailabilityPendingContext();
      releaseAvailabilityToAi(form);
      return;
    }

    if (result.complete === false) {
      availabilityPendingMessage = queryMessage;
      availabilityPendingMissing = Array.isArray(result.missing) ? result.missing.filter((item) => typeof item === "string") : [];
    } else {
      clearAvailabilityPendingContext();
    }

    if (form.isConnected) {
      renderAvailabilityAnswer(form, result.answer, result.live === true);
      hideAvailabilityStatus();
      setAvailabilityFormBusy(form, false);
    }
  } catch {
    clearAvailabilityPendingContext();
    releaseAvailabilityToAi(form);
  } finally {
    availabilityInFlight = false;
  }
}

function releaseAvailabilityToAi(form: HTMLFormElement) {
  if (!form.isConnected) return;
  hideAvailabilityStatus();
  setAvailabilityFormBusy(form, false);
  form.dataset.yaAvailabilityBypass = "1";
  queueMicrotask(() => {
    if (form.isConnected) form.requestSubmit();
  });
}

function renderAvailabilityAnswer(form: HTMLFormElement, answer: string, live: boolean) {
  const subview = form.closest<HTMLElement>(".ya-widget-subview");
  if (!subview) return;

  let container = subview.querySelector<HTMLElement>(".ya-widget-ai-answer");
  if (!container) {
    container = document.createElement("div");
    container.className = "ya-widget-ai-answer";
    form.insertAdjacentElement("afterend", container);
  }
  container.dataset.yaAvailabilityAnswer = "1";
  container.replaceChildren();

  const copy = document.createElement("p");
  const title = document.createElement("strong");
  title.textContent = live ? "Canlı Müsaitlik" : "Müsaitlik Kontrolü";
  const text = document.createElement("span");
  text.textContent = answer;
  copy.append(title, text);
  container.append(copy);

  const trust = subview.querySelector<HTMLElement>(".ya-widget-inline-trust");
  if (trust) {
    trust.textContent = "Müsaitlik sorgusu rezervasyon oluşturmaz; son onay işletmeye aittir.";
  }
}

function setAvailabilityFormBusy(form: HTMLFormElement, busy: boolean) {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) return;
  button.disabled = busy;
  const label = button.querySelector<HTMLElement>("span");
  if (label) {
    label.textContent = busy ? "Müsaitlik kontrol ediliyor" : "AI Yardımcıya Sor";
  }
}

function looksLikeRoomAvailabilityQuestion(message: string): boolean {
  const normalized = message.toLocaleLowerCase("tr-TR");
  const roomIntent = /\b(?:oda(?:lar)?|otel|pansiyon|konaklama)(?:mız|miz|muz|müz|ımız|imiz|umuz|ümüz|nız|niz|nuz|nüz|ınız|iniz|unuz|ünüz)?(?:da|de|ta|te|dan|den|tan|ten|ya|ye|yı|yi|yu|yü|nın|nin|nun|nün)?\b/u.test(normalized);
  const availabilityIntent = /(müsait|musait|boş|bos|yer\s+var|rezervasyon)/u.test(normalized)
    || /\b(?:oda(?:lar)?|otel|pansiyon|konaklama)(?:mız|miz|muz|müz|ımız|imiz|umuz|ümüz|nız|niz|nuz|nüz|ınız|iniz|unuz|ünüz)?(?:da|de|ta|te|dan|den|tan|ten|ya|ye|yı|yi|yu|yü|nın|nin|nun|nün)?\s+var(?:\s*m[ıiuü])?\b/u.test(normalized);
  return roomIntent && availabilityIntent;
}

function looksLikeAvailabilityContinuation(message: string, missing: string[]): boolean {
  const normalized = message.toLocaleLowerCase("tr-TR").trim();
  if (missing.includes("guest_count") && (/^\d{1,2}$/.test(normalized)
      || /\b\d{1,2}\s*(kişi|kisi|kişilik|kisilik|yetişkin|yetiskin|çocuk|cocuk)\b/u.test(normalized))) {
    return true;
  }
  if (missing.includes("date_range") && (/\b20\d{2}-\d{2}-\d{2}\b/.test(normalized)
      || /\b\d{1,2}[./]\d{1,2}(?:[./]20\d{2})?\b/.test(normalized)
      || /\b\d{1,2}\s*(?:-|–|—|ile)\s*\d{1,2}\b/u.test(normalized)
      || /\b(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik|bugün|bugun|yarın|yarin)\b/u.test(normalized))) {
    return true;
  }
  return false;
}

function clearAvailabilityPendingContext() {
  availabilityPendingMessage = "";
  availabilityPendingMissing = [];
}

function showAvailabilityStatus(message: string) {
  const status = document.querySelector<HTMLElement>(`${AVAILABILITY_ROOT_SELECTOR} [data-ya-status]`);
  if (!status) return;
  status.textContent = message;
  status.hidden = false;
}

function hideAvailabilityStatus() {
  const status = document.querySelector<HTMLElement>(`${AVAILABILITY_ROOT_SELECTOR} [data-ya-status]`);
  if (!status) return;
  status.textContent = "";
  status.hidden = true;
}

function readAvailabilityScriptConfig(): Partial<AvailabilityRuntimeConfig> {
  const scripts = Array.from(document.scripts).reverse();
  const script = (document.currentScript as HTMLScriptElement | null)
    ?? scripts.find((candidate) => candidate.dataset.apiBaseUrl !== undefined || /widget(?:-core)?\.js(?:$|\?)/.test(candidate.src));
  return pickAvailabilityRuntimeConfig({ ...(script?.dataset.apiBaseUrl === undefined ? {} : { apiBaseUrl: script.dataset.apiBaseUrl }) });
}

function pickAvailabilityRuntimeConfig(input: Partial<AvailabilityRuntimeConfig>): Partial<AvailabilityRuntimeConfig> {
  const result: Partial<AvailabilityRuntimeConfig> = {};
  if (typeof input.apiBaseUrl === "string" && input.apiBaseUrl.trim()) result.apiBaseUrl = input.apiBaseUrl;
  return result;
}
