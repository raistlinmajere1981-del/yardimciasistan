/** Documented API candidates. Static metadata never proves account access or free quota. */
export const CLOUDFLARE_AI_MODELS = {
  text: "@cf/zai-org/glm-4.7-flash",
  vision: "@cf/meta/llama-4-scout-17b-16e-instruct",
  image: "@cf/black-forest-labs/flux-1-schnell",
  stt: "@cf/openai/whisper-large-v3-turbo"
} as const;

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

export function supportsVisionModel(service: string, model: string): boolean {
  return service === "cloudflare" && model === CLOUDFLARE_AI_MODELS.vision;
}
