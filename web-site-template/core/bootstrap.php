<?php
declare(strict_types=1);
namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

require_once __DIR__ . '/i18n.php';
require_once __DIR__ . '/api.php';
require_once __DIR__ . '/publication.php';
require_once __DIR__ . '/pages.php';
require_once __DIR__ . '/render.php';
require_once __DIR__ . '/legacy.php';

function root_path(mixed $path, string $fallback = ''): string
{
    return is_string($path) && preg_match('~^(?:/[A-Za-z0-9_-]+)*$~D', $path) ? $path : $fallback;
}

function bootstrap(string $root): array
{
    $config = require $root . '/site/config.php';
    $basePath = root_path($config['base_path'] ?? '');
    legacy_route($basePath);
    $modulePath = root_path($config['api_base_path'] ?? '/yardimci-asistan', '/yardimci-asistan');
    $api = new PublicApi(text($config['api_origin'] ?? ''), $modulePath, $config['local_api_root'] ?? null, $config['php_cli_binary'] ?? '/usr/bin/php');
    $business = $api->read('business');
    $language = language_context($root, $business['data']);
    $sources = public_sources($api, $business['data']);
    $publication = project_publication($business['data'], $sources, $modulePath, $language['code']);
    $pages = available_pages($publication, $config, $root);
    $requested = $_GET['page'] ?? 'home';
    $page = is_string($requested) && isset($pages[$requested]) ? $requested : 'missing';
    $room = null; $table = null;
    if ($page === 'rooms' && isset($_GET['id'])) {
        $id = is_string($_GET['id']) ? $_GET['id'] : '';
        foreach ($publication['rooms'] as $record) if ($record['id'] === $id) $room = $record;
        if ($room === null) $page = 'missing';
    }
    if ($page === 'restaurant' && isset($_GET['id'])) {
        $id = is_string($_GET['id']) ? $_GET['id'] : '';
        foreach ($publication['tables'] as $record) if ($record['id'] === $id) $table = $record;
        if ($table === null) $page = 'missing';
    }
    $menuCategories = array_values(array_filter($publication['categories'], static fn (array $category): bool => in_array($category['id'], array_column($publication['menu'], 'category_id'), true)));
    $category = $page === 'menu' ? ($_GET['category'] ?? '') : '';
    $orderTableToken = $page === 'menu' && is_string($_GET['table'] ?? null)
        && preg_match('/^[A-Za-z0-9_-]{24}$/D', $_GET['table']) ? $_GET['table'] : '';
    if (!is_string($category) || ($category !== '' && !in_array($category, array_column($menuCategories, 'id'), true))) { $page = 'missing'; $category = ''; }
    $site = ['public_origin' => public_origin($config['public_origin'] ?? ''), 'root' => $root, 'base_path' => $basePath, 'module_path' => $modulePath, 'favicon' => $config['favicon'] ?? '', 'language_cookie_path' => root_path($config['language_cookie_path'] ?? $basePath) . '/', 'language' => $language];
    $view = ['publication' => $publication, 'pages' => $pages, 'page' => $page,
        'title' => $page === 'missing' ? t($site, 'state.missing.title') : t($site, $pages[$page]['key']),
        'room' => $room, 'table' => $table, 'table_token' => $orderTableToken, 'menu_category' => $category, 'menu_categories' => $menuCategories, 'status' => $business['status'], 'effects' => effect_bindings($root, $config, $basePath),
        'demo_widget_visible' => !empty($config['demo_widget_visible'])];
    if ($room !== null || $table !== null) $view['title'] = ($room ?? $table)['name'];
    $view['canonical'] = canonical_url($site, $view);
    return compact('site', 'view');
}
