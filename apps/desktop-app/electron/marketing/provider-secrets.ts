import { safeStorage } from "electron";
import type { SmsConfigurationInput } from "@yardimci-asistan/shared";
import type { MessagingSecretWrite } from "../business-messaging/secret-service";
import { MarketingError } from "./validation";
export interface MarketingProviderSecretWrites { apiKey?: MessagingSecretWrite; apiHash?: MessagingSecretWrite }
function encrypt(value: unknown, clear?: boolean): MessagingSecretWrite {
  if (clear) return { mode: "clear" };
  if (value === undefined || value === "") return { mode: "keep" };
  if (typeof value !== "string" || !/^[A-Za-z0-9_.|=-]{1,4096}$/.test(value)) throw new MarketingError("invalid_secret", "Servis erişim anahtarı geçersiz.");
  if (!safeStorage.isEncryptionAvailable() || (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")) throw new MarketingError("secure_storage_unavailable", "Servis anahtarı bu cihazda güvenli saklanamıyor.");
  try { return { mode: "replace", encryptedValue: `safe-storage:v1:${safeStorage.encryptString(value).toString("base64")}` }; }
  catch { throw new MarketingError("secure_storage_unavailable", "Servis anahtarı şifrelenemedi."); }
}
export function createMarketingProviderSecretWrites(sms?: SmsConfigurationInput): MarketingProviderSecretWrites {
  return { apiKey: encrypt(sms?.apiKey, sms?.clearApiKey), apiHash: encrypt(sms?.apiHash, sms?.clearApiHash) };
}
