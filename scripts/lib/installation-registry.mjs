import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function readInstallationRegistry(root = defaultRepoRoot) {
  const path = resolve(root, "config", "installations.json");
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (value?.schemaVersion !== 1 || !value.installations || typeof value.installations !== "object") {
    throw new Error("config/installations.json geçersiz.");
  }
  return value;
}

export function getInstallation(id, root = defaultRepoRoot) {
  const registry = readInstallationRegistry(root);
  const installation = registry.installations?.[id];
  if (!installation || typeof installation !== "object") {
    throw new Error(`Installation bulunamadı: ${id}`);
  }
  return installation;
}

export function resolveInstallationRepo(id, root = defaultRepoRoot) {
  const config = getInstallation(id, root).externalRepo;
  const explicit = config?.env && process.env[config.env]?.trim();
  if (explicit) return resolve(explicit);
  if (!config?.defaultSibling) throw new Error(`Installation repo tanımı bulunamadı: ${id}`);
  return resolve(root, "..", config.defaultSibling);
}

export function getInstallationValue(id, path, root = defaultRepoRoot) {
  const installation = getInstallation(id, root);
  const parts = String(path ?? "").split(".").filter(Boolean);
  let value = installation;
  for (const part of parts) {
    if (!value || typeof value !== "object" || !(part in value)) {
      throw new Error(`Installation alanı bulunamadı: ${id}.${path}`);
    }
    value = value[part];
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value ?? "");
}

export function validateInstallationRegistry(root = defaultRepoRoot) {
  const registry = readInstallationRegistry(root);
  const errors = [];
  for (const [key, installation] of Object.entries(registry.installations)) {
    if (installation.id !== key) errors.push(`${key}: id eşleşmiyor`);
    if (!String(installation.title ?? "").trim()) errors.push(`${key}: title eksik`);
    if (!String(installation.kind ?? "").trim()) errors.push(`${key}: kind eksik`);
    if (!String(installation.credentialRef ?? "").trim()) errors.push(`${key}: credentialRef eksik`);
    for (const [field, value] of Object.entries(installation)) {
      if (/secret|password|token|api.?key/i.test(field) && field !== "credentialRef") {
        errors.push(`${key}: committed registry secret alanı içeremez (${field})`);
      }
      if (typeof value === "string" && /(change-this-secret|local-development-only)/i.test(value)) {
        errors.push(`${key}: placeholder secret registry'de bulunamaz`);
      }
    }
  }
  return errors;
}
