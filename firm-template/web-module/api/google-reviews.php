<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');

const YA_BASE_DIR = __DIR__ . '/..';
const YA_GOOGLE_REVIEWS_SETTINGS_FILE = YA_BASE_DIR . '/data/google-reviews.local.php';
const YA_GOOGLE_REVIEWS_CACHE_FILE = YA_BASE_DIR . '/data/google-reviews-cache.json';
const YA_GOOGLE_REVIEWS_CACHE_TTL = 21600;
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

$fingerprint = hash('sha256', $settings['place_id'] . "\0" . $settings['api_key']);
$cached = ya_google_reviews_read_cache(YA_GOOGLE_REVIEWS_CACHE_FILE);
if ($cached !== null
    && hash_equals((string)($cached['fingerprint'] ?? ''), $fingerprint)
    && (time() - (int)($cached['cached_at'] ?? 0)) < YA_GOOGLE_REVIEWS_CACHE_TTL) {
    ya_google_reviews_respond(is_array($cached['payload'] ?? null) ? $cached['payload'] : ['available' => false]);
}

$google = ya_google_reviews_fetch_place($settings['api_key'], $settings['place_id']);
if (($google['ok'] ?? false) !== true || !is_array($google['place'] ?? null)) {
    if ($cached !== null
        && hash_equals((string)($cached['fingerprint'] ?? ''), $fingerprint)
        && is_array($cached['payload'] ?? null)) {
        $payload = $cached['payload'];
        $payload['stale'] = true;
        ya_google_reviews_respond($payload);
    }

    http_response_code(502);
    ya_google_reviews_respond([
        'available' => false,
        'reason' => 'google_unavailable'
    ]);
}

$payload = ya_google_reviews_normalize_place($google['place'], YA_GOOGLE_REVIEWS_MAX);
ya_google_reviews_write_cache(YA_GOOGLE_REVIEWS_CACHE_FILE, $fingerprint, $payload);
ya_google_reviews_respond($payload);

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

function ya_google_reviews_read_cache(string $path): ?array
{
    if (!is_file($path)) return null;
    $decoded = json_decode((string)@file_get_contents($path), true);
    return is_array($decoded) ? $decoded : null;
}

function ya_google_reviews_write_cache(string $path, string $fingerprint, array $payload): void
{
    $directory = dirname($path);
    if (!is_dir($directory)) @mkdir($directory, 0755, true);
    $tmp = $path . '.tmp-' . bin2hex(random_bytes(4));
    $encoded = json_encode([
        'cached_at' => time(),
        'fingerprint' => $fingerprint,
        'payload' => $payload
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($encoded)) return;
    if (@file_put_contents($tmp, $encoded, LOCK_EX) === false) return;
    @chmod($tmp, 0600);
    @rename($tmp, $path);
}

function ya_google_reviews_respond(array $payload): never
{
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
