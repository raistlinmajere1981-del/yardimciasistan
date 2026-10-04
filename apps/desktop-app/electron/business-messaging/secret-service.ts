import { safeStorage } from "electron";
import type { WhatsAppCloudConfigurationInput } from "@yardimci-asistan/shared";
export type MessagingSecretWrite = { mode: "keep" | "clear" | "replace"; encryptedValue?: string };
function available() {
  return safeStorage.isEncryptionAvailable() && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text");
}
export function createMessagingSecretWrite(input?: WhatsAppCloudConfigurationInput): MessagingSecretWrite {
  if (input?.clearAccessToken) return { mode: "clear" };
  if (!input?.accessToken) return { mode: "keep" };
  if (typeof input.accessToken !== "string" || !/^[A-Za-z0-9_.|-]{1,4096}$/.test(input.accessToken)) throw new Error("WhatsApp Business erişim anahtarı geçersiz.");
  if (!available()) throw new Error("WhatsApp Business erişim anahtarı bu cihazda güvenli biçimde saklanamıyor.");
  try { return { mode: "replace", encryptedValue: `safe-storage:v1:${safeStorage.encryptString(input.accessToken).toString("base64")}` }; }
  catch { throw new Error("WhatsApp Business erişim anahtarı şifrelenemedi."); }
}
/** No reveal/read IPC. */
export function decryptMessagingSecret(value: string): string {
  if (!available() || !value.startsWith("safe-storage:v1:")) return "";
  try { return safeStorage.decryptString(Buffer.from(value.slice(16), "base64")); } catch { return ""; }
}
