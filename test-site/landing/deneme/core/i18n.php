<?php
declare(strict_types=1);
namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }


/** The Turkish catalog is the only source, including theme keys. */
function source_catalog(string $root): array
{
    $source = json_decode((string) file_get_contents($root . '/locales/tr.json'), true, 512, JSON_THROW_ON_ERROR);
    $entries = [];
    foreach ($source as $key => $value) {
        if ($key === '_meta') continue;
        if (!is_string($value) || trim($value) === '' || !preg_match('/^[a-zA-Z0-9_.-]{1,120}$/D', $key)
            || strlen($value) > 12000 || preg_match('/[<>\x00-\x08]/u', $value)) throw new \RuntimeException('Invalid source catalog');
        $entries[$key] = ['text' => $value, 'hash' => hash('sha256', $value)];
    }
    if (!$entries || count($entries) > 2048) throw new \RuntimeException('Invalid source catalog size');
    ksort($entries, SORT_STRING);
    $revision = '';
    foreach ($entries as $key => $entry) $revision .= $key . ':' . $entry['hash'] . "\n";
    $id = $source['_meta']['catalog_id'] ?? 'yardimci-site';
    if (!is_string($id) || !preg_match('/^[a-z0-9-]{1,60}$/D', $id)) throw new \RuntimeException('Invalid catalog id');
    return ['version' => 1, 'id' => $id, 'revision' => hash('sha256', $revision), 'source_language' => 'tr', 'entries' => $entries];
}

function language_context(string $root, array $business): array
{
    $source = source_catalog($root);
    $meta = $business['localization'] ?? [];
    $catalogs = ['tr' => ['_meta' => ['language'=>'tr', 'locale'=>'tr-TR', 'direction'=>'ltr', 'label'=>'Türkçe']]];
    if (($meta['version'] ?? null) === 1 && ($meta['source_language'] ?? '') === 'tr') {
        foreach ($meta['languages'] ?? [] as $language) {
            $code = $language['code'] ?? '';
            if (!is_string($code) || !preg_match('/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/D', $code)
                || ($code !== 'tr' && !in_array($code, $meta['target_languages'] ?? [], true))) continue;
            $catalogs[$code] = ['_meta' => ['language'=>$code, 'locale'=>$language['locale'] ?? $code,
                'direction'=>($language['direction'] ?? '') === 'rtl' ? 'rtl' : 'ltr', 'label'=>$language['nativeName'] ?? $code]];
        }
    }
    $requested = $_GET['lang'] ?? $_COOKIE['ya_site_language'] ?? 'tr';
    $code = is_string($requested) && isset($catalogs[$requested]) ? $requested : 'tr';
    $messages = [];
    foreach ($source['entries'] as $key => $entry) {
        $messages[$key] = $entry['text'];
        if ($code === 'tr' || ($meta['site_catalog']['id'] ?? '') !== $source['id']
            || ($meta['site_catalog']['entries'][$key]['hash'] ?? '') !== $entry['hash']) continue;
        $translated = localized_field($business, 'site_text', $source['id'] . ':' . $key, 'text', $entry['text'], $code);
        // Placeholder fidelity also guards manually edited catalog translations.
        preg_match_all('/\{[a-zA-Z0-9_]+\}/', $entry['text'], $before);
        preg_match_all('/\{[a-zA-Z0-9_]+\}/', $translated, $after);
        sort($before[0]); sort($after[0]);
        if ($before[0] === $after[0]) $messages[$key] = $translated;
    }
    return ['code' => $code, 'locale' => $catalogs[$code]['_meta']['locale'],
        'direction' => $catalogs[$code]['_meta']['direction'], 'catalogs' => $catalogs, 'messages' => $messages];
}

function t(array $site, string $key, array $values = []): string
{
    $message = $site['language']['messages'][$key] ?? '';
    foreach ($values as $name => $value) $message = str_replace('{' . $name . '}', (string) $value, $message);
    return is_string($message) ? $message : '';
}

/** Public content uses its own per-publication translation metadata, never the UI catalog. */
function localized_field(array $payload, string $type, string $id, string $field, string $source, string $language): string
{
    $meta = $payload['localization'] ?? [];
    if ($language === 'tr' || ($meta['version'] ?? null) !== 1 || ($meta['source_language'] ?? '') !== 'tr'
        || !in_array($language, $meta['target_languages'] ?? [], true)) return $source;
    $translated = $meta['translations'][$type][$id][$language][$field] ?? null;
    return is_string($translated) && trim($translated) !== '' ? $translated : $source;
}

/** Source phrase adapter for the existing shared interaction components. */
function source_keys(string $root): array
{
    $keys = [];
    foreach (source_catalog($root)['entries'] as $key => $entry) $keys[$entry['text']] = $key;
    return $keys;
}
