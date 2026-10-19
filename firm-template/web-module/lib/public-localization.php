<?php
declare(strict_types=1);

/** Data allowlist only. The site owns language selection and every rendered element.
 * $records maps publication-owned public identities to allowed translation field names. */
function ya_public_localization(mixed $candidate, array $records): array
{
    $result = ['version' => 1, 'source_language' => 'tr', 'target_languages' => [], 'translations' => new stdClass()];
    if (!is_array($candidate) || ($candidate['version'] ?? null) !== 1 || ($candidate['source_language'] ?? '') !== 'tr') return $result;
    $languages = $candidate['target_languages'] ?? [];
    if (!is_array($languages) || count($languages) > 16) return $result;
    foreach ($languages as $language) {
        if (is_string($language) && $language !== 'tr' && preg_match('/^[a-z]{2,3}(?:-[A-Z]{2})?$/', $language) === 1) $result['target_languages'][] = $language;
    }
    $result['target_languages'] = array_values(array_unique($result['target_languages']));
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

function ya_localization_records(array $rows, string $id, array $fields): array
{
    $result = [];
    foreach ($rows as $row) if (is_array($row) && is_string($row[$id] ?? null) && $row[$id] !== '') $result[$row[$id]] = $fields;
    return $result;
}
