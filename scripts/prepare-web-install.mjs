import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
let publicUrl = "";
let displayName = "";
const explicitOrigins = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--url") {
    publicUrl = String(args[++index] ?? "").trim();
  } else if (arg === "--name") {
    displayName = String(args[++index] ?? "").trim();
  } else if (arg === "--origin") {
    const origin = String(args[++index] ?? "").trim();
    if (origin) explicitOrigins.push(origin);
  } else if (arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(0);
  } else {
    throw new Error(`Bilinmeyen seçenek: ${arg}`);
  }
}

if (!publicUrl) {
  throw new Error("Web modül adresi gerekli. Örnek: --url https://firma.com/yardimci-asistan");
}

let parsedUrl;
try {
  parsedUrl = new URL(publicUrl);
} catch {
  throw new Error(`Geçersiz web modül adresi: ${publicUrl}`);
}
if (!["http:", "https:"].includes(parsedUrl.protocol)) {
  throw new Error("Web modül adresi http:// veya https:// ile başlamalı.");
}

publicUrl = publicUrl.replace(/\/+$/, "");
const origins = explicitOrigins.length > 0
  ? [...new Set(explicitOrigins.map(normalizeOrigin))]
  : [parsedUrl.origin];
const syncSecret = randomBytes(32).toString("base64url");

const env = {
  ...process.env,
  YARDIMCI_ASISTAN_DEPLOY_SYNC_SECRET: syncSecret,
  YARDIMCI_ASISTAN_DEPLOY_ALLOWED_ORIGINS: origins.join(","),
  YARDIMCI_ASISTAN_DEPLOY_WEBSITE: parsedUrl.origin
};
if (displayName) {
  env.YARDIMCI_ASISTAN_DEPLOY_DISPLAY_NAME = displayName;
}

const result = spawnSync("npm", ["run", "pack:web-module"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit"
});
if (result.error) throw result.error;
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const outputRoot = join(process.cwd(), "artifacts", "web-module-deploy");
mkdirSync(outputRoot, { recursive: true });
const infoPath = join(outputRoot, "install-info.txt");
const info = [
  "Yardımcı Asistan Web Modülü Kurulum Bilgileri",
  "",
  `Web modül adresi: ${publicUrl}`,
  `Web güvenlik anahtarı: ${syncSecret}`,
  `İzin verilen origin: ${origins.join(", ")}`,
  "",
  "Bu anahtarı masaüstü uygulamasında Ayarlar → Web Bağlantısı → Web güvenlik anahtarı alanına yapıştırın.",
  "Bu dosyayı veya anahtarı web sitesinde, Git'te ya da herkese açık bir yerde paylaşmayın.",
  ""
].join("\n");
writeFileSync(infoPath, info, { mode: 0o600 });
try {
  chmodSync(infoPath, 0o600);
} catch {
  // Bazı dosya sistemleri POSIX izinlerini desteklemeyebilir.
}

console.log("\nWeb modülü kurulum paketi hazır.");
console.log(`Web modül adresi: ${publicUrl}`);
console.log(`Web güvenlik anahtarı: ${syncSecret}`);
console.log(`Kurulum bilgisi: ${infoPath}`);
console.log("Arşiv: artifacts/web-module-deploy/yardimci-asistan.tar.gz");
console.log("ZIP mevcutsa: artifacts/web-module-deploy/yardimci-asistan.zip");
console.log("\nAlwaysdata temiz kurulumu için:");
console.log("  npm run deploy:web -- --fresh --skip-pack");

function normalizeOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Geçersiz origin: ${value}`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Origin http:// veya https:// olmalı: ${value}`);
  }
  return url.origin;
}

function printHelp() {
  console.log(`Kullanım:
  npm run prepare:web-install -- --url <web-modül-adresi> [--name <işletme-adı>] [--origin <site-origin>]

Örnek:
  npm run prepare:web-install -- --url https://firma.com/yardimci-asistan --name "Firma Adı"

Script 256-bit rastgele sync secret üretir, deploy paketini hazırlar ve
artifacts/web-module-deploy/install-info.txt dosyasına masaüstünde kullanılacak
web modül adresi ile güvenlik anahtarını yazar.

Widget başka bir origin'de çalışacaksa --origin birden fazla kez verilebilir.`);
}
