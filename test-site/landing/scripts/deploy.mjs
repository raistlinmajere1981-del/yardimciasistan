#!/usr/bin/env node
/**
 * Landing deploy script (landing-only).
 *
 * Deploys landing code:
 *   www/index.php
 *   www/favicon.png
 *   www/assets/  (add/update, never delete)
 *
 * With --with-downloads it also deploys the current release artifacts:
 *   www/downloads/YardimciAsistan-Setup-<version>.exe
 *   www/downloads/YardimciAsistan-Setup-<version>-x86.exe
 *   www/downloads/YardimciAsistan-Android-<version>.apk
 *
 * NEVER touches:
 *   www/yardimci-asistan/** (web module code, config/business.json, data/, sqlite, AI local config)
 *
 * Usage:
 *   node scripts/deploy.mjs --dry-run
 *   node scripts/deploy.mjs --dry-run --with-downloads
 *   node scripts/deploy.mjs --yes
 *   node scripts/deploy.mjs --yes --with-downloads
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = join(repoRoot, "..", "..");
const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  console.log(`Landing deploy (landing-only).

Kullanim:
  node scripts/deploy.mjs --dry-run                    Sunucuda degisiklik yapmadan farki gosterir.
  node scripts/deploy.mjs --dry-run --with-downloads   Landing + kurulum dosyasi farklarini gosterir.
  node scripts/deploy.mjs --yes                        Backup + atomic deploy + HTTP smoke.
  node scripts/deploy.mjs --yes --with-downloads       Landing + Windows/APK paketlerini yayinlar.

Secenekler:
  --with-downloads   Windows x64/x86 installer ve Android release APK'yi /downloads altina yayinlar.

Ortam degiskenleri:
  LANDING_DEPLOY_HOST            SSH hedefi
  LANDING_DEPLOY_WWW             Uzak www dizini
  LANDING_DEPLOY_BACKUP_PARENT   Uzak yedek ust dizini
  LANDING_PUBLIC_URL             Canli landing adresi
`);
  process.exit(0);
}

const dryRun = args.has("--dry-run");
const assumeYes = args.has("--yes");
const withDownloads = args.has("--with-downloads");

const deployHost = process.env.LANDING_DEPLOY_HOST ?? "yardimciasistan@ssh-yardimciasistan.alwaysdata.net";
const remoteWww = (process.env.LANDING_DEPLOY_WWW ?? "/home/yardimciasistan/www").replace(/\/+$/, "");
const backupParent = (process.env.LANDING_DEPLOY_BACKUP_PARENT ?? "/home/yardimciasistan/backups").replace(/\/+$/, "");
const publicUrl = (process.env.LANDING_PUBLIC_URL ?? "https://yardimciasistan.alwaysdata.net").replace(/\/+$/, "");

if (!/^[A-Za-z0-9._@-]+$/.test(deployHost)) {
  fail(`Guvenli olmayan SSH hedefi: ${deployHost}`);
}
for (const p of [remoteWww, backupParent]) {
  if (!/^\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/.test(p)) {
    fail(`Guvenli olmayan uzak yol: ${p}`);
  }
}
if (remoteWww === backupParent || backupParent.startsWith(`${remoteWww}/`) || remoteWww.startsWith(`${backupParent}/`)) {
  fail("Yedek dizini www disinda olmalidir.");
}
if (!/^https?:\/\/[^ \t]+$/.test(publicUrl)) {
  fail(`Gecersiz canli adres: ${publicUrl}`);
}
if (!remoteWww.endsWith("/www")) {
  fail(`Uzak hedef landing www koku olmali: ${remoteWww}`);
}

for (const cmd of ["ssh", "scp", "rsync", "php"]) {
  const check = spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" });
  if (check.status !== 0) fail(`Gerekli komut bulunamadi: ${cmd}`);
}

const localIndex = join(repoRoot, "index.php");
const localFavicon = join(repoRoot, "favicon.png");
const localAssets = join(repoRoot, "assets");
const landingBundle = join(localAssets, "index-t2kNTUv0.js");
const requiredLocal = [localIndex, localFavicon, landingBundle, join(localAssets, "index-fcReLA3k.css")];
for (const f of requiredLocal) {
  if (!existsSync(f)) fail(`Yerel kaynak dosya eksik: ${f}`);
}

const downloadArtifacts = [];
if (withDownloads) {
  const desktopVersion = packageVersion(join(monorepoRoot, "apps", "desktop-app", "package.json"));
  const androidVersion = packageVersion(join(monorepoRoot, "apps", "android-app", "package.json"));
  const desktopInstaller = join(monorepoRoot, "dist", "desktop", `YardimciAsistan-Setup-${desktopVersion}.exe`);
  const desktopInstallerX86 = join(monorepoRoot, "dist", "desktop", `YardimciAsistan-Setup-${desktopVersion}-x86.exe`);
  const androidResourceDir = join(monorepoRoot, "apps", "desktop-app", "resources", "android");
  const androidApk = join(androidResourceDir, "yardimci-asistan-release.apk");
  const androidVersionFile = join(androidResourceDir, "version.json");

  for (const f of [desktopInstaller, desktopInstallerX86, androidApk, androidVersionFile]) {
    if (!existsSync(f)) {
      fail(
        `Kurulum paketi eksik: ${f}\n` +
        "Once npm run pack:desktop:windows calistirarak Windows x64/x86 installer + release APK hazirlayin."
      );
    }
  }

  const androidResourceVersion = JSON.parse(readFileSync(androidVersionFile, "utf8"));
  if (androidResourceVersion.variant !== "release") {
    fail(`Web sitesine debug APK yayinlanamaz: variant=${androidResourceVersion.variant ?? "?"}`);
  }
  if (String(androidResourceVersion.versionName ?? "") !== androidVersion) {
    fail(
      `Android staged APK surumu uyusmuyor: staged=${androidResourceVersion.versionName ?? "?"}, package=${androidVersion}`
    );
  }

  const bundleSource = readFileSync(landingBundle, "utf8");
  const desktopMarker = `"${desktopVersion}".trim()||"${desktopVersion}"`;
  const androidMarker = `"${androidVersion}".trim()||"${androidVersion}"`;
  if (
    !bundleSource.includes("/downloads/YardimciAsistan-Setup-${kr}.exe") ||
    !bundleSource.includes("/downloads/YardimciAsistan-Android-${wr}.apk") ||
    !readFileSync(localIndex, "utf8").includes('data-ya-x86-download="1"') ||
    !bundleSource.includes(desktopMarker) ||
    !bundleSource.includes(androidMarker)
  ) {
    fail(
      "Landing bundle ile release surumleri eslesmiyor. " +
      "Kurulum dosyalarini yayinlamadan once landing download surumlerini guncelleyin."
    );
  }

  downloadArtifacts.push(
    {
      label: "Windows x64",
      source: desktopInstaller,
      name: `YardimciAsistan-Setup-${desktopVersion}.exe`
    },
    {
      label: "Windows x86",
      source: desktopInstallerX86,
      name: `YardimciAsistan-Setup-${desktopVersion}-x86.exe`
    },
    {
      label: "Android",
      source: androidApk,
      name: `YardimciAsistan-Android-${androidVersion}.apk`
    }
  );

  for (const artifact of downloadArtifacts) {
    artifact.size = statSize(artifact.source);
    artifact.sha256 = sha256FileHex(artifact.source);
  }
}

step("Yerel PHP syntax kontrolu");
runLocal("php", ["-l", localIndex]);

// Eski hardcoded test degeri: bilerek parcali yazildi ki bu dosya
// repo genelinde literal taramasina takilmasin. Guard amaclidir,
// deploy edilen bir secret degildir.
const STALE_HARDCODED = ["112233", "445566"].join("");

step("Kaynakta hardcoded secret taramasi");
const hardcodedHits = grepLocal(STALE_HARDCODED, [localIndex, localAssets]);
if (hardcodedHits.length > 0) {
  console.error(hardcodedHits.join("\n"));
  fail("Kaynakta hardcoded deger var; deploy durduruldu.");
}
console.log("Kaynakta hardcoded deger yok.");

step("Canli sync_secret okunuyor (yalniz uzunluk loglanir)");
const liveSecret = sshCapture(`php -r '$c=json_decode(file_get_contents("${remoteWww}/yardimci-asistan/config/business.json"), true); echo trim((string)($c["sync_secret"] ?? ""));'`);
if (!liveSecret) fail("Canli sync_secret okunamadi; deploy durduruldu.");
console.log(`Canli sync_secret uzunlugu: ${liveSecret.length}`);

step("Gercek secret'in kaynaga gomulmedigi kontrol ediliyor");
const leakHits = grepLocalFixedString(liveSecret, [localIndex, localAssets]);
if (leakHits.length > 0) {
  console.error(leakHits.join("\n"));
  fail("Kaynak dosyalarda canli secret bulunuyor; deploy durduruldu.");
}
console.log("Kaynakta canli secret yok.");

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
const remoteBackup = `${backupParent}/landing-${stamp}`;
const remoteTmpIndex = `${remoteWww}/.landing-index-${stamp}.php`;
const remoteTmpFavicon = `${remoteWww}/.landing-favicon-${stamp}.png`;
const remoteDownloads = `${remoteWww}/downloads`;

if (dryRun) {
  step("Dry-run: uzak farklar (degisiklik yapilmaz)");
  sshRun(`test -d ${remoteWww}`);
  const remoteIndex = sshCapture(`cat ${remoteWww}/index.php 2>/dev/null || echo "__MISSING__"`);
  const localContent = readFileSync(localIndex, "utf8").replace(/\n$/, "");
  if (remoteIndex === "__MISSING__") {
    console.log("www/index.php: sunucuda yok, eklenecek.");
  } else if (remoteIndex === localContent) {
    console.log("www/index.php: ayni, degisiklik yok.");
  } else {
    console.log("www/index.php: farkli, uzerine yazilacak (atomic mv ile).");
  }
  console.log("Asset farklari (ekleme/guncelleme, silme yok):");
  runLocal("rsync", [
    "-azn",
    "--itemize-changes",
    "-e",
    "ssh -o BatchMode=yes -o ConnectTimeout=15",
    `${localAssets}/`,
    `${deployHost}:${remoteWww}/assets/`
  ]);
  if (withDownloads) {
    step("Dry-run: kurulum dosyalari");
    for (const artifact of downloadArtifacts) {
      const remotePath = `${remoteDownloads}/${artifact.name}`;
      const remoteHash = sshCapture(
        `if [ -f '${remotePath}' ]; then php -r 'echo hash_file("sha256", $argv[1]);' '${remotePath}'; else echo __MISSING__; fi`
      );
      if (remoteHash === "__MISSING__") {
        console.log(`${artifact.label}: eklenecek -> /downloads/${artifact.name}`);
      } else if (remoteHash === artifact.sha256) {
        console.log(`${artifact.label}: ayni, degisiklik yok -> /downloads/${artifact.name}`);
      } else {
        console.log(`${artifact.label}: farkli, guncellenecek -> /downloads/${artifact.name}`);
      }
    }
  }
  console.log("\nDry-run tamamlandi; sunucuda degisiklik yapilmadi.");
  process.exit(0);
}

if (!assumeYes) {
  if (!process.stdin.isTTY) fail("Etkilesimsiz yayin icin --yes kullanin.");
  const answer = promptSync("Bu landing kaynagi canliya yayinlansin mi? [e/H] ");
  if (!/^[eEyY]$/.test(answer.trim())) {
    console.log("Yayin iptal edildi.");
    process.exit(0);
  }
}

step(`Yedek aliniyor: ${remoteBackup}`);
sshRun(`mkdir -p ${remoteBackup} && test ! -e ${remoteTmpIndex} && test ! -e ${remoteTmpFavicon}`);
sshRun(
  `cd ${remoteWww} && ` +
    `for f in index.php index.html favicon.png; do [ -f "$f" ] && cp -p "$f" ${remoteBackup}/ || true; done && ` +
    `[ -d assets ] && cp -a assets ${remoteBackup}/ || true && ls -la ${remoteBackup}/`
);

step("Gecici isimle upload + syntax kontrolu");
runLocal("scp", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", localIndex, `${deployHost}:${remoteTmpIndex}`]);
runLocal("scp", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", localFavicon, `${deployHost}:${remoteTmpFavicon}`]);
sshRun(`php -l ${remoteTmpIndex}`);

step("Atomic devreye alma");
sshRun(`mv ${remoteTmpIndex} ${remoteWww}/index.php && mv ${remoteTmpFavicon} ${remoteWww}/favicon.png && php -l ${remoteWww}/index.php`);

step("Assetler esitleniyor (ekleme/guncelleme, silme yok)");
runLocal("rsync", [
  "-az",
  "--omit-dir-times",
  "-e",
  "ssh -o BatchMode=yes -o ConnectTimeout=15",
  `${localAssets}/`,
  `${deployHost}:${remoteWww}/assets/`
]);

if (withDownloads) {
  step("Kurulum dosyalari atomik olarak yayinlaniyor");
  sshRun(`mkdir -p ${remoteDownloads}`);
  for (const artifact of downloadArtifacts) {
    const remotePath = `${remoteDownloads}/${artifact.name}`;
    const remoteTmp = `${remoteDownloads}/.${artifact.name}.${stamp}.tmp`;
    sshRun(`rm -f '${remoteTmp}'`);
    runLocal("scp", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", artifact.source, `${deployHost}:${remoteTmp}`]);
    const uploadedHash = sshCapture(`php -r 'echo hash_file("sha256", $argv[1]);' '${remoteTmp}'`);
    if (uploadedHash !== artifact.sha256) {
      sshRun(`rm -f '${remoteTmp}'`);
      fail(`${artifact.label} upload SHA-256 dogrulamasi basarisiz.`);
    }
    sshRun(`mv '${remoteTmp}' '${remotePath}'`);
    console.log(`${artifact.label}: /downloads/${artifact.name} (${formatBytes(artifact.size)})`);
  }
}

step("Uzak dogrulama: hardcoded yok, syntax temiz");
sshRun(`php -l ${remoteWww}/index.php`);
const remoteGrep = sshCapture(
  `grep -r -c '${STALE_HARDCODED}' ${remoteWww}/index.php ${remoteWww}/assets/index-t2kNTUv0.js 2>/dev/null || echo CLEAN`
);
if (!remoteGrep.includes("CLEAN") && remoteGrep.trim() !== "0") {
  // grep -c her dosya icin sayi basar; 0 disinda sayi varsa kirli demektir.
  const dirty = remoteGrep.split("\n").some((line) => !line.endsWith(":0") && line.trim() !== "CLEAN" && line.trim() !== "0");
  if (dirty) fail(`Sunucuda hardcoded bulundu:\n${remoteGrep}`);
}
console.log("Sunucuda hardcoded yok.");

step("HTTP smoke");
await smoke(publicUrl, liveSecret);
if (withDownloads) {
  await smokeDownloads(publicUrl, downloadArtifacts);

  step("Eski kurulum dosyalari temizleniyor");
  const keepNames = downloadArtifacts.map((artifact) => artifact.name);
  const keepTests = keepNames.map((name) => `! -name \'${name}\'`).join(" ");
  sshRun(
    `find \'${remoteDownloads}\' -mindepth 1 -maxdepth 1 -type f \\( ` +
    `-name \'YardimciAsistan-Setup-*.exe\' -o -name \'YardimciAsistan-Android-*.apk\' \\) ` +
    `${keepTests} -delete`
  );
}

console.log("\nYayin tamamlandi.");
console.log(`Canli adres: ${publicUrl}`);
console.log(`Yedek: ${remoteBackup}`);
if (withDownloads) {
  console.log("Windows x64/x86 installer ve Android release APK /downloads altinda guncellendi.");
}
console.log("Web modulu (config/business.json, data/, sqlite) degistirilmedi.");

step("Eski landing yedekleri temizleniyor (son 3 tutulur)");
sshRun(
  `find '${backupParent}' -mindepth 1 -maxdepth 1 -type d -name 'landing-*' -printf '%T@ %p\\n' | ` +
  `sort -nr | tail -n +4 | cut -d' ' -f2- | while IFS= read -r old_backup; do ` +
  `[ -n "$old_backup" ] && rm -rf -- "$old_backup"; done`
);

// ---------- helpers ----------
function step(message) {
  console.log(`\n== ${message} ==`);
}
function fail(message) {
  console.error(`HATA: ${message}`);
  process.exit(1);
}
function runLocal(cmd, argv) {
  const result = spawnSync(cmd, argv, { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stdout ?? "");
    console.error(result.stderr ?? "");
    fail(`Komut basarisiz: ${cmd} ${argv.join(" ")}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
}
function sshRun(remoteCommand) {
  const result = spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", deployHost, remoteCommand], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    console.error(result.stdout ?? "");
    console.error(result.stderr ?? "");
    fail("Uzak komut basarisiz.");
  }
  if (result.stdout) process.stdout.write(result.stdout);
}
function sshCapture(remoteCommand) {
  const result = spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", deployHost, remoteCommand], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    console.error(result.stderr ?? "");
    fail("Uzak okuma basarisiz.");
  }
  return (result.stdout ?? "").replace(/\n$/, "");
}
function grepLocal(pattern, roots) {
  const hits = [];
  const walk = (path) => {
    const result = spawnSync("rg", ["-n", "--no-messages", pattern, path], { encoding: "utf8" });
    if (result.status === 0 && result.stdout) hits.push(result.stdout.trim());
  };
  for (const r of roots) walk(r);
  return hits;
}
function grepLocalFixedString(needle, roots) {
  const hits = [];
  for (const r of roots) {
    const result = spawnSync("rg", ["-n", "--no-messages", "--fixed-strings", "--", needle, r], { encoding: "utf8" });
    if (result.status === 0 && result.stdout) {
      // Dosya adlarini goster, eslesen secret icerigini loglama.
      const files = new Set(result.stdout.split("\n").map((line) => line.split(":")[0]));
      for (const f of files) hits.push(`secret eslesmesi: ${f}`);
    }
  }
  return hits;
}
function promptSync(question) {
  const fs = spawnSync("bash", ["-c", `read -r -p ${JSON.stringify(question)} answer; printf '%s' "$answer"`], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"]
  });
  return fs.stdout ?? "";
}
function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function sha256FileHex(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function statSize(path) {
  const result = spawnSync("stat", ["-c", "%s", path], { encoding: "utf8" });
  if (result.status !== 0) fail(`Dosya boyutu okunamadi: ${path}`);
  const size = Number((result.stdout ?? "").trim());
  if (!Number.isSafeInteger(size) || size < 1) fail(`Gecersiz dosya boyutu: ${path}`);
  return size;
}
function packageVersion(path) {
  if (!existsSync(path)) fail(`package.json bulunamadi: ${path}`);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const version = String(parsed.version ?? "").trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`Gecersiz package version: ${path}`);
  }
  return version;
}
function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
async function smokeDownloads(base, artifacts) {
  for (const artifact of artifacts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${base}/downloads/${encodeURIComponent(artifact.name)}`, {
        method: "HEAD",
        signal: controller.signal
      });
      if (response.status !== 200) {
        fail(`${artifact.label} HTTP smoke basarisiz: ${response.status}`);
      }
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > 0 && contentLength !== artifact.size) {
        fail(
          `${artifact.label} HTTP boyutu uyusmuyor: remote=${contentLength}, local=${artifact.size}`
        );
      }
      console.log(`${artifact.label} download: 200 (${artifact.name})`);
    } finally {
      clearTimeout(timer);
    }
  }
}
async function smoke(base, secret) {
  const expectedHash = sha256Hex(secret);
  const get = async (path, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
      const text = await response.text();
      return { response, text };
    } finally {
      clearTimeout(timer);
    }
  };

  const root = await get("/");
  if (root.response.status !== 200) fail(`GET / HTTP ${root.response.status}`);
  if (root.text.includes(STALE_HARDCODED)) fail("Canli kokte hardcoded var.");
  const meta = root.text.match(/name="ya-sync-key" content="([^"]*)"/);
  const win = root.text.match(/window\.__YA_SYNC_KEY__ = "([^"]*)"/);
  if (!meta || !win) fail("Sync key alani (meta/window) bulunamadi.");
  if (sha256Hex(meta[1]) !== expectedHash || sha256Hex(win[1]) !== expectedHash) {
    fail("Canli sync key degeri config ile eslesmiyor.");
  }
  console.log("Kok: 200, sync key config ile ayni, hardcoded yok.");

  const menu = await get("/yardimci-asistan/api/menu.php");
  if (menu.response.status !== 200 || !menu.text.includes('"ok":true')) fail("menu.php saglik kontrolu basarisiz.");
  console.log("menu.php: ok.");

  const business = await get("/yardimci-asistan/api/business.php");
  if (business.response.status !== 200 || !business.text.includes('"ok":true')) fail("business.php saglik kontrolu basarisiz.");
  console.log("business.php: ok.");

  const sync = await get("/yardimci-asistan/api/sync.php", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": secret },
    body: JSON.stringify({ action: "capabilities", sync_secret: secret })
  });
  if (sync.response.status !== 200 || !sync.text.includes('"protocol_version"')) fail("sync capabilities basarisiz.");
  console.log("sync capabilities: ok.");

  const operations = await get("/yardimci-asistan/api/operations.php", {
    headers: { "X-YA-Sync-Secret": secret }
  });
  if (operations.response.status !== 200 || !operations.text.includes('"ok":true')) fail("operations (gercek secret) basarisiz.");
  console.log("operations (gercek secret): ok:true.");

  const wrong = await get("/yardimci-asistan/api/operations.php", {
    headers: { "X-YA-Sync-Secret": "definitely-wrong-secret-0000" }
  });
  if (wrong.response.status !== 401) fail(`operations (yanlis secret) beklenen 401 degil: ${wrong.response.status}`);
  console.log("operations (yanlis secret): 401.");
}
