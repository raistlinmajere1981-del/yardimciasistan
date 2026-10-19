<?php
declare(strict_types=1);

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';

require_once YA_BASE_DIR . '/lib/storage.php';
require_once YA_BASE_DIR . '/lib/business-map.php';

$config = ya_business_load_json(YA_CONFIG_FILE);
ya_business_apply_cors($config);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    ya_business_response(405, [
        'ok' => false,
        'message' => 'İşletme bilgisi için GET isteği gerekli.'
    ]);
}

$publicContext = ya_business_public_context();
$displayName = ya_business_string($publicContext['business_name'] ?? $config['display_name'] ?? $config['name'] ?? 'Yardımcı Asistan İşletmesi');
$phone = ya_business_string($publicContext['phone'] ?? $config['phone'] ?? '');
$whatsapp = ya_business_string($publicContext['whatsapp'] ?? $config['whatsapp'] ?? $phone);
$email = ya_business_string($publicContext['email'] ?? $config['email'] ?? '');
$address = ya_business_string($publicContext['address'] ?? $config['address'] ?? '');
$profileId = ya_business_string($publicContext['profile_id'] ?? $config['profile_id'] ?? '');
$runtimeCapabilities = ya_business_public_capabilities();
$googleReviewsEnabled = ya_business_google_reviews_enabled();
$aiEnabled = $runtimeCapabilities === null || in_array('service.ai', $runtimeCapabilities, true);
$whatsappEnabled = array_key_exists('whatsapp_enabled', $publicContext)
    ? ($publicContext['whatsapp_enabled'] === true)
    : ($runtimeCapabilities === null
        ? $whatsapp !== ''
        : in_array('service.whatsapp', $runtimeCapabilities, true));
$requestsEnabled = $runtimeCapabilities !== null
    ? in_array('customer.requests', $runtimeCapabilities, true)
    : ya_business_profile_requests_enabled($profileId);
if (array_key_exists('public_surfaces', $config)) {
    $publicSurfaces = ya_business_normalize_public_surfaces($config['public_surfaces']);
} else {
    $publicSurfaces = ya_business_profile_public_surfaces($profileId);
}

// Published channel state owns these public surfaces, independently of Android.
$surfacePublications = ['rooms' => 'room_catalog', 'restaurant' => 'table_catalog',
    'qr_menu' => 'menu', 'store' => 'online_catalog'];
$publicSurfaces = array_values(array_filter($publicSurfaces,
    static fn (string $surface): bool => !array_key_exists($surface, $surfacePublications)));
foreach ($surfacePublications as $surface => $publicationName) {
    if (ya_business_publication_enabled($publicationName)) $publicSurfaces[] = $surface;
}
$publicSurfaces = array_values(array_unique($publicSurfaces));

ya_business_response(200, [
    'ok' => true,
    'localization' => $publicContext['localization'] ?? ['version'=>1,'source_language'=>'tr','target_languages'=>[],'translations'=>new stdClass()],
    'business' => [
        'id' => ya_business_string($config['id'] ?? ''),
        'name' => ya_business_string($config['name'] ?? ''),
        'display_name' => $displayName !== '' ? $displayName : 'Yardımcı Asistan İşletmesi',
        'profile_id' => $profileId,
        'public_surfaces' => $publicSurfaces,
        'ai_enabled' => $aiEnabled,
        'whatsapp_enabled' => $whatsappEnabled,
        'requests_enabled' => $requestsEnabled,
        'google_reviews_enabled' => $googleReviewsEnabled,
        'phone' => $phone,
        'whatsapp' => $whatsapp,
        'email' => $email,
        'website' => ya_business_string($config['website'] ?? ''),
        'mapDisplayMode' => ($publicContext['mapDisplayMode'] ?? '') === 'google_maps_embed' ? 'google_maps_embed' : 'manual',
        'googleMapsEmbedUrl' => ya_business_google_maps_embed_url($publicContext['googleMapsEmbedUrl'] ?? ''),
        'address' => $address,
        'latitude' => is_numeric($publicContext['latitude'] ?? null) ? (float) $publicContext['latitude'] : null,
        'longitude' => is_numeric($publicContext['longitude'] ?? null) ? (float) $publicContext['longitude'] : null,
        'description' => ya_business_string($publicContext['description'] ?? ''),
        'about_text' => ya_business_string($publicContext['about_text'] ?? ''),
        'gallery' => is_array($publicContext['gallery'] ?? null) ? array_values($publicContext['gallery']) : [],
        'directions_note' => ya_business_string($publicContext['directions_note'] ?? ''),
        'policy_note' => ya_business_string($publicContext['policy_note'] ?? ''),
        'payment_note' => ya_business_string($publicContext['payment_note'] ?? ''),
        'languages' => is_array($publicContext['languages'] ?? null) ? array_values($publicContext['languages']) : [],
        'features' => is_array($publicContext['features'] ?? null) ? array_values($publicContext['features']) : [],
        'feature_ids' => is_array($publicContext['feature_ids'] ?? null) ? array_values($publicContext['feature_ids']) : [],
        'social_links' => is_array($publicContext['social_links'] ?? null) ? array_values($publicContext['social_links']) : [],
        'map_url' => ya_business_string($config['map_url'] ?? ''),
        'primary_color' => ya_business_color($config['primary_color'] ?? '', '#2f6f5e'),
        'accent_color' => ya_business_color($config['accent_color'] ?? '', '#e47863')
    ]
]);

