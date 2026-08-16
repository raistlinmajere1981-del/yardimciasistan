<?php
declare(strict_types=1);

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';

require_once YA_BASE_DIR . '/lib/storage.php';
require_once YA_BASE_DIR . '/lib/public-request-guard.php';

$businessConfig = ya_load_business_config();
ya_apply_cors($businessConfig);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ya_json_response(405, [
        'ok' => false,
        'message' => 'Bu işlem için form gönderimi gerekli.'
    ]);
}

ya_public_guard_enforce('request');

$payloadResult = ya_read_payload();
if (!$payloadResult['ok']) {
    ya_json_response(400, [
        'ok' => false,
        'message' => $payloadResult['message']
    ]);
}

$payload = $payloadResult['data'];
$errors = ya_validate_request_payload($payload);

if ($errors !== []) {
    ya_json_response(422, [
        'ok' => false,
        'message' => 'Lütfen bilgileri kontrol edin.',
        'errors' => $errors
    ]);
}

$phone = ya_normalize_tr_phone(ya_string($payload['customer_phone'] ?? ''));
$now = date(DATE_ATOM);
$whatsappMessage = ya_string($payload['whatsapp_message'] ?? '');

if ($whatsappMessage === '') {
    $whatsappMessage = ya_build_whatsapp_message($businessConfig, $payload);
}

$request = [
    'id' => ya_create_id('request_'),
    'customer_id' => ya_string($payload['customer_id'] ?? ''),
    'source' => ya_string($payload['source'] ?? 'web_form'),
    'request_type' => ya_string($payload['request_type'] ?? 'general_info'),
    'status' => 'new',
    'customer_name' => ya_string($payload['customer_name'] ?? ''),
    'customer_phone' => $phone['e164'],
    'date_text' => ya_string($payload['date_text'] ?? ''),
    'start_date' => ya_string($payload['start_date'] ?? ''),
    'end_date' => ya_string($payload['end_date'] ?? ''),
    'time' => ya_string($payload['time'] ?? ''),
    'guest_count' => ya_int($payload['guest_count'] ?? 1, 1),
    'adult_count' => ya_int($payload['adult_count'] ?? 0, 0),
    'child_count' => ya_int($payload['child_count'] ?? 0, 0),
    'message' => ya_string($payload['message'] ?? ''),
    'ai_summary' => '',
    'ai_suggested_reply' => '',
    'whatsapp_message' => $whatsappMessage,
    'assigned_to' => '',
    'priority' => 'normal',
    'sync_status' => 'pending',
    'created_at' => $now,
    'updated_at' => $now
];

try {
    ya_storage_insert_request($request);
} catch (Throwable $error) {
    $storageUnavailable = $error->getMessage() === 'pdo_sqlite_missing';
    ya_json_response($storageUnavailable ? 503 : 500, [
        'ok' => false,
        'message' => $storageUnavailable
            ? 'Hostingde PHP SQLite desteği etkin değil. Hosting yöneticinizden PDO_SQLITE eklentisini açmasını isteyin.'
            : 'Talep kaydedilemedi. Lütfen biraz sonra tekrar deneyin.'
    ]);
}

ya_json_response(201, [
    'ok' => true,
    'message' => 'Talep kaydedildi.',
    'request_id' => $request['id'],
    'whatsapp_message' => $whatsappMessage,
    'whatsapp_phone' => $phone['whatsapp']
]);

function ya_load_business_config(): array
{
    if (!is_file(YA_CONFIG_FILE)) {
        return [];
    }

    $json = file_get_contents(YA_CONFIG_FILE);
    $data = json_decode($json ?: '{}', true);

    return is_array($data) ? $data : [];
}

function ya_apply_cors(array $businessConfig): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedOrigins = $businessConfig['allowed_origins'] ?? [];

    if ($origin !== '' && is_array($allowedOrigins)) {
        $allowAny = in_array('*', $allowedOrigins, true);
        $allowOrigin = in_array($origin, $allowedOrigins, true);

        if ($allowAny || $allowOrigin) {
            header('Access-Control-Allow-Origin: ' . ($allowAny ? '*' : $origin));
            header('Vary: Origin');
        }
    }

    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}

function ya_read_payload(): array
{
    $rawBody = file_get_contents('php://input') ?: '';
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (stripos($contentType, 'application/json') !== false) {
        $data = json_decode($rawBody, true);

        if (!is_array($data)) {
            return [
                'ok' => false,
                'message' => 'Gönderilen bilgiler okunamadı.'
            ];
        }

        return [
            'ok' => true,
            'data' => $data
        ];
    }

    if ($_POST !== []) {
        return [
            'ok' => true,
            'data' => $_POST
        ];
    }

    $data = json_decode($rawBody, true);
    if (is_array($data)) {
        return [
            'ok' => true,
            'data' => $data
        ];
    }

    return [
        'ok' => false,
        'message' => 'Form bilgileri alınamadı.'
    ];
}

