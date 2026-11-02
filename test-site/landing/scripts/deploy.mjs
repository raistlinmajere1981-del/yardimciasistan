#!/usr/bin/env node
/**
 * Demo release deployment. --fresh-web-module delegates clean backend installation to the existing canonical script.
 *
 * Deploys landing code:
 *   www/index.php
 *   www/favicon.png
 *   www/assets/     (showcase assets; add/update, never delete)
 *   www/inc/        (public-site shared PHP)
 *   www/odalar/
 *   www/restoran/
 *   www/qr-menu/
 *   www/magaza/
 *   www/yorumlar/
 *   www/iletisim/
 *   www/duyurular/, www/kurulum/, www/kullanim-kilavuzu/
 *   www/release.json
 *
 * With --with-downloads it also deploys the current release artifacts:
 *   www/downloads/YardimciAsistan-Setup-<version>.exe
 *   www/downloads/YardimciAsistan-Setup-<version>-x86.exe
 *   www/downloads/YardimciAsistan-Android-<version>.apk
 *   www/downloads/YardimciAsistan-Bayi-Android-<version>.apk (permanent release signature)
 *
 * Without --fresh-web-module, www/yardimci-asistan/** stays outside the landing package.
 * With that explicit flag the existing deploy-web.sh --fresh --skip-pack owns backend installation.
 *
 * Usage:
 *   node scripts/deploy.mjs --dry-run
 *   node scripts/deploy.mjs --dry-run --with-downloads
 *   node scripts/deploy.mjs --yes
 *   node scripts/deploy.mjs --yes --with-downloads
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import {tmpdir} from "node:os";
import {demoRoutes, retiredDemoPaths, stageDemoDeployment, readHtmlInputValue} from "../../../scripts/lib/demo-deployment.mjs";
import {createReleaseArtifacts,createWindowsUpdateManifests,createAndroidUpdateManifests,validatePreparedWebModule} from "../../../scripts/lib/release-artifacts.mjs";
import { getInstallation } from "../../../scripts/lib/installation-registry.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = join(repoRoot, "..", "..");
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(['--help','-h','--plan-local','--dry-run','--yes','--with-downloads','--fresh-web-module','--activate-updates','--resume-finalize']);
if ([...args].some(arg => !allowedArgs.has(arg))) fail('Bilinmeyen deploy seçeneği. --help kullanın.');
const dryRun = args.has('--dry-run');
const assumeYes = args.has('--yes');
const withDownloads = args.has('--with-downloads');
const freshWebModule = args.has('--fresh-web-module');
const activateUpdates = args.has('--activate-updates');
const resumeFinalize = args.has('--resume-finalize');
if ((freshWebModule || activateUpdates) && !withDownloads) fail('--fresh-web-module ve --activate-updates için --with-downloads gerekir.');
if (dryRun && assumeYes) fail('--dry-run ve --yes birlikte kullanılamaz.');
if (resumeFinalize && (!assumeYes || dryRun || !withDownloads || !freshWebModule || !activateUpdates)) fail('--resume-finalize yalnız tam temiz release sonrası --with-downloads --fresh-web-module --activate-updates --yes ile kullanılabilir.');

if (args.has("--help") || args.has("-h")) {
  console.log(`Landing deploy (landing-only).

Kullanim:
  node scripts/deploy.mjs --dry-run                    Sunucuda degisiklik yapmadan farki gosterir.
  node scripts/deploy.mjs --dry-run --with-downloads   Landing + kurulum dosyasi farklarini gosterir.
  node scripts/deploy.mjs --yes                        Backup + atomic deploy + HTTP smoke.
  node scripts/deploy.mjs --yes --with-downloads       Landing + Windows/APK paketlerini yayinlar.

Secenekler:
  --plan-local       Yerel paket, hash ve kontrollü temizleme planı; uzak bağlantı yok.
  --with-downloads    Windows x64/x86, Companion ve Bayi release APK'leri.
  --fresh-web-module  Aynı planda hazırlanmış web modülünü --fresh --skip-pack ile kurar.
  --activate-updates  Tüm site/dosya HTTP+SHA-256 kontrollerinden sonra Windows feed'lerini etkinleştirir.
  --resume-finalize  Yalnız önceden yüklenmiş 2.0.11 release'i doğrular ve kalan feed/temizleme adımlarını bitirir; yeniden yükleme yapmaz.
  Toplu temiz yayın: --with-downloads --fresh-web-module --activate-updates --dry-run (veya --yes).

Ortam degiskenleri:
  LANDING_DEPLOY_HOST            SSH hedefi
  LANDING_DEPLOY_WWW             Uzak www dizini
  LANDING_DEPLOY_BACKUP_PARENT   Uzak yedek ust dizini
  LANDING_PUBLIC_URL             Canli landing adresi
`);
  process.exit(0);
}

// A complete reviewable package with no SSH, credentials or remote reads.
const stagingRoot = mkdtempSync(join(tmpdir(), 'ya-demo-deploy-'));
process.on('exit', () => rmSync(stagingRoot, {recursive:true, force:true}));
const localStage = join(stagingRoot, 'site');
const build = spawnSync('npm', ['run', 'build:demo'], {cwd:monorepoRoot, stdio:args.has('--plan-local') ? 'ignore' : 'inherit'});
if (build.status !== 0) fail('Demo sunum derlemesi başarısız.');
const localPlan = stageDemoDeployment(repoRoot, localStage);


const landingInstallation = getInstallation("landing", monorepoRoot);
const yaInstallation = getInstallation("ya", monorepoRoot);

const deployHost = process.env.LANDING_DEPLOY_HOST ?? landingInstallation.deploy.host;
const remoteWww = (process.env.LANDING_DEPLOY_WWW ?? landingInstallation.deploy.remoteRoot).replace(/\/+$/, "");
const backupParent = (process.env.LANDING_DEPLOY_BACKUP_PARENT ?? landingInstallation.deploy.backupDir).replace(/\/+$/, "");
const publicUrl = (process.env.LANDING_PUBLIC_URL ?? landingInstallation.siteUrl).replace(/\/+$/, "");
const remoteWebModule = (process.env.YARDIMCI_ASISTAN_DEPLOY_ROOT ?? yaInstallation.deploy.remoteRoot).replace(/\/+$/, "");
const webModulePublicUrl = (process.env.YARDIMCI_ASISTAN_PUBLIC_URL ?? yaInstallation.webModuleUrl).replace(/\/+$/, "");

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

const localIndex = join(localStage, "index.php");
const localFavicon = join(localStage, "favicon.png");
const localAssets = join(localStage, "assets");
const localSite = localStage;
const localRelease = join(localStage, "release.json");
const publicRouteDirs = demoRoutes;
const downloadArtifacts = [];
const updateManifests = [];
const localDeployTmp = join(stagingRoot, "updates");
let releaseProduct;
let webPlan;
if (withDownloads) {
  const verified = await createReleaseArtifacts(monorepoRoot);
  releaseProduct = verified.product;
  downloadArtifacts.push(...verified.artifacts);
  if (freshWebModule) webPlan = await validatePreparedWebModule(monorepoRoot, {target:{installationId:yaInstallation.id, moduleUrl:webModulePublicUrl, siteOrigin:new URL(publicUrl).origin}});
  if (activateUpdates) {
    mkdirSync(localDeployTmp, {recursive:true});
    const notes=String(process.env.YA_UPDATE_NOTES ?? '').split(/\r?\n/).map(note=>note.trim()).filter(Boolean).slice(0,20);
    for(const manifest of [...createWindowsUpdateManifests(releaseProduct,downloadArtifacts,notes),...createAndroidUpdateManifests(releaseProduct,downloadArtifacts,notes)]) {
      const localPath=join(localDeployTmp,`release-${manifest.platformDir}.json`);
      writeFileSync(localPath,JSON.stringify(manifest.value,null,2)+'\n');
      updateManifests.push({...manifest,localPath});
    }
  }

}

if (args.has('--plan-local')) {
  console.log(JSON.stringify({...localPlan,downloads:downloadArtifacts.map(({label,name,size,sha256})=>({label,name,size,sha256})),webModule:webPlan ?? null,activateUpdates,activationOrder:[...(freshWebModule?['web-module-fresh']:[]),'site',...(withDownloads?['downloads']:[]),'HTTP-and-SHA256',...(activateUpdates?['Windows-and-Android-update-feeds']:[])]},null,2));
  process.exit(0);
}

step("Yerel PHP syntax kontrolu");
runLocal("php", ["-l", localIndex]);
runLocal("sh", ["-c", `find '${localSite}' -type f -name '*.php' -print | while IFS= read -r file; do php -l "$file" >/dev/null || exit 1; done`]);
console.log("Site PHP dosyalari temiz.");

step("Yerel site JavaScript syntax kontrolu");
for (const script of [
  join(localSite, "assets", "js", "upper.js"),
  join(localSite, "assets", "js", "flag-language.js")
]) {
  runLocal(process.execPath, ["--check", script]);
}
console.log("Site JavaScript dosyalari temiz.");

// Eski hardcoded test degeri: bilerek parcali yazildi ki bu dosya
// repo genelinde literal taramasina takilmasin. Guard amaclidir,
// deploy edilen bir secret degildir.
const STALE_HARDCODED = ["112233", "445566"].join("");

step("Kaynakta hardcoded secret taramasi");
const hardcodedHits = grepLocal(STALE_HARDCODED, [localIndex, localAssets, localSite]);
if (hardcodedHits.length > 0) {
  console.error(hardcodedHits.join("\n"));
  fail("Kaynakta hardcoded deger var; deploy durduruldu.");
}
console.log("Kaynakta hardcoded deger yok.");

step("Canli sync_secret okunuyor (yalniz uzunluk loglanir)");
const liveSecret = freshWebModule ? String(JSON.parse(readFileSync(join(monorepoRoot, "artifacts/web-module-deploy/yardimci-asistan/config/business.json"), "utf8")).sync_secret) : sshCapture(`php -r '$c=json_decode(file_get_contents("${remoteWebModule}/config/business.json"), true); echo trim((string)($c["sync_secret"] ?? ""));'`);
if (!liveSecret) fail("Canli sync_secret okunamadi; deploy durduruldu.");
console.log(`Canli sync_secret uzunlugu: ${liveSecret.length}`);

step("Gercek secret'in kaynaga gomulmedigi kontrol ediliyor");
const leakHits = grepLocalFixedString(liveSecret, [localIndex, localAssets, localSite]);
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
const remoteUpdates = `${remoteWww}/updates/stable`;

if (dryRun) {
  if (freshWebModule) runLocal('bash', [join(monorepoRoot,'scripts/deploy-web.sh'),'--fresh','--skip-pack','--dry-run']);
  step("Dry-run: uzak farklar (degisiklik yapilmaz)");
  console.log("Yedek sonrası temizlenecek eski yollar:", retiredDemoPaths.join(", "));
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
  console.log("Public-site ortak PHP farklari (/inc):");
  runLocal("rsync", [
    "-azn",
    "--delete",
    "--itemize-changes",
    "-e",
    "ssh -o BatchMode=yes -o ConnectTimeout=15",
    `${localSite}/inc/`,
    `${deployHost}:${remoteWww}/inc/`
  ]);
  for (const route of publicRouteDirs) {
    console.log(`Public route farklari: /${route}/`);
    runLocal("rsync", [
      "-azn",
      "--delete",
      "--itemize-changes",
      "-e",
      "ssh -o BatchMode=yes -o ConnectTimeout=15",
      `${localSite}/${route}/`,
      `${deployHost}:${remoteWww}/${route}/`
    ]);
  }
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
    console.log(activateUpdates ? 'Windows ve Android feed etkinleşmesi: site ve tüm dosyaların HTTP+SHA-256 kontrolünden sonra.' : 'Güncelleme feed etkinleştirme seçilmedi.');
    for (const manifest of updateManifests) {
      console.log(`${manifest.label} update feed: /updates/stable/${manifest.platformDir}/release.json -> ${manifest.version}`);
    }
  }
  console.log("\nDry-run tamamlandi; sunucuda degisiklik yapilmadi.");
  process.exit(0);
}

if (resumeFinalize) {
  step('Kesintiden devam: mevcut yayının release.json ve modül sürümü doğrulanıyor');
  const remoteRelease = `${remoteWww}/release.json`;
  const remoteReleaseHash = sshCapture(`php -r 'echo hash_file("sha256", $argv[1]);' '${remoteRelease}'`);
  if (remoteReleaseHash !== sha256FileHex(localRelease)) fail('Canlı release.json hazırlanmış release ile aynı değil; devam işlemi reddedildi.');
  const versionResponse = await fetch(`${webModulePublicUrl}/api/version.php`, { headers: { 'Cache-Control': 'no-cache' } });
  if (versionResponse.status !== 200) fail('Canlı web modülü sürümü okunamadı.');
  const version = await versionResponse.json();
  if (version.product_version !== releaseProduct.version || version.web_module_version !== webPlan?.webModuleVersion) fail('Canlı web modülü sürümü hazırlanan release ile eşleşmiyor.');
  await finalizePublishedRelease();
  console.log('Kesintiden devam tamamlandı. Dört dosya zaten yayınlandığından web modülü/site/installer yeniden yüklenmedi.');
  cleanupLandingBackups();
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

if (freshWebModule) {
  step('Aynı release planındaki web modülü temiz kuruluyor');
  runLocal('bash',[join(monorepoRoot,'scripts/deploy-web.sh'),'--fresh','--skip-pack','--yes']);
}

step(`Yedek aliniyor: ${remoteBackup}`);
sshRun(`mkdir -p ${remoteBackup} && test ! -e ${remoteTmpIndex} && test ! -e ${remoteTmpFavicon}`);
sshRun(
  `cd ${remoteWww} && ` +
    `for f in index.php index.html favicon.png release.json; do [ -f "$f" ] && cp -p "$f" ${remoteBackup}/ || true; done && ` +
    `[ -d assets ] && cp -a assets ${remoteBackup}/ || true && ` +
    `for d in inc hakkimizda galeri odalar restoran qr-menu magaza bayi hesabim yorumlar iletisim duyurular kurulum kullanim-kilavuzu instagram deneme locales demo; do [ -d "$d" ] && cp -a "$d" ${remoteBackup}/ || true; done && ` +
    `ls -la ${remoteBackup}/`
);

step("Gecici isimle upload + syntax kontrolu");
runLocal("scp", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", localIndex, `${deployHost}:${remoteTmpIndex}`]);
runLocal("scp", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", localFavicon, `${deployHost}:${remoteTmpFavicon}`]);
sshRun(`php -l ${remoteTmpIndex}`);

step("Assetler esitleniyor (ekleme/guncelleme, silme yok)");
runLocal("rsync", [
  "-az",
  "--omit-dir-times",
  "-e",
  "ssh -o BatchMode=yes -o ConnectTimeout=15",
  `${localAssets}/`,
  `${deployHost}:${remoteWww}/assets/`
]);

step("Showcase root rotaları yayınlanıyor");
sshRun(`mkdir -p '${remoteWww}/inc'`);
runLocal("rsync", [
  "-az",
  "--delete",
  "--omit-dir-times",
  "-e",
  "ssh -o BatchMode=yes -o ConnectTimeout=15",
  `${localSite}/inc/`,
  `${deployHost}:${remoteWww}/inc/`
]);
for (const route of publicRouteDirs) {
  sshRun(`mkdir -p '${remoteWww}/${route}'`);
  runLocal("rsync", [
    "-az",
    "--delete",
    "--omit-dir-times",
    "-e",
    "ssh -o BatchMode=yes -o ConnectTimeout=15",
    `${localSite}/${route}/`,
    `${deployHost}:${remoteWww}/${route}/`
  ]);
}
const publicPhpRoots = ["inc", ...publicRouteDirs].map((route) => `'${remoteWww}/${route}'`).join(" ");
sshRun(`find ${publicPhpRoots} -type f -name '*.php' -print | while IFS= read -r file; do php -l "$file" >/dev/null || exit 1; done`);

step("Atomic devreye alma");
sshRun(`mv ${remoteTmpIndex} ${remoteWww}/index.php && mv ${remoteTmpFavicon} ${remoteWww}/favicon.png && php -l ${remoteWww}/index.php`);

if (withDownloads) {
  step("Kurulum dosyalari atomik olarak yayinlaniyor");
  sshRun(`mkdir -p ${remoteDownloads}`);
  for (const artifact of downloadArtifacts) {
    if (sha256FileHex(artifact.source) !== artifact.sha256) fail(`${artifact.label}: doğrulamadan sonra dosya değişti.`);
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

step("Doğrulanmış dosyalardan sonra indirme sürüm metadata’sı etkinleştiriliyor");
const remoteReleaseTmp = `${remoteWww}/.release-${stamp}.json`;
runLocal('scp',['-o','BatchMode=yes','-o','ConnectTimeout=15',localRelease,`${deployHost}:${remoteReleaseTmp}`]);
if (sshCapture(`php -r 'echo hash_file("sha256", $argv[1]);' '${remoteReleaseTmp}'`) !== sha256FileHex(localRelease)) fail('release.json upload hash uyuşmazlığı.');
sshRun(`mv '${remoteReleaseTmp}' '${remoteWww}/release.json'`);

step("Uzak dogrulama: hardcoded yok, syntax temiz");
sshRun(`php -l ${remoteWww}/index.php`);
const remoteGrep = sshCapture(
  `grep -r -c '${STALE_HARDCODED}' ${remoteWww}/index.php ${remoteWww}/inc/demo-installation.php 2>/dev/null || echo CLEAN`
);
if (!remoteGrep.includes("CLEAN") && remoteGrep.trim() !== "0") {
  // grep -c her dosya icin sayi basar; 0 disinda sayi varsa kirli demektir.
  const dirty = remoteGrep.split("\n").some((line) => !line.endsWith(":0") && line.trim() !== "CLEAN" && line.trim() !== "0");
  if (dirty) fail(`Sunucuda hardcoded bulundu:\n${remoteGrep}`);
}
console.log("Sunucuda hardcoded yok.");

await finalizePublishedRelease();

console.log("\nYayin tamamlandi.");
console.log(`Canli adres: ${publicUrl}`);
console.log(`Yedek: ${remoteBackup}`);
if (withDownloads) {
  console.log("Windows x64/x86 installer ve Android release APK /downloads altinda guncellendi.");
}
console.log(freshWebModule ? 'Web modülü aynı planla temiz kuruldu; eski runtime verisi taşınmadı.' : 'Web modülü değiştirilmedi.');

cleanupLandingBackups();

async function finalizePublishedRelease() {
  step("HTTP smoke");
  await smoke(publicUrl, liveSecret, webModulePublicUrl);
  // Retire only reviewed old paths after successful HTTP smoke; backups retain rollback files.
  sshRun(`rm -rf -- ${retiredDemoPaths.map(path => `'${remoteWww}/${path}'`).join(' ')}`);
  if (withDownloads) {
    await smokeDownloads(publicUrl, downloadArtifacts, []);
    // An explicit flag is required; no feed is activated before all site/artifact checks pass.
    if (activateUpdates) {
      step("Windows ve Android guncelleme manifestleri yayinlaniyor");
      for (const manifest of updateManifests) {
        const remoteDir = `${remoteUpdates}/${manifest.platformDir}`;
        const remoteTmp = `${remoteDir}/.release.${stamp}.json`;
        sshRun(`mkdir -p '${remoteDir}' && rm -f '${remoteTmp}'`);
        runLocal("scp", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", manifest.localPath, `${deployHost}:${remoteTmp}`]);
        if (sshCapture(`php -r 'echo hash_file("sha256", $argv[1]);' '${remoteTmp}'`) !== sha256FileHex(manifest.localPath)) fail('Update manifest upload hash uyuşmazlığı.');
        sshRun(`mv '${remoteTmp}' '${remoteDir}/release.json'`);
        console.log(`${manifest.label}: /updates/stable/${manifest.platformDir}/release.json`);
      }
      await smokeDownloads(publicUrl, [], updateManifests);
    } else console.log('Güncelleme feed etkinleştirilmedi (--activate-updates seçilmedi).');

    if (activateUpdates) {
      step("Eski kurulum dosyalari temizleniyor");
      const keepNames = downloadArtifacts.map((artifact) => artifact.name);
      const keepTests = keepNames.map((name) => `! -name '${name}'`).join(" ");
      sshRun(
        `find '${remoteDownloads}' -mindepth 1 -maxdepth 1 -type f \\( ` +
        `-name 'YardimciAsistan-Setup-*.exe' -o -name 'YardimciAsistan-Android-*.apk' -o -name 'YardimciAsistan-Bayi-Android-*.apk' \\) ` +
        `${keepTests} -delete`
      );
    }
    for (const manifest of updateManifests) {
      rmSync(manifest.localPath, { force: true });
    }
  }
}

function cleanupLandingBackups() {
  step("Eski landing yedekleri temizleniyor (son 1 tutulur)");
  sshRun(
    `find '${backupParent}' -mindepth 1 -maxdepth 1 -type d -name 'landing-20??????T??????Z' -printf '%f\\n' | ` +
    `LC_ALL=C sort -r | tail -n +2 | while IFS= read -r old_name; do ` +
    `[ -n "$old_name" ] && rm -rf -- '${backupParent}/'"$old_name"; done`
  );
}

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
function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
async function smokeDownloads(base, artifacts, manifests) {
  for (const artifact of artifacts) {
    const controller = new AbortController();
    const transferTimeout = Math.max(60000, Math.min(600000, Math.ceil(artifact.size / (256 * 1024)) * 1000));
    const timer = setTimeout(() => controller.abort(), transferTimeout);
    try {
      const response = await fetch(`${base}/downloads/${encodeURIComponent(artifact.name)}`, {
        headers: {"Cache-Control":"no-cache"},
        signal: controller.signal
      });
      if (response.status !== 200) {
        fail(`${artifact.label} HTTP smoke basarisiz: ${response.status}`);
      }
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > 0 && !response.headers.has("content-encoding") && contentLength !== artifact.size) {
        fail(
          `${artifact.label} HTTP boyutu uyusmuyor: remote=${contentLength}, local=${artifact.size}`
        );
      }
      const downloadedHash = createHash('sha256');
      let downloadedSize=0;
      if (!response.body) fail(`${artifact.label}: HTTP dosya gövdesi yok.`);
      for await (const chunk of response.body) { downloadedHash.update(chunk); downloadedSize+=chunk.length; }
      if (downloadedHash.digest('hex') !== artifact.sha256 || downloadedSize !== artifact.size) fail(`${artifact.label}: HTTP SHA-256/boyut doğrulaması başarısız.`);
      console.log(`${artifact.label} download: 200 + SHA-256 (${artifact.name})`);
    } finally {
      clearTimeout(timer);
    }
  }

  for (const manifest of manifests) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${base}/updates/stable/${manifest.platformDir}/release.json`, {
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal
      });
      if (response.status !== 200) {
        fail(`${manifest.label} update manifest HTTP smoke basarisiz: ${response.status}`);
      }
      const body = await response.json();
      if (
        body?.format !== "yardimci-asistan-update"
        || body?.appVersion !== manifest.version
        || body?.artifact?.sha256 !== manifest.sha256
        || (manifest.applicationId && (
          body?.platform !== 'android'
          || body?.applicationId !== manifest.applicationId
          || body?.versionName !== manifest.version
          || body?.versionCode !== manifest.versionCode
          || body?.artifact?.file !== manifest.file
        ))
      ) {
        fail(`${manifest.label} update manifest icerigi dogrulanamadi.`);
      }
      console.log(`${manifest.label} update feed: 200 (${manifest.version})`);
    } finally {
      clearTimeout(timer);
    }
  }
}
async function smoke(base, secret, webModuleBase) {
  const expectedHash = sha256Hex(secret);
  const get = async (path, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const target = /^https?:\/\//.test(path) ? path : `${base}${path}`;
      const response = await fetch(target, { ...init, signal: controller.signal });
      const text = await response.text();
      return { response, text };
    } finally {
      clearTimeout(timer);
    }
  };

  const root = await get("/");
  if (root.response.status !== 200) fail(`GET / HTTP ${root.response.status}`);
  if (root.text.includes(STALE_HARDCODED)) fail("Canli kokte hardcoded var.");
  const installation = await get("/kurulum/", {headers:{'Cache-Control':'no-cache'}});
  const decoded = readHtmlInputValue(installation.text, 'demo-sync-secret');
  if (installation.response.status !== 200 || decoded === null || sha256Hex(decoded) !== expectedHash) {
    fail("Demo bağlantı anahtarı config ile eşleşmiyor.");
  }
  if (root.text.includes('type="module"') || root.text.includes('Canlı Sistem')) fail("Eski landing hâlâ aktif.");
  console.log("Kök: yeni showcase, demo anahtarı config ile aynı.");

  for (const path of ['/kurulum/', '/kullanim-kilavuzu/', '/deneme/']) {
    const page = await get(path);
    if (page.response.status !== 200) fail(`Demo route HTTP smoke başarısız: ${path} -> ${page.response.status}`);
  }
  const account = await get('/deneme/?page=account');
  if (![200,404].includes(account.response.status)) fail(`Demo account yayın kapısı başarısız: ${account.response.status}`);
  for (const path of ['/hakkimizda/','/galeri/','/odalar/','/odalar/oda/','/qr-menu/','/magaza/','/bayi/','/hesabim/','/yorumlar/','/iletisim/','/restoran/','/restoran/masa/','/duyurular/']) {
    const legacy = await get(path, {redirect:'manual'});
    const destination = legacy.response.headers.get('location') || '';
    if (legacy.response.status !== 308 || !destination.startsWith('/deneme/?page=')) fail(`Emekli rota yönlendirmesi başarısız: ${path}`);
    const page = await get(destination);
    if (![200,404].includes(page.response.status)) fail(`Şablon yayın kapısı başarısız: ${destination}`);
  }
  for (const path of ['assets/core/widget.js','assets/core/portal.js','assets/core/storefront.js','assets/core/site.mjs','assets/core/interaction-language.js']) {
    const asset = await get('/deneme/' + path);
    const expected = sha256FileHex(join(localSite,'deneme',path));
    if (asset.response.status !== 200 || sha256Hex(asset.text) !== expected) fail(`Ortak şablon asset hash'i eşleşmiyor: ${path}`);
  }
  console.log('İki katman, emekli rotalar, yayın kapıları ve ortak işlem asset hashleri: OK.');

  if (root.text.includes('src="/assets/assistant/widget.js"') || !root.text.includes('src="/assets/assistant/showcase.js"')) fail('Tanıtım/widget katman ayrımı doğrulanamadı.');
  for (const path of ['/deneme/core/i18n.php','/deneme/site/config.php','/deneme/locales/tr.json','/deneme/template-manifest.json']) {
    const result = await get(path);
    if (![403,404].includes(result.response.status)) fail(`Korunmayan şablon kaynağı: ${path}`);
  }
  const rootSource = await get('/?resource=translation-source');
  const testSource = await get('/deneme/?resource=translation-source');
  if (rootSource.response.status !== 200 || testSource.response.status !== 200 || JSON.parse(rootSource.text).revision !== JSON.parse(testSource.text).revision) fail('İki katman dil kaynağı eşleşmiyor.');
  const menu = await get(`${webModuleBase}/api/menu.php`);
  if (![200, 404].includes(menu.response.status)) fail(`menu.php beklenmeyen HTTP durumu: ${menu.response.status}`);
  if (menu.response.status === 200 && !menu.text.includes('"ok":true')) fail("menu.php 200 ama ok:true degil.");
  console.log(`menu.php: ${menu.response.status === 200 ? "yayinda" : "gizli"}.`);

  const business = await get(`${webModuleBase}/api/business.php`);
  if (business.response.status !== 200 || !business.text.includes('"ok":true')) fail("business.php saglik kontrolu basarisiz.");
  console.log("business.php: ok.");

  const sync = await get(`${webModuleBase}/api/sync.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": secret },
    body: JSON.stringify({ action: "capabilities", sync_secret: secret })
  });
  if (sync.response.status !== 200 || !sync.text.includes('"protocol_version"')) fail("sync capabilities basarisiz.");
  console.log("sync capabilities: ok.");

  const operations = await get(`${webModuleBase}/api/operations.php`, {
    headers: { "X-YA-Sync-Secret": secret }
  });
  if (operations.response.status !== 200 || !operations.text.includes('"ok":true')) fail("operations (gercek secret) basarisiz.");
  console.log("operations (gercek secret): ok:true.");

  const wrong = await get(`${webModuleBase}/api/operations.php`, {
    headers: { "X-YA-Sync-Secret": "definitely-wrong-secret-0000" }
  });
  if (wrong.response.status !== 401) fail(`operations (yanlis secret) beklenen 401 degil: ${wrong.response.status}`);
  console.log("operations (yanlis secret): 401.");
}
