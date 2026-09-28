/**
 * Merkezi task registry. Aynı komut farklı ekranlarda tekrar tanımlanmaz;
 * bölümler yalnızca bu listedeki id'lere referans verir.
 *
 * kind:
 *   task     tek gerçek komut (spawn command + args, shell yok)
 *   group    kontrol grubu; stopOnError=false ise tüm adımlar çalışır, sonda özet
 *   workflow sıralı operasyon; stopOnError=true ise ilk hatada durur
 *   builtin  komut değil, panel içi işlem (artifact listesi, veri temizliği)
 *
 * preflight: basic | android | deploy-ya | deploy-blacksea | release | null
 * confirm:   tehlikeli işlemlerde kullanıcıya gösterilen gerekçe
 * impact:    temiz başlangıç ekranında neyin etkilenip neyin korunduğu
 */
export const TASK_CATEGORIES = {
  checks: "Kontroller",
  android: "Android",
  web: "Web / Deploy",
  build: "Build / Release",
  fresh: "Temiz Başlangıç",
  devtools: "Geliştirici Araçları",
};

const NPM = "npm";

export const TASKS = [
  // ---------- Kontroller ----------
  { id: "verify-dev", kind: "task", title: "Dev Check", category: "checks", command: NPM, args: ["run", "verify:dev"], preflight: "basic", impact: ["Hızlı geliştirme kapısı; aynı prerequisite iki kez çalışmaz."] },
  { id: "verify-domain", kind: "task", title: "Domain Check", category: "checks", command: "node", args: ["scripts/verify.mjs", "--domain"], argsPrompt: [{ key: "domain", flag: null, prompt: "Domain (örn. hospitality, android, finance, web, desktop)", required: true }], preflight: "basic", impact: ["Seçilen domain'in kontrollerini ve gerekli prerequisite'leri bir kez çalıştırır."] },
  { id: "verify-check", kind: "task", title: "Tek kontrol çalıştır", category: "checks", command: "node", args: ["scripts/verify.mjs", "--check"], argsPrompt: [{ key: "check", flag: null, prompt: "Kontrol id (verify:list ile görülebilir)", required: true }], preflight: "basic" },
  { id: "verify-full", kind: "task", title: "Full Verify", category: "checks", command: NPM, args: ["run", "verify:full"], preflight: "basic", impact: ["Portable ürün testlerini, build/typecheck prerequisite'lerini tekrar etmeden çalıştırır."] },
  { id: "verify-pre-main", kind: "task", title: "Pre-main", category: "checks", command: NPM, args: ["run", "verify:pre-main"], preflight: "basic", impact: ["Full Verify + strict lint/Knip/design/architecture + git diff kapısı."] },
  { id: "verify-release", kind: "task", title: "Release Check", category: "checks", command: NPM, args: ["run", "verify:release"], preflight: "release", impact: ["Pre-main kapsamına paketleme ve release artifact doğrulamalarını ekler."] },
  { id: "verify-list", kind: "task", title: "Kontrol/preset/domain listesini göster", category: "checks", command: NPM, args: ["run", "verify:list"], preflight: null },
  { id: "verify-plan", kind: "task", title: "Pre-main planını göster", category: "checks", command: NPM, args: ["run", "verify:plan"], preflight: null },

  // Dar teşhis kontrolleri de aynı verification registry üzerinden gider.
  { id: "doctor", kind: "task", title: "Ortam kontrolü (doctor)", category: "checks", command: "node", args: ["scripts/verify.mjs", "--check", "doctor"], preflight: null },
  { id: "typecheck", kind: "task", title: "Typecheck (tüm workspace'ler)", category: "checks", command: "node", args: ["scripts/verify.mjs", "--check", "typecheck"], preflight: "basic" },
  { id: "typecheck-electron", kind: "task", title: "Typecheck Electron", category: "checks", command: "node", args: ["scripts/verify.mjs", "--check", "typecheck-electron"], preflight: "basic" },
  { id: "lint-strict", kind: "task", title: "Lint Strict", category: "checks", command: "node", args: ["scripts/verify.mjs", "--check", "lint-strict"], preflight: "basic" },
  { id: "lint-php", kind: "task", title: "PHP lint", category: "checks", command: "node", args: ["scripts/verify.mjs", "--check", "php-lint"], preflight: "basic" },
  { id: "knip-strict", kind: "task", title: "Knip Strict", category: "checks", command: "node", args: ["scripts/verify.mjs", "--check", "knip-strict"], preflight: "basic" },
  { id: "test-all", kind: "task", title: "Birim testleri", category: "checks", command: "node", args: ["scripts/verify.mjs", "--check", "unit-tests"], preflight: "basic" },
  { id: "e2e", kind: "task", title: "E2E (Playwright)", category: "checks", command: "node", args: ["scripts/verify.mjs", "--check", "e2e"], preflight: "basic" },
  { id: "arch-audit", kind: "task", title: "Mimari denetimi", category: "checks", command: "node", args: ["scripts/verify.mjs", "--check", "architecture-audit"], preflight: "basic" },
  { id: "design-audit-strict", kind: "task", title: "Tasarım sistemi denetimi", category: "checks", command: "node", args: ["scripts/verify.mjs", "--check", "design-audit-strict"], preflight: "basic" },
  { id: "smoke-diagnostics", kind: "task", title: "Tanılama domain kontrolü", category: "checks", command: "node", args: ["scripts/verify.mjs", "--domain", "diagnostics"], preflight: "basic" },

  // ---------- Android ----------
  { id: "android-devices", kind: "task", title: "Bağlı cihazları göster", category: "android", command: "adb", args: ["devices", "-l"], preflight: null },
  { id: "build-android-debug", kind: "task", title: "APK derle (debug)", category: "android", command: NPM, args: ["run", "build:android"], preflight: "android-sdk" },
  { id: "android-release-apk", kind: "task", title: "APK derle (release, imzalı)", category: "android", command: NPM, args: ["run", "android:release-apk"], preflight: "android-sdk" },
  { id: "android-release-aab", kind: "task", title: "AAB derle (release, Play)", category: "android", command: NPM, args: ["run", "android:release-aab"], preflight: "android-sdk" },
  { id: "android-install-debug", kind: "task", title: "APK yükle (debug derle + kur)", category: "android", command: NPM, args: ["run", "android:install"], preflight: "android" },
  { id: "android-install-release", kind: "task", title: "APK yükle (release derle + kur)", category: "android", command: NPM, args: ["run", "android:install", "--", "--release"], preflight: "android" },
  { id: "android-install-nobuild", kind: "task", title: "APK yükle (derlemeden, mevcut APK)", category: "android", command: NPM, args: ["run", "android:install", "--", "--no-build"], preflight: "android" },
  { id: "android-install-launch", kind: "task", title: "APK yükle + uygulamayı aç", category: "android", command: NPM, args: ["run", "android:install", "--", "--no-build", "--launch"], preflight: "android" },
  { id: "android-launch", kind: "task", title: "Uygulamayı başlat", category: "android", command: NPM, args: ["run", "android:control", "--", "launch"], preflight: "android" },
  { id: "android-screenshot", kind: "task", title: "Ekran görüntüsü al", category: "android", command: NPM, args: ["run", "android:screenshot"], preflight: "android" },
  { id: "android-dump", kind: "task", title: "UI hiyerarşisi dökümü", category: "android", command: NPM, args: ["run", "android:dump"], preflight: "android" },
  { id: "android-mirror", kind: "task", title: "Ekran yansıt (scrcpy, ön planda)", category: "android", command: NPM, args: ["run", "android:mirror"], preflight: "android", longRunning: true, mode: "inherit" },
  { id: "android-logcat", kind: "task", title: "Logcat dökümü (son loglar)", category: "android", command: "adb", args: ["logcat", "-d", "-v", "brief"], preflight: "android" },
  { id: "android-uninstall", kind: "task", title: "Uygulamayı kaldır", category: "android", command: "adb", args: ["uninstall", "com.yardimciasistan.android"], preflight: "android", confirm: "Uygulama telefondan kaldırılır; uygulama verisi de silinir.", impact: ["Telefon verisi silinir.", "Kaynak kod ve repo etkilenmez."] },
  { id: "android-clear-data", kind: "task", title: "Uygulama verisini temizle", category: "android", command: "adb", args: ["shell", "pm", "clear", "com.yardimciasistan.android"], preflight: "android", confirm: "Telefondaki uygulama verisi silinir (oturum/bağlantı bilgileri gider).", impact: ["Telefon uygulama verisi silinir.", "APK telefonda kalır.", "Repo etkilenmez."] },
  { id: "android-clean", kind: "task", title: "Clean build (Gradle clean + debug)", category: "android", command: "node", args: ["scripts/run-android-gradle.mjs", "clean", "assembleDebug"], preflight: "android-sdk", impact: ["apps/android-app/build yeniden üretilir."] },
  { id: "android-configure", kind: "task", title: "Bağlantı yapılandır", category: "android", command: NPM, args: ["run", "configure:android:connection"], preflight: "basic" },
  { id: "smoke-android-token", kind: "task", title: "Smoke: cihaz token", category: "android", command: NPM, args: ["run", "smoke:android-device-token"], preflight: "basic" },
  { id: "smoke-android-release-conn", kind: "task", title: "Smoke: release bağlantı", category: "android", command: NPM, args: ["run", "smoke:android-release-connection"], preflight: "basic" },
  { id: "smoke-android-approval", kind: "task", title: "Smoke: cihaz onay hosting", category: "android", command: NPM, args: ["run", "smoke:android-device-approval-hosting"], preflight: "basic" },
  { id: "smoke-local-companion", kind: "task", title: "Smoke: yerel companion sunucu", category: "android", command: NPM, args: ["run", "smoke:local-companion"], preflight: "basic" },
  { id: "android-release-flow", kind: "workflow", title: "Release APK üret + yükle", category: "android", steps: ["android-release-apk", "android-install-nobuild"], stopOnError: true, preflight: "android" },

  // ---------- Web / Deploy: Yardımcı Asistan (Alwaysdata) ----------
  { id: "ya-local-check", kind: "task", title: "YA lokal kontrol", category: "web", site: "ya", command: "node", args: ["scripts/verify.mjs", "--domain", "web"], preflight: "basic", impact: ["Web domain kontrolleri ve gerekli prerequisite'ler tek plan içinde çalışır."] },
  { id: "ya-pack", kind: "task", title: "YA web paketini hazırla", category: "web", site: "ya", command: NPM, args: ["run", "pack:web-module"], preflight: "basic", impact: ["artifacts/web-module-deploy yeniden üretilir; canlıya dokunmaz."] },
  { id: "ya-prepare-install", kind: "task", title: "YA kurulum paketi hazırla (yeni secret)", category: "web", site: "ya", command: NPM, args: ["run", "prepare:web-install", "--"], argsPrompt: [{ key: "url", flag: "--url", prompt: "Web modül adresi (örn. https://firma.com/yardimci-asistan)", required: true }, { key: "name", flag: "--name", prompt: "İşletme adı (boş bırakılabilir)", required: false }], preflight: "basic", confirm: "Yeni 256-bit sync secret üretilir ve paket hazırlanır.", impact: ["artifacts/web-module-deploy/install-info.txt yazılır (600 izinli).", "Secret yalnızca bu dosyadadır; Git'e eklenmez."] },
  { id: "ya-deploy-dry", kind: "task", title: "YA deploy farkını göster (dry-run)", category: "web", site: "ya", command: NPM, args: ["run", "deploy:web", "--", "--dry-run"], preflight: "deploy-ya", impact: ["Sunucuda değişiklik yapılmaz."] },
  { id: "ya-deploy", kind: "task", title: "YA deploy (Alwaysdata)", category: "web", site: "ya", command: NPM, args: ["run", "deploy:web"], preflight: "deploy-ya", mode: "inherit", interactive: true, confirm: "Canlı web modülü güncellenir (önce yedek alınır).", impact: ["data/, firma config, knowledge/, assets/ ve .env korunur.", "Önceki sürüm sunucudaki yedek dizinine alınır.", "Deploy sonrası script canlı HTTP kontrolü yapar."] },
  { id: "ya-deploy-fresh", kind: "task", title: "YA temiz kurulum (Alwaysdata, --fresh)", category: "web", site: "ya", command: NPM, args: ["run", "deploy:web", "--", "--fresh"], preflight: "deploy-ya", mode: "inherit", interactive: true, confirm: "Eski runtime/config yeni sürüme TAŞINMAZ. Yalnızca yedekte kalır.", impact: ["data/, business.json, knowledge/, assets/, .env taşınmaz.", "Eski kurulum sunucuda yedeklenir.", "Pakette sync secret olmalı (prepare:web-install)."] },

  // ---------- Web / Deploy: BlackSea (Natro) ----------
  { id: "bs-check", kind: "task", title: "BlackSea lokal kontrol", category: "web", site: "blacksea", cwd: "blacksea", command: "./scripts/check.sh", args: [], preflight: "basic" },
  { id: "bs-readiness", kind: "task", title: "BlackSea readiness", category: "web", site: "blacksea", cwd: "blacksea", command: "./scripts/readiness.sh", args: [], preflight: "basic" },
  { id: "bs-verify-live", kind: "task", title: "BlackSea canlı doğrulama", category: "web", site: "blacksea", cwd: "blacksea", command: "./scripts/verify-live.sh", args: [], argsPrompt: [{ key: "base", flag: null, prompt: "Canlı adres (boş = https://blackseapansiyon.com)", required: false }], preflight: null, impact: ["Salt okunur HTTP kontrolleri; sunucuyu değiştirmez."] },
  { id: "bs-prepare-update", kind: "task", title: "BlackSea güncelleme paketi hazırla", category: "web", site: "blacksea", cwd: "blacksea", command: "./scripts/prepare-natro-release.sh", args: ["update"], preflight: "basic", impact: ["artifacts/natro/update üretilir.", "Paket business.json/data/knowledge runtime içeriğini ezmez."] },
  { id: "bs-prepare-install", kind: "task", title: "BlackSea ilk kurulum paketi hazırla", category: "web", site: "blacksea", cwd: "blacksea", command: "./scripts/prepare-natro-release.sh", args: ["install"], preflight: "basic", confirm: "İlk kurulum secret'ı yoksa yeni sync secret üretilir.", impact: [".deploy/yardimci-asistan-install-info.txt korunur/oluşturulur (600 izinli).", "install-info arşivin dışındadır; sunucuya yüklenmez."] },
  { id: "bs-deploy-update", kind: "task", title: "BlackSea deploy (Natro, güncelleme)", category: "web", site: "blacksea", cwd: "blacksea", command: "./scripts/deploy-natro-ftp.sh", args: ["update"], preflight: "deploy-blacksea", confirm: "Canlı site güncellenir (--delete kullanılmaz, runtime korunur).", impact: ["Sunucudaki runtime dosyaları korunur.", "Kaldırılmış statik yüzeyler temizlenir."] },
  { id: "bs-deploy-install", kind: "task", title: "BlackSea ilk kurulum deploy (Natro)", category: "web", site: "blacksea", cwd: "blacksea", command: "./scripts/deploy-natro-ftp.sh", args: ["install"], preflight: "deploy-blacksea", confirm: "Site ilk kez canlıya kurulur. FTP şifresi terminalde gizli sorulur.", impact: ["NATRO_CLEAN_DEFAULT_PLACEHOLDER=1 ise Natro placeholder dosyaları temizlenir."] },
  { id: "bs-dev", kind: "task", title: "BlackSea dev sunucusu (ön planda)", category: "web", site: "blacksea", cwd: "blacksea", command: "./scripts/dev.sh", args: [], preflight: null, longRunning: true, mode: "inherit" },
  { id: "bs-mount-ya", kind: "task", title: "YA paketini BlackSea'e bağla (symlink)", category: "web", site: "blacksea", cwd: "blacksea", command: "./scripts/mount-yardimci-asistan.sh", args: [], preflight: "basic", impact: ["yardimci-asistan/ symlink olur; mevcut gerçek klasör silinmez."] },
  { id: "bs-refresh-ya", kind: "task", title: "YA paketini BlackSea bilgileriyle üret + bağla", category: "web", site: "blacksea", cwd: "blacksea", command: "./scripts/refresh-yardimci-asistan.sh", args: [], preflight: "basic", impact: ["Yalnız yerel geliştirme içindir; canlı secret üretmez."] },
  { id: "bs-release-update", kind: "workflow", title: "BlackSea güncelleme paketi (kontrol→readiness→paket)", category: "web", site: "blacksea", steps: ["bs-check", "bs-readiness", "bs-prepare-update"], stopOnError: true, preflight: "basic" },
  { id: "bs-deploy-flow", kind: "workflow", title: "BlackSea deploy akışı (paket→FTP→canlı doğrulama)", category: "web", site: "blacksea", steps: ["bs-release-update", "bs-deploy-update", "bs-verify-live"], stopOnError: true, preflight: "deploy-blacksea", confirm: "Canlı site güncellenir." },

  // ---------- Web / Deploy: test landing ----------
  { id: "landing-deploy-dry", kind: "task", title: "Landing deploy farkı (dry-run)", category: "web", site: "landing", command: NPM, args: ["run", "deploy:landing", "--", "--dry-run"], preflight: "basic", impact: ["Sunucuda değişiklik yapılmaz."] },
  { id: "landing-deploy", kind: "task", title: "Landing deploy (www kökü)", category: "web", site: "landing", command: NPM, args: ["run", "deploy:landing", "--", "--yes"], preflight: "basic", confirm: "Canlı landing (www kökü) güncellenir; web modülüne dokunmaz.", impact: ["www/yardimci-asistan/** alanına yazılmaz.", "Backup + atomic deploy + HTTP smoke yapılır."] },

  // ---------- Build / Release ----------
  { id: "product-version-show", kind: "task", title: "Ürün sürümünü göster", category: "build", command: "node", args: ["scripts/product-version.mjs", "show"], preflight: "basic" },
  { id: "product-version-set", kind: "task", title: "Ürün sürümünü güncelle (Desktop + Android)", category: "build", command: "node", args: ["scripts/product-version.mjs", "set"], argsPrompt: [{ key: "version", flag: null, prompt: "Yeni ürün sürümü (x.y.z, örn. 0.1.8)", required: true }], preflight: "basic", confirm: "Desktop ve Android aynı ürün sürümüne geçirilir; Android versionCode otomatik 1 artırılır.", impact: ["product-version.json tek sürüm kaynağıdır.", "Desktop/Android package metadata ve package-lock otomatik senkronlanır.", "Binary üretmez; yalnız sürüm metadata'sını günceller."] },
  { id: "build-packages", kind: "task", title: "Paketleri derle", category: "build", command: NPM, args: ["run", "build:packages"], preflight: "basic" },
  { id: "build-apps", kind: "task", title: "Uygulamaları derle", category: "build", command: NPM, args: ["run", "build:apps"], preflight: "basic" },
  { id: "build-all", kind: "task", title: "Tümünü derle", category: "build", command: NPM, args: ["run", "build"], preflight: "basic" },
  { id: "pack-desktop-dir", kind: "task", title: "Desktop paketle (dir, Linux)", category: "build", command: NPM, args: ["run", "pack:desktop:dir"], preflight: "basic", impact: ["Yayınlamaz (--publish never); yerel dizin çıktısı üretir."] },
  { id: "pack-desktop-linux", kind: "task", title: "Desktop AppImage (Linux)", category: "build", command: NPM, args: ["run", "pack:desktop:linux"], preflight: "basic", impact: ["Önce release APK'yı dahil eder; uzun sürer.", "Yayınlamaz (--publish never)."] },
  { id: "pack-desktop-win", kind: "task", title: "Desktop kurulum (Windows x64)", category: "build", command: NPM, args: ["run", "pack:desktop:win"], preflight: "basic", impact: ["Önce release APK'yı dahil eder; uzun sürer.", "Yayınlamaz (--publish never)."] },
  { id: "pack-desktop-win32", kind: "task", title: "Desktop kurulum (Windows x86)", category: "build", command: NPM, args: ["run", "pack:desktop:win32"], preflight: "basic", impact: ["Önce release APK'yı dahil eder; uzun sürer.", "Yayınlamaz (--publish never)."] },
  { id: "pack-web-module", kind: "task", title: "Web modülü paketi", category: "build", command: NPM, args: ["run", "pack:web-module"], preflight: "basic", impact: ["artifacts/web-module-deploy üretilir; canlıya dokunmaz."] },
  { id: "show-artifacts", kind: "builtin", title: "Artifact klasörünü göster (ad/boyut/hash)", category: "build", builtin: "show-artifacts" },
  { id: "release-desktop-linux", kind: "workflow", title: "Release Desktop (Linux)", category: "build", steps: ["typecheck", "build-all", "pack-desktop-linux", "show-artifacts"], stopOnError: true, preflight: "release", impact: ["Binary üretir; yayınlamaz."] },
  { id: "release-android", kind: "workflow", title: "Release Android (APK+AAB)", category: "build", steps: ["android-release-apk", "android-release-aab", "show-artifacts"], stopOnError: true, preflight: "release", impact: ["Binary üretir; yayınlamaz."] },

  // ---------- Temiz Başlangıç ----------
  { id: "fresh-lab-once", kind: "task", title: "Uygulamayı temiz veriyle başlat (web modülü smoke)", category: "fresh", command: "node", args: ["scripts/local-dev-lab.mjs", "--once"], preflight: "basic", impact: ["firm-template/web-module/data/*.sqlite* çalışma başında sıfırlanır.", "İşlem bitince önceki dosyalar geri yüklenir; kalıcı değişiklik yok.", "node_modules ve kaynak kod korunur."] },
  { id: "fresh-desktop-data", kind: "builtin", title: "Desktop uygulama verisini temizle", category: "fresh", builtin: "desktop-data-clean", confirm: "Desktop dev veritabanı silinir (data/yardimci-asistan.sqlite*).", impact: ["data/yardimci-asistan.sqlite* silinir.", "data/logs korunur.", "backup/ korunur.", "node_modules ve kaynak kod etkilenmez."] },
  { id: "fresh-artifacts", kind: "task", title: "Build çıktılarını temizle (artifacts/)", category: "fresh", command: NPM, args: ["run", "clean:artifacts"], preflight: null, impact: ["artifacts/ temizlenir.", "install-info.txt korunur.", "Kaynak kod etkilenmez."] },
  { id: "fresh-artifacts-all", kind: "task", title: "Build çıktılarını tam temizle (install-info dahil)", category: "fresh", command: NPM, args: ["run", "clean:artifacts:all"], preflight: null, confirm: "install-info.txt de silinir; kurulum secret'ı yalnız yedekte kalır.", impact: ["artifacts/ tamamen temizlenir.", "install-info.txt silinir.", "Kaynak kod etkilenmez."] },
  { id: "fresh-test-data", kind: "task", title: "Test verilerini sıfırla (lab + artifacts dry)", category: "fresh", command: NPM, args: ["run", "clean:artifacts:dry"], preflight: null, impact: ["Salt listeleme; hiçbir dosya silinmez."] },
  { id: "fresh-deps-cache", kind: "task", title: "Dependency cache temizliği (npm cache)", category: "fresh", command: NPM, args: ["cache", "clean", "--force"], preflight: null, confirm: "npm önbelleği tamamen temizlenir; sonraki kurulum daha uzun sürer.", impact: ["node_modules korunur.", "Kaynak kod etkilenmez."] },
  { id: "fresh-full", kind: "workflow", title: "Tam geliştirici temizliği", category: "fresh", steps: ["fresh-artifacts", "android-clean"], stopOnError: false, confirm: "artifacts/ ve Android build çıktıları temizlenir.", impact: ["node_modules korunur.", "Kaynak kod ve veritabanları etkilenmez."] },

  // ---------- Geliştirici Araçları ----------
  { id: "dev-desktop", kind: "task", title: "Desktop dev (ön planda)", category: "devtools", command: NPM, args: ["run", "dev:desktop"], preflight: "basic", longRunning: true, mode: "inherit" },
  { id: "dev-local", kind: "task", title: "Yerel lab (ön planda, veri korunur)", category: "devtools", command: NPM, args: ["run", "dev:local"], preflight: "basic", longRunning: true, mode: "inherit" },
  { id: "dev-php", kind: "task", title: "PHP modül sunucusu (ön planda)", category: "devtools", command: NPM, args: ["run", "dev:php-module"], preflight: "basic", longRunning: true, mode: "inherit" },
  { id: "logs-list", kind: "task", title: "Tanılama oturumlarını listele", category: "devtools", command: NPM, args: ["run", "logs:list"], preflight: null },
  { id: "logs-latest", kind: "task", title: "Son oturum özeti", category: "devtools", command: NPM, args: ["run", "logs:latest"], preflight: null },
  { id: "logs-errors", kind: "task", title: "Son oturum hata/WARN kayıtları", category: "devtools", command: NPM, args: ["run", "logs:errors"], preflight: null },
];

