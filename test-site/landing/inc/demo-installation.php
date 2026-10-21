<?php
declare(strict_types=1);
/** DEMO HOST ONLY. Never package this file in firm-template or customer deployments.
 * The workspace owner explicitly allows showing this installation's sync secret.
 * Called only by the demo root; no generic secret-rendering helper exists.
 */

/** Release metadata owns versions; a link exists only for a published file on this host. */
function demo_downloads(): array
{
    $root = dirname(__DIR__);
    $releasePath = $root . '/release.json';
    $release = is_file($releasePath) ? json_decode((string)file_get_contents($releasePath), true) : [];
    $version = static function (string $key) use ($release): string {
        $value = is_array($release) ? (string)($release[$key] ?? '') : '';
        return preg_match('/^[0-9][0-9A-Za-z.+-]*$/D', $value) === 1 ? $value : '';
    };
    $desktop = $version('desktopVersion');
    $android = $version('androidVersion');
    $dealer = $version('dealerAndroidVersion');
    $downloads = [
        ['label' => 'Windows x64', 'description' => '64 bit Windows', 'version' => $desktop, 'file' => $desktop !== '' ? "YardimciAsistan-Setup-$desktop.exe" : null],
        ['label' => 'Windows x86', 'description' => '32 bit Windows', 'version' => $desktop, 'file' => $desktop !== '' ? "YardimciAsistan-Setup-$desktop-x86.exe" : null],
        ['label' => 'Linux Desktop', 'description' => 'Linux paketi henüz yayınlanmadı.', 'version' => '', 'file' => null],
        ['label' => 'Android Companion', 'description' => 'Masaüstüne bağlı telefon uygulaması', 'version' => $android, 'file' => $android !== '' ? "YardimciAsistan-Android-$android.apk" : null],
        ['label' => 'Bayi Android (Pilot)', 'description' => 'Android 8.0+ · test sürümü; mağaza sürümü değil', 'version' => $dealer !== '' ? "$dealer-pilot" : '', 'file' => $dealer !== '' ? "YardimciAsistan-Bayi-Android-$dealer-pilot.apk" : null],
    ];
    foreach ($downloads as &$download) {
        $file = $download['file'];
        $path = $file !== null ? $root . '/downloads/' . $file : null;
        $download['url'] = $path !== null && is_file($path) && is_readable($path) && filesize($path) > 0
            ? '/downloads/' . rawurlencode($file) : null;
    }
    unset($download);
    return $downloads;
}

function render_demo_installation(): void
{
    $path = dirname(__DIR__) . '/yardimci-asistan/config/business.json';
    $config = is_file($path) ? json_decode((string)@file_get_contents($path), true) : [];
    $secret = is_array($config) ? trim((string)($config['sync_secret'] ?? '')) : '';
    ?>
    <section class="section installation-section" id="kurulum" data-showcase-section="download">
        <div class="shell installation-panel">
            <div class="section-heading split-heading"><div>
                <p class="eyebrow"><?= site_e(site_text('Kendi bilgisayarında dene')) ?></p>
                <h2><?= site_e(site_text('İndir, bağlan, dene')) ?></h2>
                <p><?= site_e(site_text('Uygulamaları indirin, demo bağlantısını ekleyin ve keşfetmeye başlayın.')) ?></p>
            </div><a class="text-link" href="/kullanim-kilavuzu/#baslangic"><?= site_e(site_text('Kurulum yardımı →')) ?></a></div>
            <div class="download-grid">
                <?php foreach (demo_downloads() as $download): ?>
                    <?php if ($download['url'] !== null): ?>
                        <a class="download-card" href="<?= site_e($download['url']) ?>" download>
                            <span class="download-icon" aria-hidden="true">↓</span>
                            <strong><?= site_e(site_text($download['label'])) ?> <?= site_e(site_text('indir')) ?></strong>
                            <small><?= site_e(site_text($download['description'])) ?></small>
                            <small><?= site_e(site_text('Sürüm')) ?> <?= site_e($download['version']) ?></small>
                        </a>
                    <?php else: ?>
                        <div class="download-card download-card-unavailable">
                            <span class="download-icon" aria-hidden="true">—</span>
                            <strong><?= site_e(site_text($download['label'])) ?></strong>
                            <small><?= site_e(site_text($download['description'])) ?></small>
                            <?php if ($download['file'] !== null): ?><small><?= site_e(site_text('İndirilebilir paket henüz yayınlanmadı.')) ?></small><?php endif; ?>
                        </div>
                    <?php endif; ?>
                <?php endforeach; ?>
            </div>
            <ol class="installation-steps">
                <li><strong><?= site_e(site_text('Uygulamayı indir')) ?></strong><p><?= site_e(site_text('Bilgisayarınıza uygun yayınlanmış paketi seçin ve kurulumu tamamlayın.')) ?></p></li>
                <li><strong><?= site_e(site_text('Demo bağlantısını kur')) ?></strong><p><?= site_e(site_text('Ayarlar → Web bağlantısı alanına aşağıdaki adresi ve anahtarı girip Bağlan düğmesine basın.')) ?></p></li>
                <li><strong><?= site_e(site_text('Özellikleri keşfet')) ?></strong><p><?= site_e(site_text('Desktop’tan içerik yayınlayın; Canlı Sayfalar üzerinden değişiklikleri, yayından kaldırmayı ve yeni işlemleri test edin.')) ?></p></li>
            </ol>
            <div class="installation-details">
                <div class="copy-field"><label for="demo-web-address"><?= site_e(site_text('Web modül adresi')) ?></label><div><input id="demo-web-address" readonly value="https://yardimciasistan.alwaysdata.net/yardimci-asistan"><button type="button" data-copy-target="demo-web-address"><?= site_e(site_text('Kopyala')) ?></button></div></div>
                <div class="copy-field"><label for="demo-sync-secret">Demo Sync Secret</label><div><input id="demo-sync-secret" readonly value="<?= site_e($secret) ?>" placeholder="<?= site_e(site_text('Bağlantı anahtarı henüz hazır değil.')) ?>"><button type="button" data-copy-target="demo-sync-secret" <?= $secret === '' ? 'disabled' : '' ?>><?= site_e(site_text('Kopyala')) ?></button></div></div>
            </div>
            <p class="installation-note"><?= site_e(site_text('Bu bilgiler Yardımcı Asistan demo kurulumu içindir.')) ?></p>
            <span class="copy-status" role="status" aria-live="polite" data-copy-status></span>
        </div>
    </section>
    <?php
}
