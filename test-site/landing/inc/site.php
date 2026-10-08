<?php
declare(strict_types=1);

const SITE_NAME = 'Yardımcı Asistan';

function site_url(string $path = ''): string
{
    $relative = ltrim($path, '/');
    return $relative === '' ? '/' : '/' . $relative;
}

function site_asset(string $path): string
{
    $relative = ltrim($path, '/');
    $file = dirname(__DIR__) . '/assets/' . $relative;
    $url = site_url('assets/' . $relative);
    return is_file($file) ? $url . '?v=' . filemtime($file) : $url;
}

function site_current_path(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    return '/' . ltrim($path, '/');
}

function site_is_current(string $prefix): bool
{
    return str_starts_with(site_current_path(), site_url($prefix));
}

function site_e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function site_publication(string $name): ?array
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

function site_qr_menu_available(): bool
{
    $menu = site_publication('menu');
    if (!is_array($menu)) {
        return false;
    }

    $publication = is_array($menu['_publication'] ?? null) ? $menu['_publication'] : [];
    if ($publication === []) {
        return false;
    }
    return ($menu['enabled'] ?? false) === true;
}

function render_site_hero(string $eyebrow, string $title, string $description = ''): void
{
    ?>
    <section class="demo-page-hero"><div class="shell"><p class="eyebrow"><?= site_e($eyebrow) ?></p><h1><?= site_e($title) ?></h1><?php if ($description !== ''): ?><p><?= site_e($description) ?></p><?php endif; ?></div></section>
    <?php
}

/** This host's fixed hero ownership is isolated for a future marketing-media selection. */
function site_hero_image(): string { return site_asset('showcase/workspace.webp'); }
function site_navigation(): array
{
    // Navigation belongs to this showcase host. Customer websites may expose a
    // different route set and ordering; Desktop only publishes feature/content availability.
    $pages = [
        ['id'=>'home','label'=>'Ana Sayfa','path'=>'/','availability'=>'always'],
        ['id'=>'rooms','label'=>'Odalar','path'=>'/odalar/','availability'=>'rooms'],
        ['id'=>'restaurant','label'=>'Restoran','path'=>'/restoran/','availability'=>'restaurant'],
        ['id'=>'qr_menu','label'=>'QR Menü','path'=>'/qr-menu/','availability'=>'qr_menu'],
        ['id'=>'store','label'=>'Mağaza','path'=>'/yardimci-asistan/magaza/','availability'=>'store'],
        ['id'=>'announcements','label'=>'Kampanyalar','path'=>'/duyurular/','availability'=>'announcements'],
        ['id'=>'reviews','label'=>'Yorumlar','path'=>'/yorumlar/','availability'=>'reviews'],
        ['id'=>'contact','label'=>'İletişim','path'=>'/iletisim/','availability'=>'always'],
        ['id'=>'installation','label'=>'Kurulum','path'=>'/kurulum/','availability'=>'always'],
        ['id'=>'guide','label'=>'Kullanım Kılavuzu','path'=>'/kullanim-kilavuzu/','availability'=>'always'],
    ];
    $availability = site_availability();
    return array_values(array_filter($pages, static fn(array $page): bool => ($availability[$page['availability']] ?? false) === true));
}
function site_availability(): array
{
    $has = static function(string $name): bool {
        $value = site_publication($name);
        return !empty($value['_publication']) && ($value['enabled'] ?? false) === true;
    };
    $marketing = site_publication('marketing_website');
    $announcements = ($marketing['enabled'] ?? false) === true && count(array_filter($marketing['publications'] ?? [], static fn(array $p): bool => ($p['published'] ?? false) === true)) > 0;
    $reviews = false;
    $path = dirname(__DIR__) . '/yardimci-asistan/data/google-reviews.local.php';
    if (is_file($path)) {
        try { $settings = require $path; $reviews = ($settings['enabled'] ?? false) === true && !empty($settings['place_id']) && !empty($settings['api_key']); } catch (Throwable) {}
    }
    return ['always'=>true, 'rooms'=>$has('room_catalog'),
        'restaurant'=>$has('table_catalog'), 'qr_menu'=>site_qr_menu_available(),
        'store'=>$has('online_catalog'), 'announcements'=>$announcements, 'reviews'=>$reviews];
}
function render_site_links(): void
{
    foreach (site_navigation() as $page) {
        $current = $page['path'] === '/' ? site_current_path() === '/' : site_is_current($page['path']);
        ?><a href="<?= site_e($page['path']) ?>" <?= $current ? 'aria-current="page" class="active"' : '' ?>><?= site_e($page['label']) ?></a><?php
    }
}
