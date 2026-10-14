import { CloudflareAiError, generateConfiguredChat, generateConfiguredImage, imageModelForProfile, type AIProviderConfig } from "@yardimci-asistan/ai-core";
import { normalizeGeneratedImagePng } from "../generated-image-normalization";
import { BUSINESS_CAPABILITIES as C, hasBusinessCapability, evaluateBusinessAiInput, businessAiBoundaryReply, buildBusinessAiAuthorityPrompt, type MarketingAiCapability, type MarketingAiInput } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { getEffectiveAiApiKey } from "../ai-secret-service";
import { MarketingError, marketingText, marketingChannel } from "./validation";

/** Selected configured profile first, then other configured capable profiles. No renderer provider coupling.
 * @compiledSmoke scripts/smoke-settings-correctness.mjs (dist-electron VM) */
export function resolveMarketingAi(db: DesktopDatabase, capability: MarketingAiCapability): AIProviderConfig | undefined {
  if (!hasBusinessCapability(db.getEnabledBusinessCapabilities(),C.AI)) return;
  const setup=db.getSetupData();
  const profiles=[...setup.aiProfiles].sort((a,b)=>Number(b.service===setup.aiService)-Number(a.service===setup.aiService));
  for (const profile of profiles) {
    if (!profile.apiKeyConfigured || !profile.baseUrl) continue;
    const model=capability==="image_generation"?(profile.imageModel || (profile.service === "cloudflare" ? undefined : imageModelForProfile(profile.service,[profile.model,...profile.modelOptions.map(m=>m.id)]))):profile.model;
    if (!model) continue;
    const key=getEffectiveAiApiKey(db,profile.service); if (!key) continue;
    return {enabled:true,provider:"openai_compatible",service:profile.service,baseUrl:profile.baseUrl,model,apiKey:key,timeoutMs:profile.timeoutSeconds*1000};
  }
}
/** Privacy boundary: never enrich requests with Customers, recipient lists, messages or credentials. */
function sanitizeMarketingAiText(value: string, privateNames: readonly string[]): string {
  let text=value;
  for (const name of [...privateNames].sort((a,b)=>b.length-a.length)) {
    if (name.trim().length<2) continue;
    text=text.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"giu"),"[kişi]");
  }
  return text.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,"[iletişim]")
    .replace(/(?:\+?\d[\s().-]*){7,}/g,"[iletişim]")
    .replace(/\b(?:sk-|AIza|Bearer\s+)[A-Za-z0-9_./+-]+/gi,"[gizli]")
    .replace(/\b(?:password|parola|şifre|token|api[_ -]?key|secret)\s*[:=]\s*\S+/gi,"[gizli]");
}
export class MarketingAiService {
  constructor(private readonly database:()=>DesktopDatabase) {}
  capabilities(): MarketingAiCapability[] { return (["text_generation","rewrite","channel_adaptation","image_generation"] as const).filter(c=>Boolean(resolveMarketingAi(this.database(),c))); }
  async generate(input: MarketingAiInput) {
    if (!["text_generation","rewrite","channel_adaptation","image_generation"].includes(input.capability)) throw new MarketingError("invalid_input","AI işlemi geçersiz.");
    const db=this.database(), config=resolveMarketingAi(db,input.capability);
    if (!config) throw new MarketingError("ai_unavailable","Uygun AI servisi yapılandırılmamış.");
    const names=db.marketingPrivateNames();
    const text=sanitizeMarketingAiText(marketingText(input.text,12000),names), instructions=sanitizeMarketingAiText(marketingText(input.instructions,2000),names);
    const style=sanitizeMarketingAiText(marketingText(input.styleHints??"",500),names);
    const capabilities=db.getEnabledBusinessCapabilities();
    const boundaryReply=businessAiBoundaryReply(evaluateBusinessAiInput(capabilities,"",`${text}\n${instructions}\n${style}`));
    if (boundaryReply) throw new MarketingError("unsupported_business_domain",boundaryReply);
    const authority=buildBusinessAiAuthorityPrompt(capabilities);
    if (input.capability==="image_generation") {
      if (input.aspect && !["square","landscape","portrait"].includes(input.aspect)) throw new MarketingError("invalid_input","Görsel oranı geçersiz.");
      try { return {image:await generateConfiguredImage(config,`${authority}\nPazarlama görseli. ${text}\n${instructions}\nStil: ${style}`,input.aspect??"square", globalThis.fetch, normalizeGeneratedImagePng)}; }
      catch (error) { throw new MarketingError("ai_failed",error instanceof CloudflareAiError ? error.message : "AI görseli oluşturulamadı. Servis ve model erişimini kontrol edin."); }
    }
    const channel=input.capability==="channel_adaptation"?marketingChannel(input.channel):undefined;
    const channelRules={website:"Açık duyuru metni, başlık metinden ayrı.",whatsapp:"Kısa, sıcak WhatsApp taslağı.",sms:"En fazla 160 karakter; link ve telefon ekleme.",instagram:"Instagram caption, kısa açıklama ve ilgili az sayıda hashtag."};
    const completion=await generateConfiguredChat({...config,messages:[
      {role:"system",content:`${authority}\nTürkçe pazarlama taslağı üret. İşlem: ${input.capability}. Olmayan fiyat/hizmet üretme. Kişi, telefon, kimlik veya anahtar bilgisi ekleme. Sadece taslak metnini döndür. ${channel?channelRules[channel]:""}`},
      {role:"user",content:JSON.stringify({text,instructions})}
    ]});
    if (!completion.ok) throw new MarketingError("ai_failed", config.service === "cloudflare" ? completion.message : "AI metni oluşturulamadı. Servis ve model erişimini kontrol edin.");
    const answer=sanitizeMarketingAiText(completion.answer,names).trim();
    if (!answer || answer.length>12000 || (channel==="sms" && answer.length>160)) throw new MarketingError("invalid_ai_output","AI sonucu kanal sınırlarını aşıyor. Yeniden deneyin.");
    return {text:answer};
  }
}
