import { createHash, randomBytes } from "node:crypto";
import { safeStorage, shell } from "electron";
import type { DesktopDatabase } from "../database";
import { InstagramPublishingProviderAdapter } from "./instagram-provider";
import { decryptMessagingSecret } from "../business-messaging/secret-service";
import { providerJson, providerObject } from "./provider-http";

const OAUTH_URL = "https://yardimciasistan.alwaysdata.net/instagram/oauth.php";
interface Pending { verifier: string; sessionId: string; expiresAt: number }
export type InstagramOAuthProgress =
  | { status: "pending" }
  | { status: "connected"; username: string }
  | { status: "failed"; message: string };

/** Single active local pairing per unlocked desktop. Nothing sensitive crosses IPC. */
export class InstagramOAuthService {
  private pending: Pending | null = null;
  private inFlight = false;
  // Fence stale async claims/refreshes after disconnect or account replacement.
  private connectionEpoch = 0;
  constructor(private readonly database: () => DesktopDatabase, private readonly fetchImpl: typeof fetch = fetch,
    private readonly assertUnlocked: () => void = () => {}) {}
  private async endpoint(input: Record<string, unknown>) {
    const { response, data } = await providerJson(OAUTH_URL, {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(input)
    }, { fetchImpl: this.fetchImpl, timeoutMs: 20000 });
    if (!response.ok || data.ok !== true) {
      if (data.code === "setup_pending") throw new Error("Instagram bağlantısı henüz sunucuda etkinleştirilmedi.");
      throw new Error("Instagram bağlantı servisine ulaşılamadı. Daha sonra tekrar deneyin.");
    }
    return data;
  }
  private canEncrypt() {
    if (!safeStorage.isEncryptionAvailable() ||
        (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text"))
      throw new Error("Bu bilgisayarda Instagram bağlantısı güvenli saklanamıyor.");
  }
  async begin(): Promise<{ ok: boolean; message: string }> {
    try {
      this.canEncrypt();
      if (this.pending && Date.now() < this.pending.expiresAt) return { ok: true, message: "Açık Instagram bağlantısı bekleniyor. Tarayıcıdaki giriş işlemini tamamlayın." };
      const epoch = this.connectionEpoch;
      const verifier = randomBytes(32).toString("base64url");
      const data = await this.endpoint({ action: "start", challenge: createHash("sha256").update(verifier).digest("hex") });
      if (typeof data.sessionId !== "string" || !/^[a-f0-9]{64}$/.test(data.sessionId) ||
          typeof data.authorizationUrl !== "string") throw new Error("Instagram bağlantı cevabı geçersiz.");
      const url = new URL(data.authorizationUrl);
      if (url.origin !== "https://www.instagram.com" || url.pathname !== "/oauth/authorize" ||
          url.searchParams.get("state") !== data.sessionId) throw new Error("Instagram giriş adresi geçersiz.");
      this.assertUnlocked();
      if (epoch !== this.connectionEpoch) return { ok: false, message: "Instagram bağlantısı iptal edildi." };
      this.pending = { verifier, sessionId: data.sessionId, expiresAt: Date.now() + 600_000 };
      try { await shell.openExternal(url.href); }
      catch { this.pending = null; throw new Error("Tarayıcıda Instagram giriş ekranı açılamadı."); }
      return { ok: true, message: "Tarayıcıda Instagram'a giriş yapıp paylaşım izni verin." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Instagram bağlantısı başlatılamadı." };
    }
  }
  async poll(): Promise<InstagramOAuthProgress> {
    if (!this.pending) return { status: "failed", message: "Aktif Instagram bağlantı işlemi bulunamadı." };
    if (Date.now() > this.pending.expiresAt) {
      this.pending = null;
      return { status: "failed", message: "Instagram giriş süresi doldu. Yeniden bağlanmayı deneyin." };
    }
    if (this.inFlight) return { status: "pending" };
    this.inFlight = true;
    const epoch = this.connectionEpoch;
    try {
      const data = await this.endpoint({ action: "claim", sessionId: this.pending.sessionId, verifier: this.pending.verifier });
      if (epoch !== this.connectionEpoch) return { status: "failed", message: "Instagram bağlantı işlemi iptal edildi." };
      if (data.status === "pending") return { status: "pending" };
      if (data.status !== "connected" || !providerObject(data.connection)) {
        this.pending = null; return { status: "failed", message: "Instagram yetkilendirmesi tamamlanamadı." };
      }
      const value = data.connection;
      if (typeof value.accountId !== "string" || !/^\d{1,40}$/.test(value.accountId) ||
          typeof value.accessToken !== "string" || !/^[A-Za-z0-9_.|=-]{1,4096}$/.test(value.accessToken) ||
          typeof value.username !== "string" || !/^[A-Za-z0-9_.]{1,64}$/.test(value.username) ||
          typeof value.expiresAt !== "string") throw new Error("Instagram hesap bilgileri geçersiz.");
      this.canEncrypt();
      const verified = await new InstagramPublishingProviderAdapter({
        accountId: value.accountId, accessToken: value.accessToken
      }, { fetchImpl: this.fetchImpl }).getAccountProfile();
      if (verified.username !== value.username) throw new Error("Instagram hesap doğrulaması uyuşmuyor.");
      const encryptedToken = "safe-storage:v1:" + safeStorage.encryptString(value.accessToken).toString("base64");
      this.assertUnlocked();
      if (epoch !== this.connectionEpoch) return { status: "failed", message: "Instagram bağlantı işlemi iptal edildi." };
      this.connectionEpoch++;
      this.database().saveInstagramOAuthConnection({
        accountId: value.accountId, username: verified.username, encryptedToken, expiresAt: value.expiresAt
      });
      this.database().recordServiceSettingsVerification("instagram", { accountId: value.accountId, accessToken: value.accessToken });
      this.pending = null;
      return { status: "connected", username: verified.username };
    } catch (error) {
      // The server grant may be one-time consumed. Restarting requires explicit user action.
      this.pending = null;
      return { status: "failed", message: error instanceof Error ? error.message : "Instagram bağlantısı doğrulanamadı." };
    } finally { this.inFlight = false; }
  }
  setEnabled(enabled: boolean) {
    this.assertUnlocked();
    this.database().setInstagramOAuthEnabled(enabled);
    this.connectionEpoch++;
    return this.database().getInstagramConfiguration();
  }
  disconnect() {
    this.connectionEpoch++;
    this.pending = null;
    this.database().disconnectInstagramOAuthConnection();
    return this.database().getInstagramConfiguration();
  }
  async refreshIfNeeded() {
    const cfg = this.database().getInstagramConfiguration();
    if (!cfg.configured || !cfg.expiresAt || Date.parse(cfg.expiresAt) - Date.now() > 30 * 86400_000) return;
    if (this.inFlight) return;
    const row = this.database().getStoredMarketingProvider("instagram_api");
    const token = decryptMessagingSecret(String(row?.secret_one_encrypted ?? ""));
    if (!token) return;
    this.inFlight = true;
    const epoch = this.connectionEpoch;
    try {
      const url = new URL("https://graph.instagram.com/refresh_access_token");
      url.searchParams.set("grant_type", "ig_refresh_token");
      url.searchParams.set("access_token", token);
      const { response, data } = await providerJson(url.href, { method: "GET" }, { fetchImpl: this.fetchImpl, timeoutMs: 15000 });
      if (!response.ok || typeof data.access_token !== "string" || !/^[A-Za-z0-9_.|=-]{1,4096}$/.test(data.access_token)) return;
      const expiry = new Date(Date.now() + Math.max(1, Math.min(5184000, Number(data.expires_in) || 5184000)) * 1000).toISOString();
      this.canEncrypt();
      this.assertUnlocked();
      // A disconnect/reconnect during the HTTP request invalidates this response.
      if (epoch !== this.connectionEpoch ||
          this.database().getStoredMarketingProvider("instagram_api")?.secret_one_encrypted !== row?.secret_one_encrypted) return;
      this.database().saveInstagramOAuthConnection({
        accountId: cfg.accountId, username: cfg.username, expiresAt: expiry,
        encryptedToken: "safe-storage:v1:" + safeStorage.encryptString(data.access_token).toString("base64")
      });
      this.database().recordServiceSettingsVerification("instagram", { accountId: cfg.accountId, accessToken: data.access_token });
    } catch { /* Refresh failures never invalidate the existing token. */ }
    finally { this.inFlight = false; }
  }
}