const BY_ID = new Map(TASKS.map((t) => [t.id, t]));

export function getTask(id) {
  return BY_ID.get(id);
}

export function tasksByCategory(category, { blackseaAvailable = true } = {}) {
  return TASKS.filter((t) => {
    if (t.category !== category) return false;
    if (t.site === "blacksea" && !blackseaAvailable) return false;
    return true;
  });
}

export function validateRegistry() {
  const errors = [];
  const ids = new Set();
  for (const t of TASKS) {
    if (ids.has(t.id)) errors.push(`yinelenen id: ${t.id}`);
    ids.add(t.id);
    if (!["task", "group", "workflow", "builtin"].includes(t.kind)) errors.push(`${t.id}: geçersiz kind`);
    if ((t.kind === "group" || t.kind === "workflow") && (!Array.isArray(t.steps) || t.steps.length === 0)) {
      errors.push(`${t.id}: adım yok`);
    }
    for (const s of t.steps ?? []) {
      if (!ids.has(s) && !TASKS.some((x) => x.id === s)) errors.push(`${t.id}: bilinmeyen adım ${s}`);
    }
    if (t.kind === "task" && (typeof t.command !== "string" || !Array.isArray(t.args))) {
      errors.push(`${t.id}: command/args eksik`);
    }
  }
  return errors;
}
