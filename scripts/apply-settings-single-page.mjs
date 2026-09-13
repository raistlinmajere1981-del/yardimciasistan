import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const setupFormPath = join(root, "apps/desktop-app/src/components/settings/SetupForm.tsx");
const setupWizardPath = join(root, "apps/desktop-app/src/components/settings/SetupWizard.tsx");
const capabilitiesPath = join(root, "apps/desktop-app/src/components/settings/BusinessCapabilitySettings.tsx");
const setupCssPath = join(root, "apps/desktop-app/src/components/settings/setup-capabilities.css");
const maintenancePath = join(root, "apps/desktop-app/src/components/settings/DataMaintenanceSettings.tsx");

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Ayar refactorü uygulanamadı: ${label} bulunamadı.`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ayar refactorü uygulanamadı: ${label} birden fazla kez bulundu.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let setup = readFileSync(setupFormPath, "utf8");
if (!setup.includes('className="settings-section-nav"')) {
  setup = replaceOnce(setup, '  const [settingsLevel, setSettingsLevel] = useState<"basic" | "advanced">("basic");\n', "", "ayar düzeyi state");
  setup = replaceOnce(
    setup,
    `        <div className="settings-level-tabs" role="tablist" aria-label="Ayar düzeyi">\n          <button className={settingsLevel === "basic" ? "is-active" : ""} type="button" role="tab" aria-selected={settingsLevel === "basic"} onClick={() => setSettingsLevel("basic")}>Temel Ayarlar</button>\n          <button className={settingsLevel === "advanced" ? "is-active" : ""} type="button" role="tab" aria-selected={settingsLevel === "advanced"} onClick={() => setSettingsLevel("advanced")}>Gelişmiş Ayarlar</button>\n        </div>\n`,
    `        {embedded && <nav className="settings-section-nav" aria-label="Ayar bölümleri">\n          <a href="#settings-business">İşletmem</a>\n          <a href="#settings-public">Müşteri bilgileri</a>\n          <a href="#settings-operations">İşletme düzeni</a>\n          <a href="#settings-connections">Bağlantılar</a>\n          <a href="#settings-application">Uygulama</a>\n          <a href="#settings-maintenance">Bakım</a>\n        </nav>}\n`,
    "Temel/Gelişmiş sekmeleri"
  );
  setup = replaceOnce(setup, '{settingsLevel === "basic" && <div className="settings-section-grid settings-basic-grid">', '<div className="settings-section-grid settings-basic-grid">', "temel ayarlar koşulu");
  setup = replaceOnce(
    setup,
    `        </div>}\n\n        {settingsLevel === "advanced" && <div className="settings-section-grid settings-advanced-grid"><div className="setup-section settings-web-section">`,
    `        </div>\n\n        <div className="settings-section-grid settings-advanced-grid"><div className="setup-section settings-web-section">`,
    "temel/gelişmiş ayarlar sınırı"
  );
  setup = replaceOnce(setup, `        </div>}\n\n        {!embedded && <footer`, `        </div>\n\n        {!embedded && <footer`, "gelişmiş ayarlar kapanışı");

  setup = setup
    .replace('<div className="setup-section appearance-settings">', '<div id="settings-application" className="setup-section appearance-settings">')
    .replace('<div className="setup-section settings-identity-section">', '<div id="settings-business" className="setup-section settings-identity-section">')
    .replace('<div className="setup-section settings-services-section">', '<div id="settings-connections" className="setup-section settings-services-section">')
    .replace('<div className="setup-section settings-daily-section">', '<div id="settings-operations" className="setup-section settings-daily-section">')
    .replace('<h2>Temel Tanım</h2>', '<h2>İşletmem</h2>')
    .replace('<h2>Günlük Kullanım</h2>', '<h2>İşletme Düzeni</h2>');

  const aiToggle = `          <label className="setup-checkline settings-ai-toggle">\n            <input checked={form.aiEnabled} onChange={(event) => update("aiEnabled", event.target.checked)} type="checkbox" />\n            AI cevap önerileri açık\n          </label>\n`;
  setup = replaceOnce(setup, aiToggle, "", "eski AI aç/kapat alanı");
  setup = replaceOnce(
    setup,
    `            <label>\n              <input checked={form.androidEnabled} onChange={(event) => update("androidEnabled", event.target.checked)} type="checkbox" />\n              Android\n            </label>\n`,
    `            <label>\n              <input checked={form.androidEnabled} onChange={(event) => update("androidEnabled", event.target.checked)} type="checkbox" />\n              Android\n            </label>\n            <label>\n              <input checked={form.aiEnabled} onChange={(event) => update("aiEnabled", event.target.checked)} type="checkbox" />\n              AI Yardımcı\n            </label>\n`,
    "bağlı servisler Android alanı"
  );
  setup = setup.replace(/\n\s*<small>\{setupData\.aiLastPublishedAt \? `Web ayarı son yayın: \$\{formatDateTime\(setupData\.aiLastPublishedAt\)\}` : "Web ayarı henüz bu cihazdan yayınlanmadı\."\}<\/small>/, "");
  writeFileSync(setupFormPath, setup);
}

let wizard = readFileSync(setupWizardPath, "utf8");
if (!wizard.includes("settings-advanced-details")) {
  wizard = wizard.replace('<div className="setup-public-profile-shell">', '<div id="settings-public" className="setup-public-profile-shell">');
  wizard = replaceOnce(
    wizard,
    `        <div className="setup-capability-editor-shell">\n          <BusinessCapabilityEditor`,
    `        <details className="setup-capability-editor-shell settings-advanced-details">\n          <summary>Gelişmiş işletme özellikleri</summary>\n          <div className="settings-advanced-details-body">\n          <BusinessCapabilityEditor`,
    "özel yetenekler paneli başlangıcı"
  );
  wizard = replaceOnce(
    wizard,
    `          />\n        </div>\n      )}\n    </div>`,
    `          />\n          </div>\n        </details>\n      )}\n    </div>`,
    "özel yetenekler paneli kapanışı"
  );
  writeFileSync(setupWizardPath, wizard);
}

let capabilities = readFileSync(capabilitiesPath, "utf8");
capabilities = capabilities
  .replace('message = "İşletme yetenekleri profil varsayımlarını kullanıyor."', 'message = ""')
  .replace('<h2>Özel Yetenekler</h2>', '<h2>İşletme Özellikleri</h2>')
  .replace('Çekirdek müşteri, takvim, kasa, rapor, web, senkron, yedek ve cihaz yetenekleri sürekli açıktır. Burada yalnız domain çalışma alanlarını profile ekleyebilir veya profilden çıkarabilirsiniz.', 'Seçtiğiniz sektör için önerilen özellikler otomatik gelir. Yalnız ihtiyacınız olan ek alanları buradan açıp kapatın.')
  .replace('Profil seçimi değişti. Özel yetenekleri düzenlemeden önce Ayarları Kaydet ile yeni profili uygulayın.', 'Önce üst bölümdeki sektör değişikliğini kaydedin.')
  .replace('Profil Varsayımına Dön', 'Önerilen Ayara Dön')
  .replace('title: "Yiyecek & İçecek"', 'title: "Restoran / Kafe"')
  .replace('title: "Ticaret Çekirdeği"', 'title: "Satış ve Stok"')
  .replace('title: "Perakende"', 'title: "Market"');
capabilities = replaceOnce(
  capabilities,
  `<small>{blockedReason || (capability === C.CUSTOMER_CREDIT\n                      ? "Kayıtlı müşterilerin veresiye satış ve tahsilat hareketlerini takip eder."\n                      : capability)}</small>`,
  `<small>{blockedReason || (capability === C.CUSTOMER_CREDIT\n                      ? "Kayıtlı müşterilerin veresiye satış ve tahsilat hareketlerini takip eder."\n                      : \`${'${capabilityLabel(capability)}'} özelliğini kullanıma açar.\`)}</small>`,
  "teknik capability kimliği"
);
capabilities = capabilities.replace('<p className={`menu-status sync-${state}`} role="status" aria-live="polite">{message}</p>', '{state !== "idle" && message && <p className={`menu-status sync-${state}`} role="status" aria-live="polite">{message}</p>}');
writeFileSync(capabilitiesPath, capabilities);

let maintenance = readFileSync(maintenancePath, "utf8");
if (!maintenance.includes('id="settings-maintenance"')) {
  maintenance = maintenance.replace('<div className="setup-section settings-data-maintenance-section backup-manager"', '<div id="settings-maintenance" className="setup-section settings-data-maintenance-section backup-manager"');
  writeFileSync(maintenancePath, maintenance);
}

writeFileSync(setupCssPath, `/* Unified, user-focused settings layout. */
.setup-capabilities { min-width: 0; }
.setup-capabilities:has(> .setup-shell.is-embedded) { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--space-3); align-items: start; }
.setup-capabilities > .setup-shell.is-embedded,
.setup-capabilities > .setup-shell.is-embedded > .setup-form-surface,
.setup-capabilities .settings-basic-grid,
.setup-capabilities .settings-advanced-grid { display: contents; }
.settings-section-nav { order: 0; grid-column: 1 / -1; position: sticky; top: 0; z-index: 8; display: flex; flex-wrap: wrap; gap: var(--space-1); width: fit-content; max-width: 100%; padding: var(--space-1); border: 1px solid var(--line); border-radius: var(--radius-lg); background: color-mix(in srgb, var(--paper) 94%, transparent); box-shadow: var(--shadow-sm); backdrop-filter: blur(10px); }
.settings-section-nav a { display: inline-flex; min-height: 34px; align-items: center; padding: 6px 11px; border-radius: var(--radius-md); color: var(--muted); font-size: var(--text-sm); font-weight: 750; text-decoration: none; }
.settings-section-nav a:hover, .settings-section-nav a:focus-visible { color: var(--primary); background: var(--primary-soft); outline: none; }
.setup-capabilities .setup-section { min-width: 0; scroll-margin-top: 72px; }
.setup-capabilities .settings-identity-section { order: 10; grid-column: span 6; }
.setup-capabilities .appearance-settings { order: 11; grid-column: span 6; }
.setup-capabilities .settings-password-section { order: 12; grid-column: span 6; }
.setup-capabilities .setup-public-profile-shell { order: 20; grid-column: 1 / -1; display: block; }
.setup-capabilities .settings-daily-section { order: 30; grid-column: 1 / -1; }
.setup-capabilities .room-management-settings { order: 31; grid-column: 1 / -1; }
.setup-capabilities .settings-services-section { order: 40; grid-column: span 6; }
.setup-capabilities .settings-web-section { order: 41; grid-column: span 6; }
.setup-capabilities .setup-ai-section { order: 42; grid-column: 1 / -1; }
.setup-capabilities .settings-android-devices-section { order: 43; grid-column: 1 / -1; }
.setup-capabilities .settings-data-maintenance-section { order: 60; grid-column: 1 / -1; }
.setup-capabilities .setup-capability-editor-shell { order: 61; grid-column: 1 / -1; display: block; }
.setup-capabilities .settings-storage-section { display: none; }
.setup-capabilities:has(.room-management-settings) .settings-daily-section .settings-room-count { display: none; }
.setup-capabilities .settings-daily-section .settings-ai-toggle { display: none; }
.setup-capabilities .settings-services-section .setup-toggle-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.setup-capabilities .business-public-profile-section > .setup-section-description,
.setup-capabilities .business-public-profile-address-results > small,
.setup-capabilities .settings-data-maintenance-section > .setup-section-description,
.setup-capabilities .settings-data-maintenance-section .backup-path,
.setup-capabilities .settings-data-maintenance-section .backup-folder-name,
.setup-capabilities .settings-technical-info,
.setup-capabilities .setup-web-actions > small { display: none; }
.setup-capabilities .business-public-profile-feature-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.setup-capabilities .business-public-profile-address-results { max-height: 190px; overflow: auto; }
.settings-advanced-details { overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--paper); box-shadow: var(--shadow-sm); }
.settings-advanced-details > summary { padding: var(--space-3) var(--space-4); cursor: pointer; font-weight: 800; }
.settings-advanced-details-body { padding: 0 var(--space-3) var(--space-3); }
.settings-advanced-details-body > .setup-section { margin: 0; }
@media (max-width: 1180px) {
  .setup-capabilities .settings-identity-section, .setup-capabilities .appearance-settings, .setup-capabilities .settings-password-section, .setup-capabilities .settings-services-section, .setup-capabilities .settings-web-section { grid-column: 1 / -1; }
  .setup-capabilities .business-public-profile-feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .settings-section-nav { width: 100%; }
  .settings-section-nav a { flex: 1 1 auto; justify-content: center; }
  .setup-capabilities .settings-services-section .setup-toggle-grid, .setup-capabilities .business-public-profile-feature-grid { grid-template-columns: 1fr; }
}
`);

console.log("settings-single-page-refactor-ok");
