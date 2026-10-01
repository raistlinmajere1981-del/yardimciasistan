<?php
declare(strict_types=1);

const DEMO_SITE_NAME = 'Yardımcı Asistan Canlı Referans';

function demo_url(string $path = ''): string
{
    $relative = ltrim($path, '/');
    return $relative === '' ? '/' : '/' . $relative;
}

function demo_asset(string $path): string
{
    $relative = ltrim($path, '/');
    $file = dirname(__DIR__) . '/assets/' . $relative;
    $url = demo_url('assets/' . $relative);
    return is_file($file) ? $url . '?v=' . filemtime($file) : $url;
}

function demo_current_path(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    return '/' . ltrim($path, '/');
}

function demo_is_current(string $prefix): bool
{
    return str_starts_with(demo_current_path(), demo_url($prefix));
}

function demo_e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function demo_publication(string $name): ?array
{
    $storage = dirname(__DIR__) . '/yardimci-asistan/lib/storage.php';
    if (!is_file($storage)) {
        return null;
    }

    try {
        require_once $storage;
        $publication = ya_storage_get_publication($name, []);
        return is_array($publication) ? $publication : null;
    } catch (Throwable) {
        return null;
    }
}

function demo_qr_menu_available(): bool
{
    $menu = demo_publication('menu');
    if (!is_array($menu)) {
        return false;
    }

    $publication = is_array($menu['_publication'] ?? null) ? $menu['_publication'] : [];
    if ($publication === []) {
        return false;
    }
    if (array_key_exists('enabled', $menu) && ($menu['enabled'] ?? false) !== true) {
        return false;
    }

    $snapshot = demo_publication('android_snapshot');
    $capabilities = is_array($snapshot['business_capabilities'] ?? null)
        ? $snapshot['business_capabilities']
        : null;

    if ($capabilities === null) {
        return true;
    }

    return in_array('channel.qr_menu', array_map(
        static fn (mixed $capability): string => trim((string) $capability),
        $capabilities
    ), true);
}

function render_demo_hero(string $eyebrow, string $title, string $description = ''): void
{
    ?>
    <section class="demo-page-hero"><div class="shell"><p class="eyebrow"><?= demo_e($eyebrow) ?></p><h1><?= demo_e($title) ?></h1><?php if ($description !== ''): ?><p><?= demo_e($description) ?></p><?php endif; ?></div></section>
    <?php
}
