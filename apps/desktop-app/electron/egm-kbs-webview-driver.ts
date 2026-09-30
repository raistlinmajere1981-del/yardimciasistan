import { webContents, type WebContents } from "electron";
import { EGM_KBS_PORTAL_URL, type KbsRuntimeCredentials } from "./kbs-settings.js";

export type EgmKbsSessionState =
  | "unavailable"
  | "login_required"
  | "otp_required"
  | "credentials_submitted"
  | "otp_submitted"
  | "authenticated"
  | "unknown";

export interface EgmKbsSessionResult {
  ok: boolean;
  state: EgmKbsSessionState;
  message: string;
  url: string;
}

interface EgmKbsDomResult {
  ok?: boolean;
  state?: EgmKbsSessionState;
  message?: string;
}

export class EgmKbsWebviewDriver {
  private guest: WebContents | null = null;

  attach(webContentsId: number): boolean {
    const candidate = webContents.fromId(webContentsId);
    if (!candidate || candidate.isDestroyed() || candidate.getType() !== "webview") return false;
    return this.attachWebContents(candidate);
  }

  attachWebContents(candidate: WebContents): boolean {
    if (candidate.isDestroyed()) return false;
    if (this.guest === candidate) return true;
    this.detach();
    this.guest = candidate;
    candidate.once("destroyed", () => {
      if (this.guest === candidate) this.guest = null;
    });
    return true;
  }

  detach(webContentsId?: number) {
    if (!this.guest) return;
    if (webContentsId !== undefined && this.guest.id !== webContentsId) return;
    this.guest = null;
  }

  isAvailable(): boolean {
    return Boolean(this.guest && !this.guest.isDestroyed());
  }

  async inspect(): Promise<EgmKbsSessionResult> {
    const guest = this.guest;
    if (!guest || guest.isDestroyed()) return unavailable("EGM KBS web oturumu açık değil.");
    const url = guest.getURL();
    if (!isTrustedEgmUrl(url)) {
      return {
        ok: false,
        state: "unknown",
        message: "EGM KBS oturumu resmi EGM alan adında değil; otomasyon durduruldu.",
        url
      };
    }
    return this.execute(guest, createInspectionScript());
  }

  async prepareLogin(credentials: KbsRuntimeCredentials): Promise<EgmKbsSessionResult> {
    const guest = this.guest;
    if (!guest || guest.isDestroyed()) return unavailable("EGM KBS web oturumu açık değil.");

    let url = guest.getURL();
    if (!url || url === "about:blank") {
      try {
        await guest.loadURL(EGM_KBS_PORTAL_URL);
        url = guest.getURL();
      } catch {
        return unavailable("EGM KBS giriş sayfası yüklenemedi.");
      }
    }
    if (!isTrustedEgmUrl(url)) {
      return {
        ok: false,
        state: "unknown",
        message: "EGM KBS sayfası beklenen resmi alan adında değil; giriş bilgileri uygulanmadı.",
        url
      };
    }

    const inspection = await this.inspect();
    if (inspection.state === "authenticated") return inspection;

    if (inspection.state === "login_required") {
      return this.execute(guest, createFirstFactorScript(credentials));
    }

    if (inspection.state === "otp_required") {
      return {
        ok: false,
        state: "otp_required",
        message: "EGMSEC uygulamasındaki geçici şifreyi resmi KBS sayfasına girin. Doğrulama sonrası aynı oturum otomasyon için kullanılacak.",
        url: guest.getURL()
      };
    }

    return inspection;
  }

  private async execute(guest: WebContents, script: string): Promise<EgmKbsSessionResult> {
    const url = guest.getURL();
    if (!isTrustedEgmUrl(url)) {
      return {
        ok: false,
        state: "unknown",
        message: "EGM KBS otomasyonu resmi EGM alan adı dışında çalıştırılmaz.",
        url
      };
    }
    try {
      const raw = await guest.executeJavaScript(script, true);
      if (!raw || typeof raw !== "object") {
        return { ok: false, state: "unknown", message: "EGM KBS sayfa durumu doğrulanamadı.", url: guest.getURL() };
      }
      const result = raw as EgmKbsDomResult;
      return {
        ok: result.ok === true,
        state: normalizeState(result.state),
        message: String(result.message ?? "EGM KBS sayfa durumu doğrulanamadı."),
        url: guest.getURL()
      };
    } catch {
      return {
        ok: false,
        state: "unknown",
        message: "EGM KBS sayfasında güvenli otomasyon çalıştırılamadı.",
        url: guest.getURL()
      };
    }
  }
}

function unavailable(message: string): EgmKbsSessionResult {
  return { ok: false, state: "unavailable", message, url: "" };
}

function normalizeState(value: unknown): EgmKbsSessionState {
  const states = new Set<EgmKbsSessionState>([
    "unavailable",
    "login_required",
    "otp_required",
    "credentials_submitted",
    "otp_submitted",
    "authenticated",
    "unknown"
  ]);
  return states.has(value as EgmKbsSessionState) ? value as EgmKbsSessionState : "unknown";
}

function isTrustedEgmUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "egm.gov.tr" || url.hostname.endsWith(".egm.gov.tr"));
  } catch {
    return false;
  }
}

