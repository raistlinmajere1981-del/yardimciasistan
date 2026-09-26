<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const YA_BASE_DIR = __DIR__ . '/..';
const YA_GOOGLE_REVIEWS_SETTINGS_FILE = YA_BASE_DIR . '/data/google-reviews.local.php';
const YA_GOOGLE_REVIEWS_MAX = 5;

require_once YA_BASE_DIR . '/lib/google-reviews.php';

$settings = ya_google_reviews_load_settings();
if (($settings['enabled'] ?? false) !== true
    || ($settings['place_id'] ?? '') === ''
    || ($settings['api_key'] ?? '') === '') {
    ya_google_reviews_respond([
        'available' => false,
        'reason' => 'not_configured'
    ]);
}

$google = ya_google_reviews_fetch_place($settings['api_key'], $settings['place_id']);
if (($google['ok'] ?? false) !== true || !is_array($google['place'] ?? null)) {
    http_response_code(502);
    ya_google_reviews_respond([
        'available' => false,
        'reason' => 'google_unavailable'
    ]);
}

ya_google_reviews_respond(
    ya_google_reviews_normalize_place($google['place'], YA_GOOGLE_REVIEWS_MAX)
);

function ya_google_reviews_load_settings(): array
{
    if (!is_file(YA_GOOGLE_REVIEWS_SETTINGS_FILE)) {
        return ['enabled' => false, 'place_id' => '', 'api_key' => ''];
    }

    try {
        $settings = require YA_GOOGLE_REVIEWS_SETTINGS_FILE;
        if (!is_array($settings)) {
            return ['enabled' => false, 'place_id' => '', 'api_key' => ''];
        }
        return [
            'enabled' => ($settings['enabled'] ?? false) === true,
            'place_id' => trim((string)($settings['place_id'] ?? '')),
            'api_key' => trim((string)($settings['api_key'] ?? ''))
        ];
    } catch (Throwable) {
        return ['enabled' => false, 'place_id' => '', 'api_key' => ''];
    }
}

function ya_google_reviews_respond(array $payload): never
{
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
