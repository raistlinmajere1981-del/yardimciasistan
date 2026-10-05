import { MarketingProviderError, providerJson, providerObject as object } from "../marketing/provider-http";
export interface IletiMerkeziCredentials { apiKey: string; apiHash: string; senderId: string; iysList: "BIREYSEL" | "TACIR" }
/** Official JSON API; order/reference and transport error normalization stay in this adapter. */
export class IletiMerkeziSmsProviderAdapter {
  readonly providerId = "iletimerkezi";
  readonly supportsIys = true;
  constructor(private readonly credentials: IletiMerkeziCredentials, private readonly options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
    if (![credentials.apiKey, credentials.apiHash].every(v => /^[A-Za-z0-9_.|=-]{1,4096}$/.test(v)) || !/^[A-Za-z0-9 ]{1,11}$/.test(credentials.senderId) || credentials.senderId === "APITEST" || !["BIREYSEL", "TACIR"].includes(credentials.iysList)) throw new MarketingProviderError("unconfigured");
  }
  private async request(endpoint: "get-balance" | "get-sender" | "send-sms" | "get-report", fields = {}) {
    const { data, response } = await providerJson(`https://api.iletimerkezi.com/v1/${endpoint}/json`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: { authentication: { key: this.credentials.apiKey, hash: this.credentials.apiHash }, ...fields } })
    }, this.options);
    if (!object(data.response) || !object(data.response.status) || !Number.isInteger(data.response.status.code)) throw new MarketingProviderError("invalid_response");
    const code = Number(data.response.status.code);
    if (!response.ok || code !== 200) {
      // Duplicate-order rejection may refer to a previous accepted request; never reopen its fence.
      const rejected = code !== 451 && code >= 400 && code <= 599 && !data.response.order;
      const retry = code === 429 ? "rate_limit" : code === 503 ? "transient" : "none";
      throw new MarketingProviderError(code === 401 ? "invalid_token" : [403, 468, 469, 470].includes(code) ? "iys_rejected" : code === 451 ? "submission_uncertain" : `provider_${code}`, rejected, retry);
    }
    return data.response;
  }
  async testConnection() {
    const data = await this.request("get-balance");
    if (!object(data.balance) || !Number.isFinite(data.balance.amount) || !Number.isInteger(data.balance.sms)) throw new MarketingProviderError("invalid_response");
    const senderIds = await this.listSenderIds();
    if (!senderIds.includes(this.credentials.senderId)) throw new MarketingProviderError("sender_unavailable");
    return { senderIds };
  }
  async listSenderIds(): Promise<string[]> {
    const data = await this.request("get-sender");
    if (!object(data.senders) || !Array.isArray(data.senders.sender) || data.senders.sender.length > 200 || !data.senders.sender.every(v => typeof v === "string" && /^[A-Za-z0-9 ]{1,11}$/.test(v))) throw new MarketingProviderError("invalid_response");
    return data.senders.sender as string[];
  }
  async sendMessage(input: { recipient: string; text: string }) {
    if (!/^\d{7,15}$/.test(input.recipient) || !input.text.trim() || input.text.length > 160 || /<\/?[A-Za-z][^>]*>|[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.text)) throw new MarketingProviderError("invalid_message", true);
    const data = await this.request("send-sms", { order: { sender: this.credentials.senderId, iys: "1", iysList: this.credentials.iysList,
      message: { text: input.text, receipents: { number: [input.recipient] } } } });
    if (!object(data.order) || typeof data.order.id !== "string" || !/^\d{1,64}$/.test(data.order.id)) throw new MarketingProviderError("invalid_response");
    return { providerMessageId: data.order.id };
  }
  async getDeliveryReport(orderId: string): Promise<{ status: "accepted" | "delivered" | "failed" }> {
    if (!/^\d{1,64}$/.test(orderId)) throw new MarketingProviderError("invalid_reference");
    const data = await this.request("get-report", { order: { id: orderId, page: "1", rowCount: "1" } });
    if (!object(data.order) || data.order.id !== orderId || Number(data.order.total) !== 1 || ![113,114,115].includes(Number(data.order.status))) throw new MarketingProviderError("invalid_response");
    return { status: Number(data.order.delivered) === 1 ? "delivered" : Number(data.order.undelivered) === 1 || Number(data.order.status) === 115 ? "failed" : "accepted" };
  }
}
