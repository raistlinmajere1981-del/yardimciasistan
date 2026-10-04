<?php
declare(strict_types=1);
/** DEMO HOST ONLY. Never package this file in firm-template or customer deployments.
 * The workspace owner explicitly allows showing this installation's sync secret.
 * Called only by the demo root and /kurulum/; no generic secret-rendering helper exists.
 */
function render_demo_installation(): void
{
    $path = dirname(__DIR__) . '/yardimci-asistan/config/business.json';
    $config = is_file($path) ? json_decode((string)@file_get_contents($path), true) : [];
    $secret = is_array($config) ? trim((string)($config['sync_secret'] ?? '')) : '';
    $release = json_decode((string)file_get_contents(dirname(__DIR__) . '/release.json'), true);
    $desktop = (string)($release['desktopVersion'] ?? ''); $android = (string)($release['androidVersion'] ?? '');
    $downloads = [
        ['Windows x64', "YardimciAsistan-Setup-$desktop.exe", '64 bit Windows'],
        ['Windows x86', "YardimciAsistan-Setup-$desktop-x86.exe", '32 bit Windows'],
        ['Android', "YardimciAsistan-Android-$android.apk", 'Android companion']
    ];
    ?>
    <section class="section installation-section" id="kurulum"><div class="shell installation-panel"><div class="section-heading split-heading"><div><p class="eyebrow">Kendi bilgisayarında dene</p><h2>Deneme kurulumu</h2><p>Uygulamaları indirin, demo bağlantısını ekleyin ve keşfetmeye başlayın.</p></div><a class="text-link" href="/kurulum/">Kurulum adımları →</a></div><div class="download-grid">
    <?php foreach ($downloads as [$label, $file, $description]): ?><a class="download-card" href="/downloads/<?= site_e($file) ?>" download><span class="download-icon" aria-hidden="true">↓</span><strong><?= site_e($label) ?> indir</strong><small><?= site_e($description) ?></small></a><?php endforeach; ?>
    </div><div class="installation-details"><div class="copy-field"><label for="demo-web-address">Web modül adresi</label><div><input id="demo-web-address" readonly value="https://yardimciasistan.alwaysdata.net/yardimci-asistan"><button type="button" data-copy-target="demo-web-address">Kopyala</button></div></div><div class="copy-field"><label for="demo-sync-secret">Demo Sync Secret</label><div><input id="demo-sync-secret" readonly value="<?= site_e($secret) ?>" placeholder="Bağlantı anahtarı henüz hazır değil."><button type="button" data-copy-target="demo-sync-secret" <?= $secret === '' ? 'disabled' : '' ?>>Kopyala</button></div></div></div><p class="installation-note">Bu bilgiler Yardımcı Asistan demo kurulumu içindir.</p><span class="copy-status" role="status" aria-live="polite" data-copy-status></span></div></section>
    <?php
}
