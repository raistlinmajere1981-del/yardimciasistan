import { INSTAGRAM_API_VERSION, INSTAGRAM_PUBLISH_SCOPES } from "@yardimci-asistan/shared";
import { MarketingProviderError, providerJson, providerObject as object } from "./provider-http";
export interface InstagramCredentials { accountId: string; accessToken: string }
/** Instagram Login: professional account directly, no Facebook Page dependency. */
export class InstagramPublishingProviderAdapter {
  readonly providerId = "instagram_api";
  readonly scopes = INSTAGRAM_PUBLISH_SCOPES;
  constructor(private readonly credentials: InstagramCredentials, private readonly options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
    if (!/^\d{1,40}$/.test(credentials.accountId) || !/^[A-Za-z0-9_.|=-]{1,4096}$/.test(credentials.accessToken)) throw new MarketingProviderError("unconfigured");
  }
  private async request(path: string, body?: Record<string, string>) {
    const { data, response } = await providerJson(`https://graph.instagram.com/${INSTAGRAM_API_VERSION}/${path}`, {
      method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${this.credentials.accessToken}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      ...(body ? { body: new URLSearchParams(body).toString() } : {})
    }, this.options);
    if (!response.ok || data.error) {
      const code = object(data.error) ? Number(data.error.code) : 0;
      const rejected = object(data.error) && Number.isInteger(data.error.code) && !data.id;
      throw new MarketingProviderError(code === 190 ? "invalid_token" : code ? `provider_${code}` : `http_${response.status}`, rejected,
        response.status === 429 || [4,80007].includes(code) ? "rate_limit" : response.status >= 500 || (object(data.error) && data.error.is_transient === true) ? "transient" : "none");
    }
    return data;
  }
  async getAccountProfile() {
    // /me proves the supplied account belongs to the token, not merely an accessible unrelated id.
    const data = await this.request("me?fields=id,user_id,username,account_type");
    if (![data.id, data.user_id].includes(this.credentials.accountId) || typeof data.username !== "string" || !/^[A-Za-z0-9_.]{1,64}$/.test(data.username) || !["BUSINESS", "MEDIA_CREATOR"].includes(String(data.account_type))) throw new MarketingProviderError("professional_account_required");
    return { username: data.username, accountType: data.account_type as "BUSINESS" | "MEDIA_CREATOR" };
  }
  testConnection() { return this.getAccountProfile(); }
  async createImageContainer(input: { imageUrl: string; caption: string }) {
    const url = new URL(input.imageUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || input.caption.length > 2200) throw new MarketingProviderError("invalid_media");
    const data = await this.request(`${this.credentials.accountId}/media`, { image_url: url.href, caption: input.caption });
    return { containerId: this.id(data.id) };
  }
  async getContainerStatus(containerId: string) {
    const data = await this.request(`${this.id(containerId)}?fields=status_code`);
    if (!["IN_PROGRESS","FINISHED","PUBLISHED","ERROR","EXPIRED"].includes(String(data.status_code))) throw new MarketingProviderError("invalid_response");
    return { status: data.status_code as "IN_PROGRESS" | "FINISHED" | "PUBLISHED" | "ERROR" | "EXPIRED" };
  }
  async publishContainer(containerId: string) {
    const data = await this.request(`${this.credentials.accountId}/media_publish`, { creation_id: this.id(containerId) });
    return { providerMediaId: this.id(data.id) };
  }
  async getMediaPermalink(mediaId: string) {
    const data = await this.request(`${this.id(mediaId)}?fields=permalink`);
    if (typeof data.permalink !== "string" || data.permalink.length > 2048) throw new MarketingProviderError("invalid_response");
    const url = new URL(data.permalink);
    if (url.protocol !== "https:" || !["www.instagram.com","instagram.com"].includes(url.hostname) || url.search || url.hash || url.username || url.password || !/^\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) throw new MarketingProviderError("invalid_response");
    return url.href;
  }
  private id(value: unknown): string { if (typeof value !== "string" || !/^\d{1,64}$/.test(value)) throw new MarketingProviderError("invalid_response"); return value; }
}
