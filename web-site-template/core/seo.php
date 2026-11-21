<?php
declare(strict_types=1);
namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

/** Every URL comes from the site-owned origin and route; publication cannot set canonical/hreflang. */
function seo_is_indexable(array $view): bool
{
    return ($view['canonical'] ?? '') !== ''
        && ($view['status'] ?? '') === 'ok'
        && !in_array($view['page'] ?? '', ['missing','account'], true)
        && empty($view['pages'][$view['page']]['internal'])
        && (($view['table_token'] ?? '') === '' && ($view['room_token'] ?? '') === '');
}

function seo_alternate_urls(array $site, array $view, ?string $page = null, string $recordId = '', string $category = ''): array
{
    if (($site['public_origin'] ?? '') === '' || !seo_is_indexable($view)) return [];
    $page = $page ?? $view['page'];
    if (!isset($view['pages'][$page]) || !empty($view['pages'][$page]['internal'])) return [];
    $urls = [];
    foreach (array_keys($site['language']['catalogs']) as $code) {
        $url = $site['public_origin'] . page_url($site, $page, $code);
        if ($recordId !== '') $url .= '&id=' . rawurlencode($recordId);
        if ($page === 'menu' && $category !== '') $url .= '&category=' . rawurlencode($category);
        $urls[$code] = $url;
    }
    if (isset($urls['tr'])) $urls['x-default'] = $urls['tr'];
    return $urls;
}

/** Published SEO source & vetted per-language translation are the only overrides. */
function seo_page_meta(array $site, array $view): array
{
    $publication = $view['publication'];
    $page = $view['page'];
    $language = $site['language']['code'];
    $hasResource = !empty($view['room']) || !empty($view['table']);
    $sources = $publication['seo']['pages'][$page] ?? [];
    if (!is_array($sources) || $hasResource) $sources = [];
    $localized = $language !== 'tr' && !$hasResource
        ? ($publication['seo_localization'][$page][$language] ?? []) : [];
    if (!is_array($localized)) $localized = [];

    // Missing translations never inherit Turkish overrides for a foreign-language page.
    $choice = static function (string $key) use ($sources, $localized, $language): string {
        $raw = $language === 'tr' ? ($sources[$key] ?? '') : ($localized[$key] ?? '');
        if (!is_string($raw) || strlen($raw) > 1000 || preg_match('/[<>\x00-\x1f]/u', $raw)) return '';
        return trim($raw);
    };
    $fallbackTitle = trim($view['title'] . ' · ' . ($publication['name'] ?: t($site, 'site.title')));
    $title = $choice('title') ?: $fallbackTitle;
    $description = $choice('description');
    if ($description === '') {
        $resource = $view['room'] ?? $view['table'] ?? null;
        $description = is_array($resource) ? text($resource['description'] ?? '') : '';
        if ($description === '') $description = text($publication['description'] ?? '');
    }
    $ogTitle = $choice('og_title') ?: $title;
    $ogDescription = $choice('og_description') ?: $description;
    $image = '';
    foreach ($publication['gallery'] ?? [] as $media) {
        if (!is_array($media)) continue;
        $path = media_url($media['url'] ?? '', $site['module_path']);
        if ($path === '') continue;
        $image = str_starts_with($path, '/') ? $site['public_origin'] . $path : $path;
        break;
    }
    return compact('title','description','ogTitle','ogDescription','image');
}
