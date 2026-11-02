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
        ['label' => 'Linux AppImage', 'description' => 'Sonra yayınlanacak', 'version' => '', 'file' => null],
        ['label' => 'Android Companion', 'description' => 'Masaüstüne bağlı telefon uygulaması', 'version' => $android, 'file' => $android !== '' ? "YardimciAsistan-Android-$android.apk" : null],
        ['label' => 'Bayi Android', 'description' => 'Android 8.0+ · Bayi kataloğu, sepet ve sipariş', 'version' => $dealer !== '' ? $dealer : '', 'file' => $dealer !== '' ? "YardimciAsistan-Bayi-Android-$dealer.apk" : null],
    ];
    foreach ($downloads as $index => &$download) {
        $download['label_key'] = 'install.package.' . $index . '.label';
        $download['description_key'] = 'install.package.' . $index . '.description';
        $file = $download['file'];
        $path = $file !== null ? $root . '/downloads/' . $file : null;
        $download['url'] = $path !== null && is_file($path) && is_readable($path) && filesize($path) > 0
            ? '/downloads/' . rawurlencode($file) : null;
    }
    unset($download);
    return [$downloads[0], $downloads[1], $downloads[3], $downloads[4], $downloads[2]];
}


/**
 * Only published, locally present demo ZIPs appear as downloadable.
 * Samples are not release executables and never masquerade as ready installs.
 * A separate opt-in upload step owns the large sample artifacts.
 */
function demo_sample_downloads(): array
{
    $root = dirname(__DIR__);
    $release = json_decode((string) @file_get_contents($root . '/release.json'), true);
    $version = is_array($release) ? ($release['desktopVersion'] ?? '') : '';
    if (!is_string($version) || !preg_match('/^[0-9][0-9A-Za-z.+-]*$/D', $version)) return [];
    $samples = [
        'combined' => 'pension-restaurant',
        'market' => 'market',
        'dealer' => 'market-bayi'
    ];
    $result = [];
    foreach ($samples as $key => $slug) {
        $file = "YardimciAsistan-OrnekVeri-{$slug}-{$version}.zip";
        $path = $root . '/downloads/' . $file;
        $ready = is_file($path) && is_readable($path) && filesize($path) > 0;
        $result[] = [
            'key' => $key,
            'ready' => $ready,
            'url' => $ready ? '/downloads/' . rawurlencode($file) : '',
            'version' => $version
        ];
    }
    return $result;
}
