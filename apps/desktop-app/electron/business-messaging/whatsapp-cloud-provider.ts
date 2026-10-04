import type { BusinessMessagingProviderAdapter, BusinessMessageTemplate } from "@yardimci-asistan/shared";
import { BusinessMessagingError } from "./provider-error";
export const WHATSAPP_GRAPH_API_VERSION = "v25.0";
export interface WhatsAppCloudCredentials { wabaId: string; phoneNumberId: string; accessToken: string }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit = 512): value is string => typeof value === "string" && value.length > 0 && value.length <= limit;
export class WhatsAppCloudProviderAdapter implements BusinessMessagingProviderAdapter {
  readonly providerId = "whatsapp_cloud";
  constructor(private readonly credentials: WhatsAppCloudCredentials,
    private readonly options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
    if (![credentials.wabaId, credentials.phoneNumberId].every((id) => /^\d{1,40}$/.test(id)) || !/^[A-Za-z0-9_.|-]{1,4096}$/.test(credentials.accessToken)) throw new BusinessMessagingError("unconfigured", "WhatsApp Business yapılandırılmamış.");
  }
  private async request(path: string, body?: unknown): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15000);
    try {
      const response = await (this.options.fetchImpl ?? fetch)(`https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${path}`, {
        method: body ? "POST" : "GET", redirect: "error", signal: controller.signal,
        headers: { Authorization: `Bearer ${this.credentials.accessToken}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (!response.body) throw new BusinessMessagingError("invalid_response");
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
          if (size > 1048576) { await reader.cancel(); throw new BusinessMessagingError("response_too_large"); } chunks.push(part.value); }
      } finally { reader.releaseLock(); }
      let data: unknown;
      try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new BusinessMessagingError("invalid_response"); }
      if (!object(data)) throw new BusinessMessagingError("invalid_response");
      if (!response.ok || data.error) {
        const code = object(data.error) && Number.isSafeInteger(data.error.code) ? `provider_${data.error.code}` : `http_${response.status}`;
        // Provider code allowlist stays here, never in the campaign worker/domain policy.
        const providerCode = object(data.error) && Number.isSafeInteger(data.error.code) ? Number(data.error.code) : 0;
        const throttled = response.status === 429 || [4, 80007, 130429, 131056].includes(providerCode);
        const retry = throttled ? "rate_limit" : response.status >= 500 || (object(data.error) && data.error.is_transient === true) ? "transient" : "none";
        const after = response.headers.get("retry-after");
        const delay = after && /^\d{1,6}$/.test(after) ? Number(after) * 1000 : after ? Date.parse(after) - Date.now() : 0;
        // A structured error proves rejection. A malformed 5xx or lost response does not prove non-submission.
        throw new BusinessMessagingError(code, "WhatsApp Business sağlayıcısı isteği kabul etmedi.", {
          rejected: object(data.error) && Number.isSafeInteger(data.error.code) && !data.messages, retry, ...(Number.isFinite(delay) && delay > 0 ? { retryAfterMs: Math.min(delay, 86400000) } : {})
        });
      }
      return data;
    } catch (error) {
      if (controller.signal.aborted) throw new BusinessMessagingError("timeout", "WhatsApp Business isteği zaman aşımına uğradı.");
      if (error instanceof BusinessMessagingError) throw error;
      throw new BusinessMessagingError("network", "WhatsApp Business bağlantısı kurulamadı.");
    } finally { clearTimeout(timer); }
  }
  /** Verify both token access and membership; never accept an unrelated accessible phone id. */
  async testConnection() {
    const phones = await this.paginated(`${this.credentials.wabaId}/phone_numbers?fields=id,display_phone_number&limit=100`);
    const phone = phones.find((row) => row.id === this.credentials.phoneNumberId);
    if (!phone) throw new BusinessMessagingError("account_mismatch", "Telefon kimliği bu WhatsApp Business hesabına ait değil.");
    const direct = await this.request(`${this.credentials.phoneNumberId}?fields=id,display_phone_number`);
    if (direct.id !== phone.id || !text(direct.display_phone_number, 40) || !/^[+\d ()-]+$/.test(direct.display_phone_number)) throw new BusinessMessagingError("invalid_response");
    return { displayPhoneNumber: direct.display_phone_number };
  }
  private async paginated(path: string) {
    const rows: Record<string, unknown>[] = []; let cursor = "";
    for (let page = 0; page < 5; page++) {
      const data = await this.request(path + (cursor ? `&after=${encodeURIComponent(cursor)}` : ""));
      if (!Array.isArray(data.data) || data.data.length > 100 || !data.data.every(object)) throw new BusinessMessagingError("invalid_response");
      rows.push(...data.data);
      if (data.paging !== undefined && !object(data.paging)) throw new BusinessMessagingError("invalid_response");
      if (!object(data.paging) || !data.paging.next) return rows;
      const cursors = data.paging.cursors;
      if (!object(cursors) || !text(cursors.after, 1024) || cursors.after === cursor) throw new BusinessMessagingError("invalid_response");
      cursor = cursors.after; // Never follow provider-returned URLs.
    }
    throw new BusinessMessagingError("catalog_limit", "Sağlayıcı kataloğu bu sürümün sınırını aşıyor.");
  }
  async listTemplates(): Promise<BusinessMessageTemplate[]> {
    const rows = await this.paginated(`${this.credentials.wabaId}/message_templates?fields=name,language,category,status,components&limit=100`);
    return rows.filter((row) => row.status === "APPROVED").map((row) => {
      if (!text(row.name, 512) || !/^[a-z0-9_]+$/.test(row.name) || !text(row.language, 40) || !/^[a-zA-Z_]+$/.test(row.language) || !text(row.category, 40) || !Array.isArray(row.components) || row.components.length > 20) throw new BusinessMessagingError("invalid_response");
      const template: BusinessMessageTemplate = { name: row.name, language: row.language, category: row.category, status: "APPROVED", supported: true, components: [] };
      for (const component of row.components) {
        if (!object(component) || !text(component.type, 40)) throw new BusinessMessagingError("invalid_response");
        if (component.type === "FOOTER") continue;
        if (!["HEADER", "BODY"].includes(component.type) || (component.type === "HEADER" && component.format !== "TEXT")) { template.supported = false; continue; }
        if (typeof component.text !== "string" || component.text.length > 10000) throw new BusinessMessagingError("invalid_response");
        const names = [...component.text.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)].map((match) => match[1]);
        const parameters = [...new Set(names)];
        if (/\{\{|\}\}/.test(component.text.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, ""))) template.supported = false;
        if (parameters.length > 30) throw new BusinessMessagingError("invalid_response");
        const numbered = parameters.every((name) => /^\d+$/.test(name));
        if (numbered) parameters.sort((a, b) => Number(a) - Number(b));
        if (numbered && parameters.some((name, index) => Number(name) !== index + 1)) template.supported = false;
        if (!numbered && parameters.some((name) => /^\d+$/.test(name))) template.supported = false;
        template.components.push({ type: component.type === "HEADER" ? "header" : "body", text: component.text, parameters });
      }
      return template;
    });
  }
  async sendTemplateMessage(input: Parameters<BusinessMessagingProviderAdapter["sendTemplateMessage"]>[0]) {
    const components = input.template.components.flatMap((component, index) => component.parameters.length ? [{
      type: component.type, parameters: component.parameters.map((name, param) => ({ type: "text", text: input.parameters[index][param], ...(/^\d+$/.test(name) ? {} : { parameter_name: name }) }))
    }] : []);
    const result = await this.request(`${this.credentials.phoneNumberId}/messages`, {
      messaging_product: "whatsapp", to: input.message.recipient, type: "template",
      biz_opaque_callback_data: input.message.id,
      template: { name: input.template.name, language: { code: input.template.language }, components }
    });
    if (result.messaging_product !== "whatsapp" || !Array.isArray(result.messages) || result.messages.length !== 1 || !object(result.messages[0]) || !text(result.messages[0].id, 512) || !/^[A-Za-z0-9_.=:-]+$/.test(result.messages[0].id)) throw new BusinessMessagingError("invalid_response");
    return { providerMessageId: result.messages[0].id as string };
  }
}
