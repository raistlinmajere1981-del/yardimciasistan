import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type SecretSource = "ssh" | "install-record";
export type SecretReadResult = { value: string; source: SecretSource; verifiedLive: boolean };

export type InstallationTarget = {
  id: string;
  webModuleUrl?: string;
  deploy?: { type?: string; host?: string; remoteRoot?: string };
  externalRepo?: { env?: string; defaultSibling?: string };
};

function ensureKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 16 || trimmed.length > 512 || /\s/.test(trimmed)) {
    throw new Error("Geçerli bir web bağlantı anahtarı okunamadı.");
  }
  return trimmed;
}

/** @compiledSmoke scripts/test-admin-credentials.mjs */
export function readInstallRecord(repoRoot: string, installation: InstallationTarget): SecretReadResult {
  const repo = installation.externalRepo;
  const explicit = repo?.env ? process.env[repo.env]?.trim() : undefined;
  const folder = explicit ? resolve(explicit) : resolve(repoRoot, "..", repo?.defaultSibling || "");
  const file = join(folder, ".deploy", "yardimci-asistan-install-info.txt");
  if (!repo?.defaultSibling && !explicit || !existsSync(file)) {
    throw new Error("BlackSea yerel kurulum bilgisi bulunamadı.");
  }
  const match = readFileSync(file, "utf8").match(/^Web güvenlik anahtarı:\s*(\S+)\s*$/m);
  if (!match) throw new Error("BlackSea kurulum dosyasında anahtar bulunamadı.");
  return { value: ensureKey(match[1] ?? ""), source: "install-record", verifiedLive: false };
}

export async function readInstallationSecret(repoRoot: string, installation: InstallationTarget): Promise<SecretReadResult> {
  if (!installation.webModuleUrl) throw new Error("Web modülü tanımlanmamış.");
  if (installation.id === "blacksea") return readInstallRecord(repoRoot, installation);
  if (installation.deploy?.type !== "ssh-rsync") {
    throw new Error("Bu kurulum için otomatik anahtar okuma desteklenmiyor.");
  }
  const host = installation.deploy.host ?? "";
  const root = installation.deploy.remoteRoot ?? "";
  if (!/^[A-Za-z0-9._@-]+$/.test(host) || !/^\/[A-Za-z0-9._/-]+\/yardimci-asistan$/.test(root)) {
    throw new Error("Sunucu bağlantı hedefi geçersiz.");
  }

  const remoteFile = `${root}/config/business.json`;
  const command = `php -r '$v=json_decode(file_get_contents($argv[1]),true);echo (string)($v["sync_secret"]??"");' "${remoteFile}"`;
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=yes", host, command], {
      timeout: 15000, maxBuffer: 8192, encoding: "utf8"
    }, (error, value) => error
      ? reject(new Error("SSH bağlantısı veya uzak kurulum dosyası okunamadı."))
      : resolve(value));
  });
  return { value: ensureKey(stdout), source: "ssh", verifiedLive: true };
}
