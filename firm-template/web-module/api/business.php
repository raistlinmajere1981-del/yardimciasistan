<?php
declare(strict_types=1);

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';

require_once YA_BASE_DIR . '/lib/storage.php';

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

$displayName = ya_business_string($config['display_name'] ?? $config['name'] ?? 'Yardımcı Asistan İşletmesi');
$whatsapp = ya_business_string($config['whatsapp'] ?? $config['phone'] ?? '');
$profileId = ya_business_string($config['profile_id'] ?? '');
$runtimeCapabilities = ya_business_public_capabilities();
$aiEnabled = $runtimeCapabilities === null || in_array('service.ai', $runtimeCapabilities, true);
$whatsappEnabled = $runtimeCapabilities === null
    ? $whatsapp !== ''
    : in_array('service.whatsapp', $runtimeCapabilities, true);
$requestsEnabled = $runtimeCapabilities !== null
    ? in_array('customer.requests', $runtimeCapabilities, true)
    : ya_business_profile_requests_enabled($profileId);
if ($runtimeCapabilities !== null) {
    $publicSurfaces = ya_business_capability_public_surfaces($runtimeCapabilities, $config);
} elseif (array_key_exists('public_surfaces', $config)) {
    $publicSurfaces = ya_business_normalize_public_surfaces($config['public_surfaces']);
} else {
    $publicSurfaces = ya_business_profile_public_surfaces($profileId);
}

ya_business_response(200, [
    'ok' => true,
    'business' => [
        'id' => ya_business_string($config['id'] ?? ''),
        'name' => ya_business_string($config['name'] ?? ''),
        'display_name' => $displayName !== '' ? $displayName : 'Yardımcı Asistan İşletmesi',
        'profile_id' => $profileId,
        'public_surfaces' => $publicSurfaces,
        'ai_enabled' => $aiEnabled,
        'whatsapp_enabled' => $whatsappEnabled,
        'requests_enabled' => $requestsEnabled,
        'phone' => ya_business_string($config['phone'] ?? ''),
        'whatsapp' => $whatsapp,
        'email' => ya_business_string($config['email'] ?? ''),
        'website' => ya_business_string($config['website'] ?? ''),
        'address' => ya_business_string($config['address'] ?? ''),
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

function ya_business_capability_public_surfaces(array $capabilities, array $config): array
{
    $enabled = array_fill_keys($capabilities, true);
    $surfaces = [];

    if (isset($enabled['accommodation.reservations'])) {
        $surfaces[] = 'accommodation';
    }
    if (isset($enabled['food_service.reservations'])) {
        $surfaces[] = 'food_service';
    }
    if (isset($enabled['food_service.menu'])) {
        $surfaces[] = 'menu';
    }
    if (isset($enabled['channel.qr_menu'])) {
        $surfaces[] = 'qr_menu';
    }
    if (isset($enabled['commerce.catalog'])) {
        $surfaces[] = 'catalog';
    }

    $address = ya_business_string($config['address'] ?? '');
    $mapUrl = ya_business_string($config['map_url'] ?? '');
    if ($address !== '' || $mapUrl !== '') {
        $surfaces[] = 'directions';
    }

    return $surfaces;
}

function ya_business_normalize_public_surfaces(mixed $value): array
{
    if (!is_array($value)) {
        return [];
    }
    $allowed = ['accommodation', 'food_service', 'menu', 'qr_menu', 'catalog', 'directions'];
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
    return in_array($profileId, ['pension_restaurant', 'pension', 'restaurant', 'cafe'], true);
}

function ya_business_profile_public_surfaces(string $profileId): array
{
    return match ($profileId) {
        'pension_restaurant' => ['accommodation', 'food_service', 'menu', 'qr_menu', 'directions'],
        'pension' => ['accommodation', 'directions'],
        'restaurant', 'cafe' => ['food_service', 'menu', 'qr_menu', 'directions'],
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
