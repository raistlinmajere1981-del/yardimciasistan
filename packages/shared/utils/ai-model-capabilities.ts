import { CLOUDFLARE_AI_MODELS, isCloudflareAiBaseUrl } from "./cloudflare-ai";
/** Static capability metadata shared by provider selection and Settings presentation. */
export function supportsImageGenerationModel(service: string, model: string): boolean {
  if (service === "cloudflare") return model === CLOUDFLARE_AI_MODELS.image;
  return service === "gemini" ? /^gemini-[\w.-]*image[\w.-]*$/.test(model)
    : ["openai", "custom"].includes(service) && /^gpt-image-[\w.-]+$/.test(model);
}

export function imageGenerationModelOptions(service: string, models: readonly string[]): string[] {
  return [...new Set([...(service === "openai" ? ["gpt-image-1"] : service === "cloudflare" ? [CLOUDFLARE_AI_MODELS.image] : []), ...models])]
    .filter(model => supportsImageGenerationModel(service, model));
}

/** Documented audio input contracts; account access needs a separate real audio test. */
export function sttModelOptions(service: string): readonly string[] {
  switch (service) {
    case "cloudflare": return [CLOUDFLARE_AI_MODELS.stt];
    case "openai": return ["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"];
    case "gemini": return ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-2.5-flash"];
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
