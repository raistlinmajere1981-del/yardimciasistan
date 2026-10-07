import type { AIProviderConfig } from "../types";
import { supportsImageGenerationModel } from "@yardimci-asistan/shared";
export interface GeneratedImage { bytes: Uint8Array; mimeType: "image/png"; providerId: string; modelId: string }
export function imageModelForProfile(service: string, models: readonly string[]): string | undefined {
  const configured = models.find(model => supportsImageGenerationModel(service, model));
  if (configured && ["openai", "custom", "gemini"].includes(service)) return configured;
  // An existing configured OpenAI account can use its image endpoint independently of its chat model.
  if (service === "openai") return "gpt-image-1";
  return undefined;
}
export async function generateConfiguredImage(config: AIProviderConfig, prompt: string, aspect: "square" | "landscape" | "portrait", fetchImpl: typeof fetch = globalThis.fetch): Promise<GeneratedImage> {
  if (!config.enabled || !config.apiKey || !config.model || !imageModelForProfile(config.service ?? "",[config.model])) throw new Error("image_capability_unavailable");
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 120000);
  try {
    const gemini = config.service === "gemini";
    const base = config.baseUrl.replace(/\/+$/, "");
    const endpoint = gemini
      ? `${base.replace(/\/openai$/, "")}/models/${encodeURIComponent(config.model)}:generateContent`
      : `${base}/images/generations`;
    const response = await fetchImpl(endpoint, { method:"POST",redirect:"error",signal:controller.signal,
      headers:{"Content-Type":"application/json",...(gemini?{"x-goog-api-key":config.apiKey}:{Authorization:`Bearer ${config.apiKey}`})},
      body:JSON.stringify(gemini ? { contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:["TEXT","IMAGE"],imageConfig:{aspectRatio:aspect==="landscape"?"3:2":aspect==="portrait"?"2:3":"1:1"}} }
        : {model:config.model,prompt,n:1,size:aspect==="landscape"?"1536x1024":aspect==="portrait"?"1024x1536":"1024x1024",output_format:"png"}) });
    if (!response.ok) throw new Error("image_generation_failed");
    // Bound provider output before parsing; do not retain or log provider error bodies or prompts.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("image_generation_failed");
    const chunks: Uint8Array[] = []; let size=0;
    for (;;) { const item=await reader.read(); if (item.done) break; size+=item.value.length;
      if (size>42*1024*1024) { await reader.cancel(); throw new Error("image_too_large"); } chunks.push(item.value); }
    const joined=new Uint8Array(size); let offset=0; for (const chunk of chunks) {joined.set(chunk,offset);offset+=chunk.length;}
    const payload=JSON.parse(new TextDecoder().decode(joined));
    const encoded = gemini ? payload.candidates?.[0]?.content?.parts?.find((p: {inlineData?:{mimeType?:string}}) => p.inlineData?.mimeType === "image/png")?.inlineData?.data : payload.data?.[0]?.b64_json;
    if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("invalid_image_output");
    const bytes = Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
    if (!bytes.length || bytes.length>30*1024*1024) throw new Error("invalid_image_output");
    return {bytes,mimeType:"image/png",providerId:config.service ?? config.provider,modelId:config.model};
  } finally { clearTimeout(timeout); }
}