function ya_business_load_json(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $json = file_get_contents($path);
    $value = json_decode($json ?: '', true);
    return is_array($value) ? $value : [];
}

function ya_business_apply_cors(array $config): void
{
    $origin = ya_business_string($_SERVER['HTTP_ORIGIN'] ?? '');
    $allowedOrigins = $config['allowed_origins'] ?? [];
    if ($origin !== '' && is_array($allowedOrigins)) {
        $allowAny = in_array('*', $allowedOrigins, true);
        if ($allowAny || in_array($origin, $allowedOrigins, true)) {
            header('Access-Control-Allow-Origin: ' . ($allowAny ? '*' : $origin));
            header('Vary: Origin');
        }
    }
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}

function ya_business_public_context(): array
{
    try {
        $context = ya_storage_get_publication('business_context', []);
        unset($context['_publication']);
        return is_array($context) ? $context : [];
    } catch (Throwable) {
        return [];
    }
}

function ya_business_publication_enabled(string $name): bool
{
    try {
        $catalog = ya_storage_get_publication($name, []);
    } catch (Throwable) {
        return false;
    }

    $publication = is_array($catalog['_publication'] ?? null) ? $catalog['_publication'] : [];
    if ($publication === []) {
        return false;
    }
    return ($catalog['enabled'] ?? false) === true;
}

function ya_business_google_reviews_enabled(): bool
{
    $published = ya_storage_private_config('google_reviews_settings');
    return ($published['enabled'] ?? false) === true
        && ($published['place_id'] ?? '') !== '' && ($published['api_key'] ?? '') !== '';
}

function ya_business_public_capabilities(): ?array
{
    try {
        $publication = ya_storage_get_publication('android_snapshot', []);
    } catch (Throwable) {
        return null;
    }

    $capabilities = $publication['business_capabilities'] ?? null;
    if (!is_array($capabilities)) {
        return null;
    }

    return array_values(array_unique(array_filter(array_map(
        static fn (mixed $capability): string => trim((string) $capability),
        $capabilities
    ))));
}

function ya_business_normalize_public_surfaces(mixed $value): array
{
    if (!is_array($value)) {
        return [];
    }
    $allowed = ['accommodation', 'food_service', 'menu', 'qr_menu', 'catalog', 'directions', 'rooms', 'restaurant'];
    $normalized = [];
    foreach ($value as $surface) {
        $surface = ya_business_string($surface);
        if ($surface !== '' && in_array($surface, $allowed, true) && !in_array($surface, $normalized, true)) {
            $normalized[] = $surface;
        }
    }
    return $normalized;
}

function ya_business_profile_requests_enabled(string $profileId): bool
{
    return in_array($profileId, ['pension_restaurant', 'pension', 'restaurant'], true);
}

function ya_business_profile_public_surfaces(string $profileId): array
{
    return match ($profileId) {
        'pension_restaurant' => ['accommodation', 'food_service', 'menu', 'qr_menu', 'directions'],
        'pension' => ['accommodation', 'directions'],
        'restaurant' => ['food_service', 'menu', 'qr_menu', 'directions'],
        'market' => ['catalog', 'directions'],
        default => []
    };
}

function ya_business_color(mixed $value, string $fallback): string
{
    $color = ya_business_string($value);
    return preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1 ? $color : $fallback;
}

function ya_business_string(mixed $value): string
{
    return trim((string) $value);
}

function ya_business_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache, must-revalidate');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