function createInspectionScript(): string {
  return `(() => {
    const normalize = (value) => String(value || "")
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .replaceAll("ı", "i")
      .replaceAll("ş", "s")
      .replaceAll("ğ", "g")
      .replaceAll("ü", "u")
      .replaceAll("ö", "o")
      .replaceAll("ç", "c")
      .replace(/\\s+/g, " ")
      .trim();
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.disabled && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const inputs = Array.from(document.querySelectorAll("input")).filter(visible);
    const meta = (input) => {
      const explicit = input.id ? document.querySelector('label[for="' + CSS.escape(input.id) + '"]') : null;
      const wrapped = input.closest("label");
      return normalize([
        input.name,
        input.id,
        input.placeholder,
        input.getAttribute("aria-label"),
        input.autocomplete,
        explicit && explicit.textContent,
        wrapped && wrapped.textContent
      ].filter(Boolean).join(" "));
    };
    const hasAny = (text, tokens) => tokens.some((token) => text.includes(token));
    const password = inputs.find((input) => input.type === "password" && hasAny(meta(input), ["parola", "sifre", "password"]))
      || inputs.find((input) => input.type === "password");
    const username = inputs.find((input) => hasAny(meta(input), ["kullanici adi", "kullaniciadi", "username"]));
    const identity = inputs.find((input) => hasAny(meta(input), ["tc kimlik", "t.c. kimlik", "kimlik no", "kimlik numara"]));
    const body = normalize(document.body && document.body.innerText);
    const otp = inputs.find((input) => hasAny(meta(input), ["egmsec", "tek kullanimlik", "dogrulama kod", "otp", "guvenlik kod"]))
      || (hasAny(body, ["egmsec", "tek kullanimlik parola"]) && inputs.find((input) => {
        const max = Number(input.maxLength);
        return input.type !== "password" && max > 0 && max <= 8;
      }));

    if (username && identity && password) {
      return { ok: true, state: "login_required", message: "EGM KBS giriş formu tanındı." };
    }
    if (otp && hasAny(body, ["egmsec", "tek kullanimlik", "dogrulama"])) {
      return { ok: true, state: "otp_required", message: "EGMSEC doğrulama adımı bekleniyor." };
    }
    if (!password && hasAny(body, ["kimlik bildirim", "tesis"]) && hasAny(body, ["cikis", "oturumu kapat"])) {
      return { ok: true, state: "authenticated", message: "EGM KBS oturumu açık görünüyor." };
    }
    return { ok: false, state: "unknown", message: "EGM KBS sayfasının bu adımı güvenle tanınamadı; otomatik işlem yapılmadı." };
  })()`;
}

function createFirstFactorScript(credentials: KbsRuntimeCredentials): string {
  const username = JSON.stringify(credentials.username);
  const identity = JSON.stringify(credentials.authorizedIdentityNumber);
  const password = JSON.stringify(credentials.password);
  return `(() => {
    const USERNAME = ${username};
    const IDENTITY = ${identity};
    const PASSWORD = ${password};
    const normalize = (value) => String(value || "")
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .replaceAll("ı", "i")
      .replaceAll("ş", "s")
      .replaceAll("ğ", "g")
      .replaceAll("ü", "u")
      .replaceAll("ö", "o")
      .replaceAll("ç", "c")
      .replace(/\\s+/g, " ")
      .trim();
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.disabled && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const inputs = Array.from(document.querySelectorAll("input")).filter(visible);
    const meta = (input) => {
      const explicit = input.id ? document.querySelector('label[for="' + CSS.escape(input.id) + '"]') : null;
      const wrapped = input.closest("label");
      return normalize([
        input.name,
        input.id,
        input.placeholder,
        input.getAttribute("aria-label"),
        input.autocomplete,
        explicit && explicit.textContent,
        wrapped && wrapped.textContent
      ].filter(Boolean).join(" "));
    };
    const hasAny = (text, tokens) => tokens.some((token) => text.includes(token));
    const userInput = inputs.find((input) => hasAny(meta(input), ["kullanici adi", "kullaniciadi", "username"]));
    const identityInput = inputs.find((input) => hasAny(meta(input), ["tc kimlik", "t.c. kimlik", "kimlik no", "kimlik numara"]));
    const passwordInput = inputs.find((input) => input.type === "password" && hasAny(meta(input), ["parola", "sifre", "password"]))
      || inputs.find((input) => input.type === "password");
    if (!userInput || !identityInput || !passwordInput || userInput === identityInput) {
      return { ok: false, state: "unknown", message: "EGM KBS giriş alanları güvenle eşleştirilemedi; form değiştirilmedi." };
    }
    const setValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(input, value); else input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setValue(userInput, USERNAME);
    setValue(identityInput, IDENTITY);
    setValue(passwordInput, PASSWORD);

    const form = passwordInput.form || userInput.form || identityInput.form;
    const buttons = Array.from((form || document).querySelectorAll('button, input[type="submit"]')).filter(visible);
    const submit = buttons.find((button) => {
      const text = normalize(button.textContent || button.value || button.getAttribute("aria-label"));
      return ["giris", "oturum ac", "devam"].some((token) => text.includes(token));
    }) || (form && form.querySelector('button[type="submit"], input[type="submit"]'));
    if (!submit) {
      return { ok: false, state: "login_required", message: "EGM KBS giriş bilgileri dolduruldu; güvenli gönder düğmesi tanınamadığı için kullanıcı onayı bekleniyor." };
    }
    submit.click();
    return { ok: true, state: "credentials_submitted", message: "EGM KBS giriş bilgileri uygulandı; sonuç bekleniyor." };
  })()`;
}


