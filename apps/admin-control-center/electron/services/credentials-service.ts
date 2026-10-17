import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { readInstallationSecret, type InstallationTarget, type SecretReadResult } from "./installation-secret-sync";
import { join } from "node:path";
import { CREDENTIAL_FIELDS, type CredentialField, type InstallationCredentialRecord } from "../../shared/contracts";

type Registry = { installations?: Record<string, InstallationTarget & { credentialRef?: string }> };
type CredentialsFile = { schemaVersion?: number; credentials?: Record<string, Record<string, unknown>> };

function getCredentialRef(repoRoot: string, installationId: string) {
  const registry = JSON.parse(readFileSync(join(repoRoot, "config", "installations.json"), "utf8")) as Registry;
  return String(registry.installations?.[installationId]?.credentialRef ?? "").trim() || null;
}

function readCredentials(path: string): CredentialsFile {
  if (!existsSync(path)) return { schemaVersion: 1, credentials: {} };
  return JSON.parse(readFileSync(path, "utf8")) as CredentialsFile;
}

function validateField(field: string): field is CredentialField {
  return CREDENTIAL_FIELDS.some((item) => item.id === field);
}

export function getInstallationCredentials(repoRoot: string, installationId: string) {
  const ref = getCredentialRef(repoRoot, installationId);
  if (!ref) return { ref: null, fields: {} satisfies InstallationCredentialRecord };
  const file = readCredentials(join(repoRoot, "config", "credentials.local.json"));
  const record = file.credentials?.[ref] ?? {};
  const fields: InstallationCredentialRecord = {};
  for (const { id } of CREDENTIAL_FIELDS) {
    const value = record[id];
    if (typeof value === "string") fields[id] = value;
  }
  return { ref, fields };
}

export function saveInstallationCredential(
  repoRoot: string,
  installationId: string,
  field: string,
  value: string
): { ok: boolean; message: string } {
  const ref = getCredentialRef(repoRoot, installationId);
  if (!ref) return { ok: false, message: "Bu kurulum için credentialRef tanımlı değil." };
  if (!validateField(field)) return { ok: false, message: "Desteklenmeyen credential alanı." };
  if (installationId !== "blacksea" || field !== "syncSecret") {
    return { ok: false, message: "Yalnız BlackSea web modülü secret’ı elle düzenlenebilir." };
  }
  if (typeof value !== "string" || !value.trim()) return { ok: false, message: "Değer boş olamaz." };

  const path = join(repoRoot, "config", "credentials.local.json");
  const file = readCredentials(path);
  file.schemaVersion = 1;
  file.credentials ??= {};
  file.credentials[ref] ??= {};
  file.credentials[ref][field] = value;
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
  return { ok: true, message: "Erişim bilgisi yerel dosyaya kaydedildi." };
}

export function getCredentialForClipboard(repoRoot: string, installationId: string, field: string): string | null {
  if (!validateField(field)) return null;
  const ref = getCredentialRef(repoRoot, installationId);
  if (!ref) return null;
  const file = readCredentials(join(repoRoot, "config", "credentials.local.json"));
  const value = file.credentials?.[ref]?.[field];
  return typeof value === "string" && value ? value : null;
}

export type CredentialSyncResult = { ok: boolean; changed: boolean; verifiedLive: boolean; message: string };

function storeSecret(repoRoot: string, ref: string, value: string) {
  const path = join(repoRoot, "config", "credentials.local.json");
  const file = readCredentials(path);
  const current = file.credentials?.[ref] ?? {};
  if (current.syncSecret === value) return false;

  file.schemaVersion = 1;
  file.credentials ??= {};
  file.credentials[ref] = { ...current, syncSecret: value };
  const temp = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
  return true;
}

export async function syncInstallationCredential(
  repoRoot: string,
  installationId: string,
  reader: (root: string, installation: InstallationTarget) => Promise<SecretReadResult> = readInstallationSecret
): Promise<CredentialSyncResult> {
  const registry = JSON.parse(readFileSync(join(repoRoot, "config", "installations.json"), "utf8")) as Registry;
  const record = registry.installations?.[installationId];
  const ref = record?.credentialRef?.trim();
  if (!record || !ref || !record.webModuleUrl) {
    return { ok: false, changed: false, verifiedLive: false, message: "Web bağlantısı veya kurulum kaydı bulunamadı." };
  }

  try {
    const result = await reader(repoRoot, { ...record, id: installationId });
    const value = result.value.trim();
    if (value.length < 16 || value.length > 512 || /\s/.test(value)) {
      throw new Error("Alınan web bağlantı anahtarı geçersiz.");
    }
    const fields = getInstallationCredentials(repoRoot, installationId).fields;
    const saved = "syncSecret" in fields ? fields.syncSecret : undefined;
    if (!result.verifiedLive && saved && saved !== value) {
      return {
        ok: false, changed: false, verifiedLive: false,
        message: "BlackSea yerel kurulum kaydı farklı. Canlı doğrulama olmadan mevcut anahtar değiştirilmedi."
      };
    }

    const changed = storeSecret(repoRoot, ref, value);
    return {
      ok: true, changed, verifiedLive: result.verifiedLive,
      message: result.verifiedLive
        ? changed ? "Canlı sunucudaki anahtar alındı ve güncellendi." : "Anahtar canlı sunucuyla eşleşiyor."
        : changed ? "Anahtar yerel BlackSea kurulum kaydından alındı; canlı doğrulanmadı."
          : "BlackSea yerel kurulum kaydı eşleşiyor; canlı doğrulanmadı."
    };
  } catch (error) {
    return {
      ok: false, changed: false, verifiedLive: false,
      message: `${error instanceof Error ? error.message : "Anahtar okunamadı."} Kayıt korunuyor; canlı güncellik bilinmiyor.`
    };
  }
}
