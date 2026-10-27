<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/request-documents.php';

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';

require_once YA_BASE_DIR . '/lib/storage.php';
require_once YA_BASE_DIR . '/lib/business-map.php';
require_once YA_BASE_DIR . '/lib/public-request-policy.php';

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
// An optional host-owned, root-relative logo path: the API never exposes a foreign image origin.
$logoCandidate = ya_business_string($publicContext['logo_url'] ?? $config['logo_url'] ?? '');
$logoUrl = preg_match('~^/(?!/)[a-zA-Z0-9_./-]+\\.(?:png|jpe?g|webp)$~iD', $logoCandidate) === 1
    && !str_contains($logoCandidate, '..') ? $logoCandidate : '';
$phone = ya_business_string($publicContext['phone'] ?? $config['phone'] ?? '');
$whatsapp = ya_business_string($publicContext['whatsapp'] ?? $config['whatsapp'] ?? $phone);
$email = ya_business_string($publicContext['email'] ?? $config['email'] ?? '');
$address = ya_business_string($publicContext['address'] ?? $config['address'] ?? '');
$profileId = ya_business_string($publicContext['profile_id'] ?? $config['profile_id'] ?? '');
$runtimeCapabilities = ya_public_runtime_capabilities();
$googleReviewsEnabled = ya_business_google_reviews_enabled();
$aiEnabled = in_array('service.ai', $runtimeCapabilities, true);
$whatsappEnabled = in_array('service.whatsapp', $runtimeCapabilities, true)
    && ($publicContext['whatsapp_enabled'] ?? false) === true;
$requestsEnabled = ya_public_requests_enabled($runtimeCapabilities);
$requestTypes = ya_public_request_types($runtimeCapabilities, $requestsEnabled && ya_dealer_application_enabled());
$accommodationDetailsEnabled = in_array('accommodation.rooms', $runtimeCapabilities, true);
$publicSurfaces = ya_business_normalize_public_surfaces($config['public_surfaces'] ?? []);

// Published channel state owns these public surfaces, independently of Android.
$surfacePublications = ['rooms' => 'room_catalog', 'restaurant' => 'table_catalog',
    'qr_menu' => 'menu', 'store' => 'online_catalog'];
$publicationSurfaces = ['rooms', 'accommodation', 'restaurant', 'tables', 'table', 'food_service',
    'qr_menu', 'menu', 'store', 'catalog', 'online_sales'];
$publicSurfaces = array_values(array_filter($publicSurfaces,
    static fn (string $surface): bool => !in_array($surface, $publicationSurfaces, true)));
foreach ($surfacePublications as $surface => $publicationName) {
    if (ya_business_publication_enabled($publicationName)) $publicSurfaces[] = $surface;
}
$hasPublishedPoint = is_numeric($publicContext['latitude'] ?? null) && is_numeric($publicContext['longitude'] ?? null)
    && abs((float) $publicContext['latitude']) <= 90 && abs((float) $publicContext['longitude']) <= 180;
if (ya_business_string($publicContext['address'] ?? '') !== '' || $hasPublishedPoint
    || ya_business_google_maps_embed_url($publicContext['googleMapsEmbedUrl'] ?? '') !== '') {
    $publicSurfaces[] = 'directions';
}
$publicSurfaces = array_values(array_unique($publicSurfaces));

ya_business_response(200, [
    'ok' => true,
    // Provenance for consumers such as SEO; bootstrap/config fallback is not a publication.
    'business_publication' => $publicContext['_public_metadata'] ?? ['enabled'=>false, 'server_revision'=>0, 'fields'=>[]],
    'localization' => $publicContext['localization'] ?? ['version'=>1,'source_language'=>'tr','target_languages'=>[],'translations'=>new stdClass()],
    'business' => [
        'id' => ya_business_string($config['id'] ?? ''),
        'name' => ya_business_string($config['name'] ?? ''),
        'display_name' => $displayName !== '' ? $displayName : 'Yardımcı Asistan İşletmesi',
        'logo_url' => $logoUrl,
        'profile_id' => $profileId,
        'public_surfaces' => $publicSurfaces,
        'ai_enabled' => $aiEnabled,
        'whatsapp_enabled' => $whatsappEnabled,
        'requests_enabled' => $requestsEnabled,
        'request_types' => $requestTypes,
        'google_reviews_enabled' => $googleReviewsEnabled,
        'phone' => $phone,
        'whatsapp' => $whatsapp,
        'email' => $email,
        'website' => ya_business_string($config['website'] ?? ''),
        'dealer_application_enabled' => in_array('dealer_application', $requestTypes, true),
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
        'check_in_time' => ya_business_public_clock($publicContext['check_in_time'] ?? '', $accommodationDetailsEnabled),
        'check_out_time' => ya_business_public_clock($publicContext['check_out_time'] ?? '', $accommodationDetailsEnabled),
        'breakfast_start_time' => ya_business_public_clock($publicContext['breakfast_start_time'] ?? '', $accommodationDetailsEnabled),
        'breakfast_end_time' => ya_business_public_clock($publicContext['breakfast_end_time'] ?? '', $accommodationDetailsEnabled),
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
        if (!is_array($context)) return [];
        $metadata = is_array($context['_publication'] ?? null) ? $context['_publication'] : [];
        $context['_public_metadata'] = [
            'enabled' => $metadata !== [],
            'server_revision' => (int) ($metadata['server_revision'] ?? 0),
            'fields' => $metadata !== [] ? array_values(array_filter(
                ['business_name','description','phone','email','address','gallery','social_links'],
                static fn (string $field): bool => in_array($field, ['gallery','social_links'], true)
                    ? is_array($context[$field] ?? null)
                    : is_string($context[$field] ?? null) && ($field !== 'business_name' || trim($context[$field]) !== '')
            )) : [],
        ];
        unset($context['_publication']);
        return $context;
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

function ya_business_color(mixed $value, string $fallback): string
{
    $color = ya_business_string($value);
    return preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1 ? $color : $fallback;
}

/** Same customer-facing clock contract as the Desktop public profile. */
function ya_business_public_clock(mixed $value, bool $enabled): string
{
    if (!$enabled || !is_string($value)) return '';
    $value = trim($value);
    return preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D', $value) === 1 ? $value : '';
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
