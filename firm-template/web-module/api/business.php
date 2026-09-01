<?php
declare(strict_types=1);

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';

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

ya_business_response(200, [
    'ok' => true,
    'business' => [
        'id' => ya_business_string($config['id'] ?? ''),
        'name' => ya_business_string($config['name'] ?? ''),
        'display_name' => $displayName !== '' ? $displayName : 'Yardımcı Asistan İşletmesi',
        'business_type' => ya_business_string($config['business_type'] ?? ''),
        'phone' => ya_business_string($config['phone'] ?? ''),
        'whatsapp' => $whatsapp,
        'email' => ya_business_string($config['email'] ?? ''),
        'website' => ya_business_string($config['website'] ?? ''),
        'address' => ya_business_string($config['address'] ?? ''),
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
