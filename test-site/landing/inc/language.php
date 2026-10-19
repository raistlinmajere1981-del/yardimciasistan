<?php
declare(strict_types=1);

// This demo's small dictionary. Public business content comes from publication data.
function site_language(): string {
    $requested = $_GET['lang'] ?? $_COOKIE['demo_language'] ?? 'tr';
    return $requested === 'en' ? 'en' : 'tr';
}
if (!headers_sent()) header('Cache-Control: private, no-store');
if (isset($_GET['lang']) && in_array($_GET['lang'], ['tr','en'], true) && !headers_sent()) {
    setcookie('demo_language', $_GET['lang'], ['expires'=>time()+31536000,'path'=>'/','httponly'=>true,'samesite'=>'Lax']);
    header('Cache-Control: private, no-store');
}
function site_english_dictionary(): array {
    static $dictionary = null;
    if ($dictionary === null) $dictionary = json_decode((string)file_get_contents(dirname(__DIR__) . '/assets/i18n/en.json'), true, 512, JSON_THROW_ON_ERROR);
    return $dictionary;
}
function site_text(string $source): string {
    return site_language() === 'en' ? (site_english_dictionary()[$source] ?? $source) : $source;
}
function site_localized_business(array $publication): array {
    $metadata = $publication['localization'] ?? [];
    if (!in_array(site_language(), $metadata['target_languages'] ?? [], true)) return $publication;
    $translations = $metadata['translations'] ?? [];
    $business = array_values($translations['business'] ?? [])[0][site_language()] ?? [];
    foreach (['description','about_text','directions_note','policy_note','payment_note'] as $field) {
        if (is_string($business[$field] ?? null) && $business[$field] !== '') $publication[$field] = $business[$field];
    }
    foreach (($publication['gallery'] ?? []) as $index => $image) {
        $title = $translations['gallery'][$image['id'] ?? ''][site_language()]['title'] ?? null;
        if (is_string($title) && $title !== '') $publication['gallery'][$index]['title'] = $title;
    }
    return $publication;
}
