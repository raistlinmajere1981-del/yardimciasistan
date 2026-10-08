import type { BusinessMessageTemplate, MessagingCampaignInput, MessagingSegmentFilter, MessagingTemplateBinding } from "@yardimci-asistan/shared";

export class MessagingCampaignError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "MessagingCampaignError"; }
}
export function invalid(code: string, message: string): never { throw new MessagingCampaignError(code, message); }
function object(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function keys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every((key) => allowed.includes(key)); }
export function boundedText(value: unknown, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) || (required && !value.trim())) invalid("invalid_input", "Alan değeri eksik veya geçersiz.");
  return value.trim();
}
export function validateChannel(value: unknown) {
  if (value !== "whatsapp" && value !== "sms") invalid("invalid_channel", "İletişim kanalı geçersiz.");
  return value;
}
export function validateSegmentFilter(value: unknown): MessagingSegmentFilter {
  if (!object(value) || !keys(value, ["version", "rules"]) || value.version !== 1 || !Array.isArray(value.rules) || value.rules.length > 3) invalid("invalid_filter", "Segment filtresi desteklenmiyor.");
  const fields = new Set();
  for (const rule of value.rules) {
    if (!object(rule) || fields.has(rule.field)) invalid("invalid_filter", "Segment filtresi desteklenmiyor.");
    fields.add(rule.field);
    const valid = rule.field === "phone"
      ? keys(rule, ["field", "operator"]) && ["present", "absent"].includes(String(rule.operator))
      : keys(rule, ["field", "operator", "value"]) && rule.operator === "eq" && typeof rule.value === "string" && (
        rule.field === "dealerStatus" && ["candidate", "active", "inactive"].includes(rule.value)
        || rule.field === "source" && ["web_form", "web_ai", "whatsapp", "manual", "phone", "android"].includes(rule.value));
    if (!valid) invalid("invalid_filter", "Segment alanı veya işleci desteklenmiyor.");
  }
  return value as unknown as MessagingSegmentFilter;
}
export function validateCampaignInput(value: MessagingCampaignInput): MessagingCampaignInput {
  if (!object(value) || !keys(value, ["name", "purpose", "channel", "providerId", "segmentId", "templateName", "templateLanguage", "bindings", "contentId", "contentRevision", "text"]) || value.purpose !== "marketing") invalid("invalid_campaign", "Yalnız pazarlama kampanyası destekleniyor.");
  validateChannel(value.channel);
  if (value.providerId !== undefined && value.providerId !== (value.channel === "sms" ? "iletimerkezi" : "whatsapp_cloud")) invalid("invalid_provider", "Sağlayıcı desteklenmiyor.");
  if (!Array.isArray(value.bindings) || value.bindings.length > 10 || value.bindings.some((group) => !Array.isArray(group) || group.length > 30)) invalid("invalid_bindings", "Şablon bağlantıları geçersiz.");
  for (const binding of value.bindings.flat()) {
    if (!object(binding)) invalid("invalid_bindings", "Şablon bağlantısı geçersiz.");
    if (binding.type === "static_text" && keys(binding, ["type", "value"])) boundedText(binding.value, 2000, true);
    else if (!(binding.type === "customer_field" && keys(binding, ["type", "field"]) && ["customer.fullName", "commercial.companyName"].includes(String(binding.field)))) invalid("invalid_bindings", "Şablon bağlantısı desteklenmiyor.");
  }
  const smsText = value.channel === "sms" ? validateSmsText(value.text) : undefined;
  if (value.channel === "sms" && (value.bindings.length || value.templateName || value.templateLanguage)) invalid("invalid_campaign", "SMS yalnız düz metin kullanır.");
  if (value.contentId !== undefined) { boundedText(value.contentId, 100, true); if (!Number.isSafeInteger(value.contentRevision) || value.contentRevision! < 1) invalid("invalid_campaign", "İçerik sürümü geçersiz."); }
  return { ...(value.contentId !== undefined ? { contentId: value.contentId } : {}), ...(value.contentRevision !== undefined ? { contentRevision: value.contentRevision } : {}), ...(smsText ? { text: smsText } : {}), name: boundedText(value.name, 120, true), purpose: "marketing", channel: value.channel, ...(value.providerId !== undefined ? { providerId: value.providerId } : {}),
    segmentId: boundedText(value.segmentId, 100, true), templateName: boundedText(value.templateName, 512, value.channel === "whatsapp"),
    templateLanguage: boundedText(value.templateLanguage, 40, value.channel === "whatsapp"), bindings: value.bindings };
}
export function validateCampaignTemplate(input: MessagingCampaignInput, template: BusinessMessageTemplate) {
  if (!template || template.status !== "APPROVED" || template.name !== input.templateName || template.language !== input.templateLanguage) invalid("missing_template", "Onaylı şablon artık kullanılamıyor.");
  if (!template.supported || template.components.some((component) => !["body", "header"].includes(component.type))) invalid("unsupported_template", "Şablon bileşeni kampanyalarda desteklenmiyor.");
  if (input.bindings.length !== template.components.length || input.bindings.some((group, index) => group.length !== template.components[index]?.parameters.length)) invalid("invalid_bindings", "Gerekli şablon parametrelerini bağlayın.");
}
export function resolveCampaignBindings(bindings: MessagingTemplateBinding[][], customer: { fullName: string; companyName: string }): string[][] {
  return bindings.map((group) => group.map((binding) => boundedText(binding.type === "static_text" ? binding.value
    : binding.field === "customer.fullName" ? customer.fullName : customer.companyName, 2000, true)));
}

export function validateSmsText(value: unknown): string {
  const text = boundedText(value, 160, true);
  if (/<\/?[A-Za-z][^>]*>/.test(text)) invalid("invalid_sms_text", "SMS HTML içeremez.");
  return text;
}
