<?php
declare(strict_types=1);
namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }


function e(mixed $value): string { return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function json_html(mixed $value): string { return json_encode($value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); }
function asset(array $site, string $path): string { return $site['base_path'] . '/assets/' . ltrim($path, '/'); }
function page_url(array $site, string $page, ?string $language = null): string
{
    return $site['base_path'] . '/?' . http_build_query(['page' => $page, 'lang' => $language ?? $site['language']['code']]);
}

/** Query state carried by the language picker; credentials and arbitrary query keys are never copied. */
function language_query_fields(array $view): array
{
    $fields = ['page' => $view['page'] === 'missing' ? 'home' : $view['page']];
    $safe = static function (mixed $value, int $limit = 256): ?string {
        if (!is_string($value) || $value === '' || strlen($value) > $limit || preg_match('/[\\x00-\\x1f\\x7f]/', $value)) return null;
        return $value;
    };
    $page = $view['page'];
    $record = $view['room'] ?? $view['table'] ?? $view['product'] ?? null;
    $id = $safe(is_array($record) ? ($record['id'] ?? null) : ($_GET['id'] ?? null), 180);
    if ($id !== null && in_array($page, ['rooms', 'restaurant', 'catalog'], true)) $fields['id'] = $id;
    $keys = match ($page) {
        'catalog' => ['q' => 180, 'sku' => 80, 'category' => 180, 'brand' => 180, 'reorder' => 180],
        'menu' => ['category' => 128],
        'account' => ['order' => 180],
        default => [],
    };
    foreach ($keys as $key => $limit) {
        $value = $safe($_GET[$key] ?? null, $limit);
        if ($value !== null) $fields[$key] = $value;
    }
    if ($page === 'account' && in_array($_GET['action'] ?? null, ['verify', 'reset'], true)) $fields['action'] = $_GET['action'];
    return $fields;
}

function favicon_url(array $site, mixed $path): string
{
    if (!is_string($path) || !preg_match('~^site/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_.-]+)*\\.(?:ico|png|svg|webp)$~iD', $path)) return '';
    $root = realpath($site['root'] . '/public/assets');
    $file = realpath($site['root'] . '/public/assets/' . $path);
    if ($root === false || $file === false || !str_starts_with($file, $root . DIRECTORY_SEPARATOR) || !is_file($file)) return '';
    return asset($site, $path);
}

function render_view(string $name, array $view, array $site): void
{
    if (!preg_match('~^[a-z]+(?:/[a-z-]+)*$~D', $name)) throw new \InvalidArgumentException('Unknown view');
    $override = $site['root'] . '/site/views/' . $name . '.php';
    $file = is_file($override) ? $override : $site['root'] . '/core/views/' . $name . '.php';
    // $view is an already gated projection; templates do not choose publication state.
    require $file;
}

function render_navigation(array $view, array $site): void
{
    foreach ($view['pages'] as $id => $page) {
        echo '<a href="' . e(page_url($site, $id)) . '"' . ($view['page'] === $id ? ' aria-current="page"' : '') . '>' . e(t($site, $page['key'])) . '</a>';
    }
}

/** Short list-card summary; the complete text stays on the detail page. */
function excerpt_text(mixed $value, int $limit = 170): string
{
    $plain = preg_replace('/\s+/u', ' ', text($value));
    if (!is_string($plain) || $plain === '' || $limit < 1) return '';
    $length = function_exists('mb_strlen') ? mb_strlen($plain, 'UTF-8') : strlen($plain);
    if ($length <= $limit) return $plain;
    $cut = function_exists('mb_substr') ? mb_substr($plain, 0, $limit - 1, 'UTF-8') : substr($plain, 0, $limit - 1);
    return rtrim((string) $cut) . '…';
}

function number_text(array $site, int|float $value): string
{
    if (class_exists('NumberFormatter')) {
        $result = (new \NumberFormatter($site['language']['locale'], \NumberFormatter::DECIMAL))->format($value);
        if ($result !== false) return $result;
    }
    return (string) $value;
}

/**
 * IntlDateFormatter rejects a bare "+01:00" timezone name, which is what
 * DateTimeZone::getName() returns for offsets. GMT-prefixed names are valid.
 */
function intl_timezone_name(\DateTimeInterface $date): string
{
    $name = $date->getTimezone()->getName();
    if (preg_match('/^[+-]\d{2}:\d{2}$/D', $name)) return 'GMT' . $name;
    return $name !== '' ? $name : 'UTC';
}

/** Parse an untrusted publication timestamp without ever throwing from a template. */
function public_datetime(mixed $value): ?\DateTimeImmutable
{
    if (!is_string($value) || trim($value) === '' || strlen($value) > 64) return null;
    try {
        return new \DateTimeImmutable($value);
    } catch (\Throwable) {
        return null;
    }
}

function date_text(array $site, \DateTimeInterface $date, bool $includeTime = false): string
{
    if (class_exists('IntlDateFormatter')) {
        try {
            $formatter = new \IntlDateFormatter($site['language']['locale'], \IntlDateFormatter::MEDIUM, $includeTime ? \IntlDateFormatter::SHORT : \IntlDateFormatter::NONE, intl_timezone_name($date));
            $result = $formatter->format($date);
            if (is_string($result) && $result !== '') return $result;
        } catch (\Throwable) {
            // Fall through to the deterministic ISO-style value.
        }
    }
    return $date->format($includeTime ? 'Y-m-d H:i' : 'Y-m-d');
}

function time_text(array $site, string $value): string
{
    $date = \DateTimeImmutable::createFromFormat('!H:i', $value, new \DateTimeZone('UTC'));
    if ($date !== false && class_exists('IntlDateFormatter')) {
        $formatter = new \IntlDateFormatter($site['language']['locale'], \IntlDateFormatter::NONE, \IntlDateFormatter::SHORT, 'UTC');
        $formatted = $formatter->format($date);
        if ($formatted !== false) return $formatted;
    }
    return $value;
}

/** IDs use the site dictionary; an unknown new ID retains its published label. */
function business_feature_labels(array $info, array $site): array
{
    $labels = [];
    foreach ($info['feature_ids'] ?? [] as $index => $id) {
        if (!is_string($id)) continue;
        $label = t($site, 'business.feature.' . $id);
        if ($label === '') $label = text($info['features'][$index] ?? '');
        if ($label !== '') $labels[] = $label;
    }
    return array_values(array_unique($labels));
}

function price_text(array $site, mixed $price, mixed $currency): string
{
    if (!is_numeric($price) || !is_finite((float) $price) || (float) $price < 0 || !preg_match('/^[A-Z]{3}$/D', text($currency))) return '';
    if (class_exists('NumberFormatter')) {
        $formatted = (new \NumberFormatter($site['language']['locale'], \NumberFormatter::CURRENCY))->formatCurrency((float) $price, $currency);
        if ($formatted !== false) return $formatted;
    }
    return t($site, 'content.price', ['amount' => number_text($site, (float) $price), 'currency' => $currency]);
}

/** A scene filename is accepted only inside the site-owned scene directory. */
function effect_scene_path(string $root, mixed $filename): ?string
{
    if (!is_string($filename) || !preg_match('/^[A-Za-z0-9_-]{1,64}\.scene\.json$/D', $filename)) return null;
    $path = $root . '/public/assets/site/scenes/' . $filename;
    if (!is_file($path) || filesize($path) > 25 * 1024 * 1024) return null;
    $scene = json_decode((string) file_get_contents($path), true);
    if (!is_array($scene) || ($scene['format'] ?? '') !== 'efekt-atolyesi' || ($scene['version'] ?? null) !== 1) return null;
    return $path;
}

/**
 * Opt-in site-owned manifest. Only an exact hard-coded static image under
 * assets/site/img or assets/site/media can bind; API/remote/dynamic gallery
 * sources are never accepted. Any unsafe or duplicate entry rejects the file.
 */
function effect_manifest_bindings(string $root, string $basePath): array
{
    $path = $root . '/public/assets/site/scenes/effects-manifest.json';
    if (!is_file($path) || filesize($path) > 16 * 1024) return [];
    $manifest = json_decode((string) file_get_contents($path), true);
    if (!is_array($manifest) || ($manifest['version'] ?? null) !== 1 || !is_array($manifest['bindings'] ?? null)) return [];
    if (count($manifest['bindings']) > 32) return [];
    $assets = realpath($root . '/public/assets');
    if ($assets === false) return [];
    $bindings = [];
    $sources = [];
    $slots = [];
    foreach ($manifest['bindings'] as $entry) {
        if (!is_array($entry) || array_diff(array_keys($entry), ['source', 'slot', 'scene']) !== []) return [];
        $source = $entry['source'] ?? null;
        $slot = $entry['slot'] ?? null;
        $scene = $entry['scene'] ?? null;
        if (!is_string($source) || strlen($source) > 200
            || !preg_match('~^site/(?:img|media)/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\.(?:jpe?g|png|webp|avif)$~D', $source)) return [];
        if (!is_string($slot) || !preg_match('/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/D', $slot)) return [];
        $file = realpath($assets . '/' . $source);
        if ($file === false || !str_starts_with($file, $assets . DIRECTORY_SEPARATOR) || !is_file($file)) return [];
        if (effect_scene_path($root, $scene) === null) return [];
        if (isset($sources[$source]) || isset($slots[$slot])) return [];
        $sources[$source] = true;
        $slots[$slot] = true;
        $bindings[] = [
            'slot' => $slot,
            'source' => $basePath . '/assets/' . $source,
            'url' => $basePath . '/assets/site/scenes/' . $scene,
        ];
    }
    return $bindings;
}

/** One canonical binding path. Legacy slot-only configuration is removed. */
function effect_bindings(string $root, array $config, string $basePath): array
{
    return effect_manifest_bindings($root, $basePath);
}

/** Deployment-owned origin; never derived from request Host or forwarded headers. */
function public_origin(mixed $value): string
{
    $url = web_url($value);
    $parts = $url !== '' ? parse_url($url) : false;
    return is_array($parts) && !isset($parts['query']) && !isset($parts['fragment'])
        && in_array($parts['path'] ?? '', ['', '/'], true) ? rtrim($url, '/') : '';
}

function canonical_url(array $site, array $view): string
{
    if (($site['public_origin'] ?? '') === '' || in_array($view['page'], ['missing', 'account'], true)) return '';
    $url = $site['public_origin'] . page_url($site, $view['page']);
    $record = $view['room'] ?? $view['table'] ?? null;
    if ($record !== null) $url .= '&id=' . rawurlencode($record['id']);
    if (($view['menu_category'] ?? '') !== '') $url .= '&category=' . rawurlencode($view['menu_category']);
    return $url;
}

/** Structured facts are taken only from the already gated public projection. */
function structured_data(array $site, array $view): array
{
    $publication = $view['publication'];
    $canonical = $view['canonical'] ?? '';
    if ($canonical === '' || empty($publication['identity_published'])) return [];
    $home = $site['public_origin'] . page_url($site, 'home');
    $business = ['@type'=>'LocalBusiness', '@id'=>$home . '#business', 'url'=>$home, 'name'=>$publication['name']];
    $hasField = static fn (string $field): bool => in_array($field, $publication['published_business_fields'], true);
    if ($hasField('description') && $publication['description'] !== '') $business['description'] = $publication['description'];
    $contact = $publication['contact'];
    if ($hasField('phone') && $contact['tel'] !== '') $business['telephone'] = substr($contact['tel'], 4);
    if ($hasField('email') && $contact['email'] !== '') $business['email'] = $contact['email'];
    if ($hasField('address') && $contact['address'] !== '') $business['address'] = $contact['address'];
    if ($hasField('social_links') && $contact['social'] !== []) $business['sameAs'] = array_column($contact['social'], 'url');
    if ($hasField('gallery') && $publication['gallery'] !== []) $business['image'] = array_map(static fn (array $image): string => str_starts_with($image['url'], '/') ? $site['public_origin'] . $image['url'] : $image['url'], $publication['gallery']);
    $record = $view['room'] ?? $view['table'] ?? null;
    $page = ['@type'=>'WebPage', '@id'=>$canonical, 'url'=>$canonical, 'name'=>$view['title'], 'inLanguage'=>$site['language']['code'], 'about'=>['@id'=>$business['@id']]];
    $graph = [$business, $page];
    if ($record !== null) {
        $entity = ['@type'=>!empty($view['room']) ? 'Accommodation' : 'Place', '@id'=>$canonical . '#resource', 'url'=>$canonical, 'name'=>$record['name'], 'containedInPlace'=>['@id'=>$business['@id']]];
        if (text($record['description'] ?? '') !== '') $entity['description'] = $record['description'];
        $images = [];
        foreach (records($record['media'] ?? []) as $media) {
            if (!published($media) || !in_array($media['kind'] ?? '', ['cover','photo'], true)) continue;
            $url = media_url($media['url'] ?? '', $site['module_path']);
            if ($url !== '') $images[] = str_starts_with($url, '/') ? $site['public_origin'] . $url : $url;
        }
        if ($images !== []) $entity['image'] = array_values(array_unique($images));
        $graph[1]['mainEntity'] = ['@id'=>$entity['@id']];
        $graph[] = $entity;
    }
    return ['@context'=>'https://schema.org', '@graph'=>$graph];
}

function sitemap_xml(array $site, array $view): string
{
    $urls = [];
    if (($site['public_origin'] ?? '') !== '' && $view['status'] === 'ok') {
        foreach (array_keys($site['language']['catalogs']) as $code) {
            foreach ($view['pages'] as $id => $_definition) {
                if ($id === 'account') continue;
                $url = $site['public_origin'] . page_url($site, $id, $code);
                $urls[] = $url;
                $records = $id === 'rooms' ? $view['publication']['rooms'] : ($id === 'restaurant' ? $view['publication']['tables'] : []);
                foreach ($records as $record) $urls[] = $url . '&id=' . rawurlencode($record['id']);
                if ($id === 'menu') foreach ($view['menu_categories'] as $category) $urls[] = $url . '&category=' . rawurlencode($category['id']);
            }
        }
    }
    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    foreach (array_unique($urls) as $url) $xml .= '<url><loc>' . htmlspecialchars($url, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</loc></url>';
    return $xml . '</urlset>' . "\n";
}
