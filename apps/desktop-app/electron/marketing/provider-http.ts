/** Bounded JSON HTTP boundary. Errors expose only application-owned codes/messages. */
export class MarketingProviderError extends Error {
  constructor(readonly code: string, readonly rejected = false, readonly retry: "none" | "transient" | "rate_limit" = "none") {
    super(code === "unconfigured" ? "Servis yapılandırılmamış." : code === "invalid_token" ? "Servis erişim anahtarı geçersiz veya süresi dolmuş." : code === "iys_rejected" ? "Sağlayıcı İYS kontrolü gönderimi reddetti." : "Sağlayıcı işlemi tamamlanamadı.");
  }
}
export const providerObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
export async function providerJson(url: string, init: RequestInit, options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, { ...init, redirect: "error", signal: controller.signal });
    if (!response.body) throw new MarketingProviderError("invalid_response");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
        if (size > 1048576) { await reader.cancel(); throw new MarketingProviderError("response_too_large"); } chunks.push(part.value); }
    } finally { reader.releaseLock(); }
    let data: unknown; try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new MarketingProviderError("invalid_response"); }
    if (!providerObject(data)) throw new MarketingProviderError("invalid_response");
    return { response, data };
  } catch (error) {
    if (error instanceof MarketingProviderError) throw error;
    throw new MarketingProviderError(controller.signal.aborted ? "timeout" : "network", false, "transient");
  } finally { clearTimeout(timer); }
}
