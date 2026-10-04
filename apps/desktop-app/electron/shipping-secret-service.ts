import { safeStorage } from "electron";
import type { ArasShippingConfigurationInput } from "@yardimci-asistan/shared";
import type { ShippingSecretWrite } from "./shipping-configuration-store";

function secureStorageAvailable() {
  return safeStorage.isEncryptionAvailable()
    && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text");
}
export function createShippingSecretWrite(input?: ArasShippingConfigurationInput): ShippingSecretWrite {
  if (input?.clearPassword) return { mode: "clear" };
  const password = input?.password ?? "";
  if (!password) return { mode: "keep" };
  if (typeof password !== "string" || password.length > 512 || /[\x00-\x1f\x7f]/.test(password)) throw new Error("Kargo şifresi geçersiz.");
  if (!secureStorageAvailable()) throw new Error("Kargo şifresi bu cihazda güvenli biçimde saklanamıyor. İşletim sistemi anahtar kasasını kontrol edin.");
  try { return { mode: "replace", encryptedValue: `safe-storage:v1:${safeStorage.encryptString(password).toString("base64")}` }; }
  catch { throw new Error("Kargo şifresi güvenli biçimde kaydedilemedi."); }
}
/** Main-process use only. Never exposed by an IPC read or reveal operation. */
export function decryptShippingSecret(encrypted: string): string {
  if (!encrypted.startsWith("safe-storage:v1:") || !secureStorageAvailable()) return "";
  try { return safeStorage.decryptString(Buffer.from(encrypted.slice("safe-storage:v1:".length), "base64")); }
  catch { return ""; }
}
