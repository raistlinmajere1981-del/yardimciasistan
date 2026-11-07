<?php
declare(strict_types=1);
namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

/** Fixed presentation aliases only; the destination still evaluates publication gates. */
function legacy_route(string $basePath): void
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if (!is_string($path) || !str_starts_with($path, $basePath . '/')) return;
    $path = substr($path, strlen($basePath));
    $aliases = [
        '/katalog/' => 'catalog', '/magaza/' => 'catalog', '/urun/' => 'catalog',
        '/sepet/' => 'cart', '/markalar/' => 'catalog', '/kategori/' => 'catalog',
        '/hesabim/' => 'account', '/bayi/' => 'account', '/hakkimizda/' => 'about',
        '/iletisim/' => 'contact', '/galeri/' => 'gallery', '/duyurular/' => 'announcements',
        '/yorumlar/' => 'reviews', '/odalar/' => 'rooms', '/odalar/oda/' => 'rooms',
        '/restoran/' => 'restaurant', '/restoran/masa/' => 'restaurant', '/qr-menu/' => 'menu',
    ];
    $path = preg_replace('~/index\.php$~D', '/', $path);
    $alias = rtrim($path, '/') . '/';
    if (!isset($aliases[$alias])) {
        if (!in_array($alias, ['/', '/sitemap.xml/'], true)) $_GET['page'] = '__missing__';
        return;
    }
    $page = $aliases[$alias]; $parameters = ['page' => $page];
    $keys = ['lang'];
    if ($page === 'catalog') $keys = array_merge($keys, ['q', 'category', 'sku', 'brand']);
    if ($page === 'menu') $keys[] = 'category';
    if ($alias === '/urun/' || $alias === '/odalar/oda/' || $alias === '/restoran/masa/') $keys[] = 'id';
    if ($page === 'account') $keys = array_merge($keys, ['action', 'order', 'account_error']);
    foreach ($keys as $key) {
        $value = $_GET[$key] ?? null;
        if (is_string($value) && strlen($value) <= 2048 && !preg_match('/[\x00-\x1f\x7f]/', $value)) $parameters[$key] = $value;
    }
    $target = $basePath . '/?' . http_build_query($parameters);
    header('Cache-Control: private, no-store'); header('Referrer-Policy: no-referrer');
    // No fragment on account aliases: browsers retain the mailbox token fragment.
    header('Location: ' . $target, true, 302);
    exit;
}
