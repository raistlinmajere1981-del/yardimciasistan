import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type TestedSettingsService = "ai" | "desktop_stt" | "web" | "aras" | "whatsapp_cloud" | "sms" | "instagram" | "kbs" | "google_reviews";

/** Main-only evidence: never accept a renderer supplied success flag or fingerprint. */
export function serviceConfigFingerprint(config: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(Object.keys(config).sort().map(key => [key, config[key]]))).digest("hex");
}

export function validateServiceActivation(input: {
  label: string; enabled: boolean; configured: boolean;
  fingerprint?: string; verifiedFingerprint?: string;
}): string | null {
  if (!input.enabled) return null;
  if (!input.configured) return `${input.label} açıkken gerekli yapılandırma alanlarını tamamlayın.`;
  if (input.fingerprint && input.fingerprint !== input.verifiedFingerprint) {
    return `${input.label} ayarlarını kaydetmeden önce bağlantıyı başarıyla test edin. Değişen ayarlar yeniden test gerektirir.`;
  }
  return null;
}

export function readServiceVerification(db: DatabaseSync, service: TestedSettingsService): string {
  return String(db.prepare("SELECT fingerprint FROM service_settings_verifications WHERE service = ?").get(service)?.fingerprint ?? "");
}

/** Only explicit successful settings tests call this. Runtime failures never write desired enabled state. */
export function recordServiceVerification(db: DatabaseSync, service: TestedSettingsService, fingerprint: string): void {
  db.prepare(`INSERT INTO service_settings_verifications(service, fingerprint, tested_at) VALUES (?, ?, ?)
    ON CONFLICT(service) DO UPDATE SET fingerprint=excluded.fingerprint, tested_at=excluded.tested_at`)
    .run(service, fingerprint, new Date().toISOString());
}
