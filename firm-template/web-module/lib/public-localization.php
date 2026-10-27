<?php
declare(strict_types=1);

/** Data allowlist only. The site owns language selection and every rendered element.
 * $records maps publication-owned public identities to allowed translation field names. */
function ya_public_localization(mixed $candidate, array $records, bool $includeSite = false): array
{
    $result = ['version' => 1, 'source_language' => 'tr', 'target_languages' => [], 'translations' => new stdClass()];
    if (!is_array($candidate) || ($candidate['version'] ?? null) !== 1 || ($candidate['source_language'] ?? '') !== 'tr') return $result;
    $languages = $candidate['target_languages'] ?? [];
    if (!is_array($languages) || count($languages) > 16) return $result;
    foreach ($languages as $language) {
        if (is_string($language) && $language !== 'tr' && preg_match('/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/D', $language) === 1) $result['target_languages'][] = $language;
    }
    $result['target_languages'] = array_values(array_unique($result['target_languages']));
    if ($includeSite) {
        $businessId = $candidate['business_id'] ?? '';
        if (is_string($businessId) && strlen($businessId) <= 200) $result['business_id'] = $businessId;
        $result['languages'] = [];
        foreach (array_slice(is_array($candidate['languages'] ?? null) ? $candidate['languages'] : [], 0, 17) as $language) {
            if (!is_array($language) || !in_array($language['code'] ?? '', ['tr', ...$result['target_languages']], true)) continue;
            $clean = [];
            foreach (['code','name','nativeName','locale','direction'] as $field) {
                $value = $language[$field] ?? '';
                if (!is_string($value) || strlen($value) > 120 || preg_match('/[<>\x00-\x1f]/u', $value)) continue 2;
                $clean[$field] = $value;
            }
            if (!preg_match('/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/D', $clean['locale']) || !in_array($clean['direction'], ['ltr','rtl'], true)) continue;
            $result['languages'][] = $clean;
        }
        $catalog = ya_public_site_catalog($candidate['site_catalog'] ?? null);
        if ($result['target_languages'] && $catalog !== null) {
            $result['site_catalog'] = $catalog;
            foreach ($catalog['entries'] as $key => $_entry) $records['site_text'][$catalog['id'] . ':' . $key] = ['text'];
        }
    }
    $translations = [];
    foreach ($records as $kind => $identities) {
        foreach ($identities as $id => $fields) {
            foreach ($result['target_languages'] as $language) {
                foreach ($fields as $field) {
                    $value = $candidate['translations'][$kind][$id][$language][$field] ?? null;
                    if (!is_string($value) || trim($value) === '' || mb_strlen($value) > 12000 || !mb_check_encoding($value, 'UTF-8') || str_contains($value, "\0")) continue;
                    $translations[$kind][$id][$language][$field] = trim($value);
                }
            }
        }
    }
    $result['translations'] = $translations ?: new stdClass();
    return $result;
}

/** Source manifest validation, not a second catalog owner or translation engine. */
function ya_public_site_catalog(mixed $catalog): ?array
{
    if (!is_array($catalog) || ($catalog['version'] ?? null) !== 1 || ($catalog['source_language'] ?? '') !== 'tr'
        || !is_string($catalog['id'] ?? null) || !preg_match('/^[a-z0-9-]{1,60}$/D', $catalog['id'])
        || !is_array($catalog['entries'] ?? null) || !$catalog['entries'] || count($catalog['entries']) > 1000) return null;
    $entries = []; $revision = '';
    ksort($catalog['entries'], SORT_STRING);
    foreach ($catalog['entries'] as $key => $entry) {
        if (!is_string($key) || !preg_match('/^[a-zA-Z0-9_.-]{1,120}$/D', $key) || !is_array($entry)
            || !is_string($entry['text'] ?? null) || trim($entry['text']) === '' || strlen($entry['text']) > 12000
            || !mb_check_encoding($entry['text'], 'UTF-8') || preg_match('/[<>\x00-\x08]/u', $entry['text'])
            || hash('sha256', $entry['text']) !== ($entry['hash'] ?? '')) return null;
        $entries[$key] = ['text'=>$entry['text'], 'hash'=>$entry['hash']];
        $revision .= $key . ':' . $entry['hash'] . "\n";
    }
    if (hash('sha256', $revision) !== ($catalog['revision'] ?? '')) return null;
    return ['version'=>1, 'id'=>$catalog['id'], 'revision'=>$catalog['revision'], 'source_language'=>'tr', 'entries'=>$entries];
}

function ya_localization_records(array $rows, string $id, array $fields): array
{
    $result = [];
    foreach ($rows as $row) if (is_array($row) && is_string($row[$id] ?? null) && $row[$id] !== '') $result[$row[$id]] = $fields;
    return $result;
}
