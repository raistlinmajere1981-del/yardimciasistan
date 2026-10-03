<?php
declare(strict_types=1);

const YA_VERSION_FILE = __DIR__ . '/../config/version.json';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET, OPTIONS');
    ya_version_response(405, [
        'ok' => false,
        'message' => 'Sürüm bilgisi için GET isteği gerekli.'
    ]);
}

if (!is_file(YA_VERSION_FILE)) {
    ya_version_response(503, [
        'ok' => false,
        'message' => 'Web modülü sürüm bilgisi bulunamadı.'
    ]);
}

$value = json_decode((string) file_get_contents(YA_VERSION_FILE), true);
$productVersion = trim((string) ($value['product_version'] ?? ''));
$webModuleVersion = trim((string) ($value['web_module_version'] ?? ''));

if (
    preg_match('/^\d+\.\d+\.\d+$/', $productVersion) !== 1
    || preg_match('/^\d+\.\d+\.\d+$/', $webModuleVersion) !== 1
) {
    ya_version_response(503, [
        'ok' => false,
        'message' => 'Web modülü sürüm bilgisi geçersiz.'
    ]);
}

ya_version_response(200, [
    'ok' => true,
    'product_version' => $productVersion,
    'web_module_version' => $webModuleVersion
]);

function ya_version_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache, must-revalidate');
    header('Access-Control-Allow-Origin: *');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
