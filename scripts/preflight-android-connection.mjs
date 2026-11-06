import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Debug and release APKs are both business-agnostic. Connection credentials
// arrive through desktop QR pairing, never through a build-time shared key.
// Keep the preflight as a fail-closed check of what the APK will compile.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generator = join(repoRoot, "scripts", "generate-android-connection-defaults.mjs");
const output = join(
  repoRoot, "apps", "android-app", "build", "generated", "source",
  "connection", "com", "yardimciasistan", "android", "ConnectionDefaults.java"
);
const legacyConnection = join(repoRoot, "apps", "android-app", "connection.local.json");

const generated = spawnSync(process.execPath, [generator], {
  cwd: repoRoot,
  encoding: "utf8"
});

if (generated.error || generated.status !== 0) {
  console.error("Android bağlantı varsayılanları üretilemedi; derleme durduruldu.");
  process.exit(1);
}

let source = "";
try {
  source = readFileSync(output, "utf8");
} catch {
  console.error("Android bağlantı varsayılanları okunamadı; derleme durduruldu.");
  process.exit(1);
}

const isCredentialFree = [
  /static final String WEB_MODULE_URL = "";/,
  /static final String SYNC_SECRET = "";/,
  /static final boolean LOCK_EMBEDDED_CONNECTION = false;/
].every(pattern => pattern.test(source));

if (!isCredentialFree) {
  console.error("Android APK işletmeye özel bağlantı bilgileri içeriyor olabilir; derleme durduruldu.");
  process.exit(1);
}

if (existsSync(legacyConnection)) {
  console.warn("Eski connection.local.json yok sayıldı; Android bağlantısı QR eşleştirmesiyle kurulacak.");
}
console.log("Android bağlantı preflight başarılı: işletmeden bağımsız APK, gömülü anahtar yok.");
