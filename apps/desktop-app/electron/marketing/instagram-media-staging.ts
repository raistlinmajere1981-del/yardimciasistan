import { MarketingProviderError, providerJson } from "./provider-http";
/** Temporary, binary-only transport. Neither this client nor hosting owns MediaAssets. */
export class InstagramMediaStaging {
  constructor(private readonly options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {}
  private base(baseUrl: string): string {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new MarketingProviderError("staging_unconfigured");
    return url.href.replace(/\/$/, "");
  }
  async upload(config: { baseUrl: string; syncSecret: string }, stage: { token: string; expiresAt: string }, bytes: Buffer): Promise<string> {
    if (!/^[a-f0-9]{64}$/.test(stage.token) || !bytes.length || bytes.length > 8388608 || !config.syncSecret) throw new MarketingProviderError("invalid_media");
    const form = new FormData(); form.set("operation","upload");form.set("token",stage.token);form.set("expires",String(Math.floor(Date.parse(stage.expiresAt)/1000)));
    form.set("file",new Blob([new Uint8Array(bytes)],{type:"image/jpeg"}),"image.jpg");
    const base = this.base(config.baseUrl);
    const { response, data } = await providerJson(`${base}/api/instagram-media.php`,{method:"POST",headers:{"X-YA-Sync-Secret":config.syncSecret},body:form},this.options);
    if (!response.ok || data.ok !== true) throw new MarketingProviderError("staging_failed",false,"transient");
    return `${base}/api/instagram-media.php/${stage.token}.jpg`;
  }
  async cleanup(config: { baseUrl: string; syncSecret: string }, token: string) {
    if (!/^[a-f0-9]{64}$/.test(token) || !config.syncSecret) throw new MarketingProviderError("staging_unconfigured");
    const form = new FormData();form.set("operation","delete");form.set("token",token);
    const { response, data } = await providerJson(`${this.base(config.baseUrl)}/api/instagram-media.php`,{method:"POST",headers:{"X-YA-Sync-Secret":config.syncSecret},body:form},this.options);
    if (!response.ok || data.ok !== true) throw new MarketingProviderError("staging_cleanup_failed");
  }
}
