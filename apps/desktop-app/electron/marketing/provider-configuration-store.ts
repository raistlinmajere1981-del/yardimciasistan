import type { DatabaseSync } from "node:sqlite";
import { emptySmsConfiguration, emptyInstagramConfiguration, INSTAGRAM_API_VERSION, type SmsConfigurationInput, type InstagramConfigurationInput } from "@yardimci-asistan/shared";
import type { MarketingProviderSecretWrites } from "./provider-secrets";
import { MarketingError } from "./validation";
export function storedMarketingProvider(db: DatabaseSync, provider: "iletimerkezi" | "instagram_api") {
  return db.prepare("SELECT * FROM marketing_provider_config WHERE business_id=(SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1) AND provider_id=?").get(provider);
}
export function smsConfiguration(db: DatabaseSync) {
  const r = storedMarketingProvider(db, "iletimerkezi"); if (!r) return emptySmsConfiguration();
  const hasApiKey = String(r.secret_one_encrypted).startsWith("safe-storage:v1:"), hasApiHash = String(r.secret_two_encrypted).startsWith("safe-storage:v1:");
  const enabled = Number(r.enabled) === 1;
  return { ...emptySmsConfiguration(), enabled, senderId: String(r.sender_id), iysList: r.iys_list as "BIREYSEL" | "TACIR", hasApiKey, hasApiHash, configured: enabled && hasApiKey && hasApiHash && Boolean(r.sender_id) };
}
export function instagramConfiguration(db: DatabaseSync) {
  const r = storedMarketingProvider(db, "instagram_api"); if (!r) return emptyInstagramConfiguration();
  const enabled = Number(r.enabled) === 1, hasSecret = String(r.secret_one_encrypted).startsWith("safe-storage:v1:");
  return { ...emptyInstagramConfiguration(), apiVersion: INSTAGRAM_API_VERSION, enabled, accountId: String(r.account_id), hasSecret, configured: enabled && hasSecret && Boolean(r.account_id) };
}
export function validateSmsConfiguration(input: SmsConfigurationInput) {
  if (!input || typeof input.enabled !== "boolean" || typeof input.senderId !== "string" || !/^[A-Za-z0-9 ]{0,11}$/.test(input.senderId) || !["BIREYSEL", "TACIR"].includes(input.iysList)) throw new MarketingError("invalid_configuration", "SMS başlığı ve İYS listesi geçersiz.");
  if (input.senderId === "APITEST") throw new MarketingError("invalid_configuration", "Pazarlama gönderimi için onaylı başlık kullanın.");
}
export function validateInstagramConfiguration(input: InstagramConfigurationInput) {
  if (!input || typeof input.enabled !== "boolean" || typeof input.accountId !== "string" || !/^(?:\d{1,40})?$/.test(input.accountId)) throw new MarketingError("invalid_configuration", "Instagram hesap kimliği geçersiz.");
}
export function saveMarketingProviderConfigurations(db: DatabaseSync, businessId: string, sms: SmsConfigurationInput | undefined, instagram: InstagramConfigurationInput | undefined, writes: MarketingProviderSecretWrites = {}) {
  for (const provider of ["iletimerkezi", "instagram_api"] as const) {
    const input = provider === "iletimerkezi" ? sms : instagram; if (!input) continue;
    if (provider === "iletimerkezi") validateSmsConfiguration(sms!); else validateInstagramConfiguration(instagram!);
    const old = storedMarketingProvider(db, provider);
    const secrets = [String(old?.secret_one_encrypted ?? ""), String(old?.secret_two_encrypted ?? "")];
    const updates = provider === "iletimerkezi" ? [writes.apiKey, writes.apiHash] : [writes.instagramToken];
    updates.forEach((write, index) => {
      if (write?.mode === "clear") secrets[index] = "";
      if (write?.mode === "replace") {
        if (!write.encryptedValue?.startsWith("safe-storage:v1:")) throw new MarketingError("secret_not_encrypted", "Servis anahtarı ana süreçte şifrelenmeli.");
        secrets[index] = write.encryptedValue;
      }
    });
    // Raw secrets must never reach persistence, including callers other than renderer setup.
    if (provider === "iletimerkezi" ? sms?.apiKey || sms?.apiHash : instagram?.accessToken) throw new MarketingError("secret_not_encrypted", "Servis anahtarı ana süreçte şifrelenmeli.");
    db.prepare(`INSERT INTO marketing_provider_config VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(business_id,provider_id) DO UPDATE SET
      enabled=excluded.enabled,account_id=excluded.account_id,sender_id=excluded.sender_id,iys_list=excluded.iys_list,
      secret_one_encrypted=excluded.secret_one_encrypted,secret_two_encrypted=excluded.secret_two_encrypted,updated_at=excluded.updated_at`)
      .run(businessId, provider, input.enabled ? 1 : 0, provider === "instagram_api" ? instagram!.accountId : "", provider === "iletimerkezi" ? sms!.senderId : "", provider === "iletimerkezi" ? sms!.iysList : "BIREYSEL", ...secrets, new Date().toISOString());
  }
}
