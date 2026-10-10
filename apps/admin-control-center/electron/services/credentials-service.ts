import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CREDENTIAL_FIELDS, type CredentialField, type InstallationCredentialRecord } from "../../shared/contracts";

type Registry = { installations?: Record<string, { credentialRef?: string }> };
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
