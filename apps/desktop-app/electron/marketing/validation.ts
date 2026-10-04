import { MARKETING_CHANNELS, type MarketingChannel } from "@yardimci-asistan/shared";
export class MarketingError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
export function marketingText(value: unknown, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()) || /\u0000/.test(value))
    throw new MarketingError("invalid_input", "Pazarlama alanlarını kontrol edin.");
  return value.trim();
}
export function marketingChannel(value: unknown): MarketingChannel {
  if (!MARKETING_CHANNELS.includes(value as MarketingChannel)) throw new MarketingError("invalid_channel", "Kanal geçersiz.");
  return value as MarketingChannel;
}
export function marketingId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new MarketingError("invalid_id", "Kayıt kimliği geçersiz.");
  return value;
}
export function marketingAssetIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20 || new Set(value).size !== value.length)
    throw new MarketingError("invalid_media", "En fazla 20 farklı görsel seçin.");
  return value.map(marketingId);
}
