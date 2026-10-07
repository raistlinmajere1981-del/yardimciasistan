/** Static capability metadata shared by provider selection and Settings presentation. */
export function supportsImageGenerationModel(service: string, model: string): boolean {
  return service === "gemini" ? /^gemini-[\w.-]*image[\w.-]*$/.test(model)
    : ["openai", "custom"].includes(service) && /^gpt-image-[\w.-]+$/.test(model);
}

export function imageGenerationModelOptions(service: string, models: readonly string[]): string[] {
  return [...new Set([...(service === "openai" ? ["gpt-image-1"] : []), ...models])]
    .filter(model => supportsImageGenerationModel(service, model));
}