function ya_validate_request_payload(array $payload): array
{
    $errors = [];
    $requestType = ya_string($payload['request_type'] ?? 'general_info');
    $allowedTypes = [
        'general_info',
        'pension_reservation',
        'restaurant_reservation',
        'breakfast_request',
        'qr_menu_question',
        'location_question',
        'price_question',
        'other'
    ];

    if (!in_array($requestType, $allowedTypes, true)) {
        $errors[] = [
            'field' => 'request_type',
            'message' => 'Talep türü geçerli değil.'
        ];
    }

    $customerName = ya_string($payload['customer_name'] ?? '');
    if ($customerName === '') {
        $errors[] = [
            'field' => 'customer_name',
            'message' => 'Ad soyad alanı gerekli.'
        ];
    } elseif (strlen($customerName) > 160) {
        $errors[] = [
            'field' => 'customer_name',
            'message' => 'Ad soyad alanı çok uzun.'
        ];
    }

    $phone = ya_normalize_tr_phone(ya_string($payload['customer_phone'] ?? ''));
    if (!$phone['ok']) {
        $errors[] = [
            'field' => 'customer_phone',
            'message' => 'Telefon numarası Türkiye cep telefonu formatında olmalı.'
        ];
    }

    $dateText = ya_string($payload['date_text'] ?? '');
    $startDate = ya_string($payload['start_date'] ?? '');
    if ($dateText === '' && $startDate === '') {
        $errors[] = [
            'field' => 'date_text',
            'message' => 'Tarih bilgisi gerekli.'
        ];
    } elseif (strlen($dateText) > 160 || strlen($startDate) > 40) {
        $errors[] = [
            'field' => 'date_text',
            'message' => 'Tarih bilgisi çok uzun.'
        ];
    }

    $guestCount = ya_int($payload['guest_count'] ?? 0, 0);
    if ($guestCount < 1 || $guestCount > 200) {
        $errors[] = [
            'field' => 'guest_count',
            'message' => 'Kişi sayısı 1 ile 200 arasında olmalı.'
        ];
    }

    if (strlen(ya_string($payload['message'] ?? '')) > 3000) {
        $errors[] = [
            'field' => 'message',
            'message' => 'Not alanı çok uzun.'
        ];
    }

    if (strlen(ya_string($payload['whatsapp_message'] ?? '')) > 5000) {
        $errors[] = [
            'field' => 'whatsapp_message',
            'message' => 'WhatsApp mesajı çok uzun.'
        ];
    }

    return $errors;
}

function ya_build_whatsapp_message(array $businessConfig, array $payload): string
{
    $businessName = ya_string($businessConfig['display_name'] ?? $businessConfig['name'] ?? 'İşletme');
    $requestTypeLabels = [
        'general_info' => 'Bilgi talebi',
        'pension_reservation' => 'Pansiyon rezervasyonu',
        'restaurant_reservation' => 'Masa rezervasyonu',
        'breakfast_request' => 'Kahvaltı talebi',
        'qr_menu_question' => 'Menü sorusu',
        'location_question' => 'Ulaşım sorusu',
        'price_question' => 'Fiyat sorusu',
        'other' => 'Diğer'
    ];
    $requestType = ya_string($payload['request_type'] ?? 'general_info');
    $lines = [
        'Merhaba, ' . $businessName . ' için talep oluşturmak istiyorum.',
        'Talep türü: ' . ($requestTypeLabels[$requestType] ?? 'Bilgi talebi'),
        'Ad soyad: ' . ya_string($payload['customer_name'] ?? ''),
        'Telefon: ' . ya_string($payload['customer_phone'] ?? ''),
        'Tarih: ' . (ya_string($payload['date_text'] ?? '') ?: ya_string($payload['start_date'] ?? '')),
        'Kişi sayısı: ' . ya_int($payload['guest_count'] ?? 1, 1)
    ];
    $message = ya_string($payload['message'] ?? '');

    if ($message !== '') {
        $lines[] = 'Not: ' . $message;
    }

    $lines[] = 'Lütfen bilgileri kontrol edip gönder tuşuna basın.';

    return implode("\n", $lines);
}

function ya_normalize_tr_phone(string $phone): array
{
    $value = preg_replace('/[^\d+]/', '', trim($phone));
    $value = preg_replace('/^00/', '+', $value ?? '');
    $national = null;

    if (substr($value, 0, 3) === '+90') {
        $national = substr($value, 3);
    } elseif (substr($value, 0, 2) === '90' && strlen($value) === 12) {
        $national = substr($value, 2);
    } elseif (substr($value, 0, 1) === '0' && strlen($value) === 11) {
        $national = substr($value, 1);
    } elseif (strlen($value) === 10) {
        $national = $value;
    }

    if (!is_string($national) || preg_match('/^5\d{9}$/', $national) !== 1) {
        return [
            'ok' => false,
            'e164' => '',
            'whatsapp' => ''
        ];
    }

    return [
        'ok' => true,
        'e164' => '+90' . $national,
        'whatsapp' => '90' . $national
    ];
}

function ya_create_id(string $prefix): string
{
    return $prefix . date('YmdHis') . '_' . bin2hex(random_bytes(4));
}

function ya_json_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ya_string(mixed $value): string
{
    return trim((string) $value);
}

function ya_int(mixed $value, int $fallback): int
{
    if (is_numeric($value)) {
        return (int) $value;
    }

    return $fallback;
}
