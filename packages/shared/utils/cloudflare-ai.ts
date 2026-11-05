const ACCOUNT_PREFIX = "https://api.cloudflare.com/client/v4/accounts/";

/** Also represents incomplete Settings drafts; validate before persistence/transport. */
export function cloudflareAiBaseUrl(accountId: string): string {
  return accountId ? `${ACCOUNT_PREFIX}${accountId.trim()}/ai` : "";
}

export function cloudflareAiAccountId(baseUrl: string): string {
  return baseUrl.startsWith(ACCOUNT_PREFIX) && baseUrl.endsWith("/ai")
    ? baseUrl.slice(ACCOUNT_PREFIX.length, -3) : "";
}

/** Exact root excludes redirects, ports, userinfo, path overrides, queries and fragments. */
export function isCloudflareAiBaseUrl(baseUrl: string): boolean {
  return /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[a-fA-F0-9]{32}\/ai\/?$/.test(baseUrl);
}

export function isCloudflareAiModelId(model: string): boolean {
  return model.length <= 160 && /^@cf\/[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_.-]*$/i.test(model);
}

/** Cloudflare task is verified separately using live catalog metadata. */
export function supportsVisionModel(service: string, model: string): boolean {
  return service === "cloudflare" && isCloudflareAiModelId(model);
}
