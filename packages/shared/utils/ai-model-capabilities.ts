/** Static capability metadata shared by provider selection and Settings presentation. */
export function supportsImageGenerationModel(service: string, model: string): boolean {
  return service === "gemini" ? /^gemini-[\w.-]*image[\w.-]*$/.test(model)
    : ["openai", "custom"].includes(service) && /^gpt-image-[\w.-]+$/.test(model);
}

export function imageGenerationModelOptions(service: string, models: readonly string[]): string[] {
  return [...new Set([...(service === "openai" ? ["gpt-image-1"] : []), ...models])]
    .filter(model => supportsImageGenerationModel(service, model));
}

/** Explicitly verified audio input models; chat discovery is not audio capability evidence. */
export function sttModelOptions(service: string): readonly string[] {
  switch (service) {
    case "openai": return ["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"];
    case "gemini": return ["gemini-2.5-flash"];
    default: return [];
  }
}

export function supportsSttModel(service: string, model: string): boolean {
  return sttModelOptions(service).includes(model);
}

/** STT only sends credentials/audio to the official provider origin and API root. */
export function isSupportedSttBaseUrl(service: string, baseUrl: string): boolean {
  const expected = service === "openai" ? "https://api.openai.com/v1"
    : service === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" : "";
  return Boolean(expected) && baseUrl.replace(/\/+$/, "") === expected;
}
