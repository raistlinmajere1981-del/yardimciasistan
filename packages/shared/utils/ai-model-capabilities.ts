import { isCloudflareAiModelId, isCloudflareAiBaseUrl } from "./cloudflare-ai";
/** Static capability metadata shared by provider selection and Settings presentation. */
export function supportsImageGenerationModel(service: string, model: string): boolean {
  if (service === "cloudflare") return isCloudflareAiModelId(model);
  return service === "gemini" ? /^gemini-[\w.-]*image[\w.-]*$/.test(model)
    : ["openai", "custom"].includes(service) && /^gpt-image-[\w.-]+$/.test(model);
}

export function imageGenerationModelOptions(service: string, models: readonly string[]): string[] {
  return [...new Set([...(service === "openai" ? ["gpt-image-1"] : []), ...models])]
    .filter(model => supportsImageGenerationModel(service, model));
}

/** Adapter-supported models, not an account catalog or inference entitlement.
 * Cloudflare additionally requires live catalog task metadata. A new ASR model
 * must get an explicit compatible transport before it can receive audio.
 * Refresh the Hosting snapshot with scripts/sync-stt-model-policy.mjs.
 */
export const STT_MODEL_POLICY = {
  cloudflare: ["@cf/openai/whisper-large-v3-turbo"],
  openai: ["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"],
  gemini: ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-2.5-flash"]
} as const;

export function sttModelOptions(service: string): readonly string[] {
  switch (service) {
    case "cloudflare": return STT_MODEL_POLICY.cloudflare;
    case "openai": return STT_MODEL_POLICY.openai;
    case "gemini": return STT_MODEL_POLICY.gemini;
    default: return [];
  }
}

export function supportsSttModel(service: string, model: string): boolean {
  return sttModelOptions(service).includes(model);
}

/** STT only sends credentials/audio to the official provider origin and API root. */
export function isSupportedSttBaseUrl(service: string, baseUrl: string): boolean {
  if (service === "cloudflare") return isCloudflareAiBaseUrl(baseUrl);
  const expected = service === "openai" ? "https://api.openai.com/v1"
    : service === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" : "";
  return Boolean(expected) && baseUrl.replace(/\/+$/, "") === expected;
}
