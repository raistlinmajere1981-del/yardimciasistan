<?php
declare(strict_types=1);

require_once __DIR__ . '/language.php';

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
        return is_array($publication) ? ($name === 'business_context' ? site_localized_business($publication) : $publication) : null;
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

/** Only the published, sanitized business context controls these optional pages. */
function site_published_business_content(): array {
    $content = site_publication('business_context');
    return is_array($content) && !empty($content['_publication']) ? $content : [];
}
function site_about_text(): string {
    return trim((string) (site_published_business_content()['about_text'] ?? ''));
}
function site_gallery_images(): array {
    $content = site_published_business_content();
    $images = is_array($content['gallery'] ?? null) ? $content['gallery'] : [];
    $valid = [];
    foreach ($images as $image) {
        if (!is_array($image)) continue;
        $url = trim((string) ($image['url'] ?? ''));
        if (!str_starts_with($url, '/yardimci-asistan/media/') && !preg_match('#^https://[^/]+/yardimci-asistan/media/#', $url)) continue;
        $valid[] = ['url' => $url, 'title' => mb_substr(trim((string) ($image['title'] ?? '')), 0, 240), 'kind' => ($image['kind'] ?? '') === 'cover' ? 'cover' : 'photo'];
    }
    return array_slice($valid, 0, 80);
}

function render_site_hero(string $eyebrow, string $title, string $description = ''): void
{
    ?>
    <section class="demo-page-hero"><div class="shell"><p class="eyebrow"><?= site_e(site_text($eyebrow)) ?></p><h1><?= site_e(site_text($title)) ?></h1><?php if ($description !== ''): ?><p><?= site_e(site_text($description)) ?></p><?php endif; ?></div></section>
    <?php
}

/** This host's fixed hero ownership is isolated for a future marketing-media selection. */
function site_hero_image(): string { return site_asset('showcase/dashboard.webp'); }
function site_navigation(): array
{
    // Navigation belongs to this showcase host. Customer websites may expose a
    // different route set and ordering; Desktop only publishes feature/content availability.
    $pages = [
        ['id'=>'home','label'=>'Ana Sayfa','path'=>'/','availability'=>'always'],
        ['id'=>'rooms','label'=>'Odalar','path'=>'/odalar/','availability'=>'rooms'],
        ['id'=>'restaurant','label'=>'Restoran','path'=>'/restoran/','availability'=>'restaurant'],
        ['id'=>'qr_menu','label'=>'QR Menü','path'=>'/qr-menu/','availability'=>'qr_menu'],
        ['id'=>'store','label'=>'Mağaza','path'=>'/magaza/','availability'=>'store'],
        ['id'=>'announcements','label'=>'Kampanyalar','path'=>'/duyurular/','availability'=>'announcements'],
        ['id'=>'reviews','label'=>'Yorumlar','path'=>'/yorumlar/','availability'=>'reviews'],
        ['id'=>'about','label'=>'Hakkımızda','path'=>'/hakkimizda/','availability'=>'about'],
        ['id'=>'gallery','label'=>'Galeri','path'=>'/galeri/','availability'=>'gallery'],
        ['id'=>'contact','label'=>'İletişim','path'=>'/iletisim/','availability'=>'always'],
        ['id'=>'installation','label'=>'İndir ve Kur','path'=>'/#kurulum','availability'=>'always'],
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
    return ['always'=>true, 'about'=>site_about_text() !== '', 'gallery'=>site_gallery_images() !== [], 'rooms'=>$has('room_catalog'),
        'restaurant'=>$has('table_catalog'), 'qr_menu'=>site_qr_menu_available(),
        'store'=>$has('online_catalog'), 'announcements'=>$announcements, 'reviews'=>$reviews];
}
function site_live_navigation(): array
{
    return array_values(array_filter(site_navigation(), static fn(array $page): bool => !in_array($page['id'], ['home','contact','installation','guide','reviews'], true)));
}
function render_site_link(array $page, string $class = ''): void
{
    $current = !str_contains($page['path'], '#') && ($page['path'] === '/' ? site_current_path() === '/' : site_is_current($page['path']));
    ?><a href="<?= site_e($page['path']) ?>" class="<?= site_e(trim($class . ($current ? ' active' : ''))) ?>" <?= $current ? 'aria-current="page"' : '' ?>><?= site_e(site_text($page['label'])) ?></a><?php
}
function render_site_links(bool $footer = false): void
{
    if ($footer) {
        foreach (site_navigation() as $page) render_site_link($page);
        return;
    }
    render_site_link(['label'=>'Ana Sayfa','path'=>'/']);
    $live = site_live_navigation();
    if ($live) {
        ?><details class="live-menu" data-live-menu><summary><?= site_e(site_text('Canlı Sayfalar')) ?><span class="live-count"><?= count($live) ?></span><span aria-hidden="true">⌄</span></summary><div class="live-menu-panel"><p><?= site_e(site_text('Desktop’tan yayınlanan sayfalar')) ?></p><?php foreach ($live as $page): ?><?php
        $current = $page['path'] === '/' ? site_current_path() === '/' : site_is_current($page['path']);
        ?><a href="<?= site_e($page['path']) ?>" <?= $current ? 'aria-current="page" class="active"' : '' ?>><span class="live-dot" aria-hidden="true"></span><?= site_e(site_text($page['label'])) ?><span class="live-link-tag"><?= site_e(site_text('Canlı')) ?></span></a><?php endforeach; ?></div></details><?php
    }
    render_site_link(['label'=>'İletişim','path'=>'/iletisim/']);
    render_site_link(['label'=>'İndir ve Kur','path'=>'/#kurulum'], 'nav-download');
}
