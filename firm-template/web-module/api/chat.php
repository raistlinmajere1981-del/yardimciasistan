<?php
declare(strict_types=1);

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';
const YA_AI_CONFIG_FILE = YA_BASE_DIR . '/config/ai.php';
const YA_KNOWLEDGE_DIR = YA_BASE_DIR . '/knowledge';
const YA_AI_CONVERSATIONS_FILE = YA_BASE_DIR . '/data/ai-conversations.json';
const YA_REQUESTS_FILE = YA_BASE_DIR . '/data/requests.json';

$businessConfig = ya_chat_load_json(YA_CONFIG_FILE, []);
$aiConfig = is_file(YA_AI_CONFIG_FILE) ? require YA_AI_CONFIG_FILE : [];
if (!is_array($aiConfig)) {
    $aiConfig = [];
}

ya_chat_apply_cors($businessConfig);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    ya_chat_response(405, [
        'ok' => false,
        'message' => 'AI sohbeti için mesaj gönderimi gerekli.'
    ]);
}

$payloadResult = ya_chat_read_payload();
if (!$payloadResult['ok']) {
    ya_chat_response(400, [
        'ok' => false,
        'message' => $payloadResult['message']
    ]);
}

$payload = $payloadResult['data'];
$message = ya_chat_string($payload['message'] ?? '');

if ($message === '') {
    ya_chat_response(422, [
        'ok' => false,
        'message' => 'Mesaj alanı boş olamaz.'
    ]);
}

if (mb_strlen($message) > 1200) {
    ya_chat_response(422, [
        'ok' => false,
        'message' => 'Mesaj çok uzun. Lütfen daha kısa yazın.'
    ]);
}

$knowledgeDocuments = ya_chat_load_knowledge(YA_KNOWLEDGE_DIR);
$result = ya_chat_generate_reply($businessConfig, $aiConfig, $payload, $message, $knowledgeDocuments);
$conversationId = ya_chat_create_id('ai_conv_');
$now = date(DATE_ATOM);
$requestDraft = ya_chat_extract_request($businessConfig, $payload, $message, $now);
$request = $requestDraft['request'];
$requestId = '';
$requestShouldBeCreated = is_array($request);
$requestWasCreated = false;

try {
    if ($requestShouldBeCreated) {
        ya_chat_append_json_record(YA_REQUESTS_FILE, $request);
        $requestId = $request['id'];
        $requestWasCreated = true;
    }

    ya_chat_append_json_record(YA_AI_CONVERSATIONS_FILE, [
        'id' => $conversationId,
        'source' => 'web_ai',
        'customer_id' => '',
        'request_id' => $requestId,
        'status' => $requestId !== '' ? 'converted_to_request' : ($result['fallback'] ? 'fallback' : 'answered'),
        'messages_json' => json_encode([
            [
                'role' => 'user',
                'content' => $message,
                'created_at' => $now
            ],
            [
                'role' => 'assistant',
                'content' => $result['answer'],
                'created_at' => $now
            ]
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'summary' => '',
        'created_at' => $now,
        'updated_at' => $now,
        'sync_status' => 'local_only'
    ]);
} catch (Throwable $error) {
    ya_chat_response(500, [
        'ok' => false,
        'message' => $requestShouldBeCreated && !$requestWasCreated ? 'AI talebi kaydedilemedi.' : 'AI konuşması kaydedilemedi.'
    ]);
}

ya_chat_response(200, [
    'ok' => true,
    'answer' => $result['answer'],
    'fallback' => $result['fallback'],
    'provider' => $result['provider'],
    'model' => $result['model'],
    'conversation_id' => $conversationId,
    'request_created' => $requestId !== '',
    'request_id' => $requestId,
    'request_missing_fields' => $requestDraft['missing_fields'],
    'knowledge_files' => array_map(static function (array $document): string {
        return $document['id'];
    }, $knowledgeDocuments)
]);

function ya_chat_generate_reply(array $businessConfig, array $aiConfig, array $payload, string $message, array $knowledgeDocuments): array
{
    $fallbackAnswer = ya_chat_fallback_answer();
    $enabled = ya_chat_bool($aiConfig['enabled'] ?? false);
    $provider = ya_chat_string($aiConfig['provider'] ?? 'disabled') ?: 'disabled';

    if (!$enabled) {
        return [
            'answer' => $fallbackAnswer,
            'fallback' => true,
            'provider' => 'disabled',
            'model' => ''
        ];
    }

    if ($provider !== 'openai_compatible') {
        return [
            'answer' => $fallbackAnswer,
            'fallback' => true,
            'provider' => $provider,
            'model' => ''
        ];
    }

    $baseUrl = ya_chat_string($aiConfig['base_url'] ?? '');
    $model = ya_chat_string($aiConfig['model'] ?? '');
    $apiKey = ya_chat_string($aiConfig['api_key'] ?? '');

    if ($baseUrl === '' || $model === '' || $apiKey === '') {
        return [
            'answer' => $fallbackAnswer,
            'fallback' => true,
            'provider' => 'openai_compatible',
            'model' => $model
        ];
    }

    $chatResult = ya_chat_call_openai_compatible([
        'base_url' => $baseUrl,
        'model' => $model,
        'api_key' => $apiKey,
        'timeout_seconds' => ya_chat_int($aiConfig['timeout_seconds'] ?? 15, 15),
        'messages' => ya_chat_build_messages($businessConfig, $payload, $message, $knowledgeDocuments)
    ]);

    if (!$chatResult['ok']) {
        return [
            'answer' => $fallbackAnswer,
            'fallback' => true,
            'provider' => 'openai_compatible',
            'model' => $model
        ];
    }

    return [
        'answer' => $chatResult['answer'],
        'fallback' => false,
        'provider' => 'openai_compatible',
        'model' => $model
    ];
}

function ya_chat_build_messages(array $businessConfig, array $payload, string $message, array $knowledgeDocuments): array
{
    $history = $payload['history'] ?? [];
    $messages = [
        [
            'role' => 'system',
            'content' => ya_chat_build_system_prompt($businessConfig, $knowledgeDocuments)
        ]
    ];

    if (is_array($history)) {
        $history = array_slice($history, -6);
        foreach ($history as $historyMessage) {
            if (!is_array($historyMessage)) {
                continue;
            }

            $role = ya_chat_string($historyMessage['role'] ?? '');
            $content = ya_chat_string($historyMessage['content'] ?? '');
            if (!in_array($role, ['user', 'assistant'], true) || $content === '') {
                continue;
            }

            $messages[] = [
                'role' => $role,
                'content' => mb_substr($content, 0, 900)
            ];
        }
    }

    $messages[] = [
        'role' => 'user',
        'content' => mb_substr($message, 0, 1200)
    ];

    return $messages;
}

function ya_chat_build_system_prompt(array $businessConfig, array $knowledgeDocuments): string
{
    $businessName = ya_chat_string($businessConfig['display_name'] ?? $businessConfig['name'] ?? 'İşletme');
    $knowledge = [];
    foreach ($knowledgeDocuments as $document) {
        $knowledge[] = '## ' . $document['title'] . "\n" . $document['content'];
    }

    return implode("\n", [
        $businessName . ' için web sitesinde müşteriye yardımcı olan kısa yanıtlı bir asistansın.',
        'Türkçe, samimi ve net cevap ver.',
        'Kesin rezervasyon, kesin müsaitlik veya bağlayıcı fiyat onayı verme.',
        'Müsaitlik ve fiyat için işletme sahibinin kontrol edip dönüş yapacağını belirt.',
        'Eksik tarih, saat, kişi sayısı, telefon veya tercih bilgisi varsa en fazla iki kısa soru sor.',
        'Gerekirse talep formuna veya WhatsApp’a yönlendir.',
        'Bilmediğin konuda tahmin yürütme; işletme sahibinin dönüş yapacağını söyle.',
        '',
        'Firma bilgileri:',
        $knowledge === [] ? 'Firma bilgi dosyası bulunamadı.' : implode("\n\n", $knowledge)
    ]);
}

function ya_chat_call_openai_compatible(array $options): array
{
    $response = ya_chat_post_json(ya_chat_completions_url($options['base_url']), [
        'model' => $options['model'],
        'messages' => $options['messages'],
        'store' => false
    ], [
        'Authorization: Bearer ' . $options['api_key'],
        'Content-Type: application/json'
    ], max(1, ya_chat_int($options['timeout_seconds'] ?? 15, 15)));

    if (!$response['ok']) {
        return [
            'ok' => false,
            'message' => 'AI cevabı alınamadı.'
        ];
    }

    $data = json_decode($response['body'], true);
    if (!is_array($data)) {
        return [
            'ok' => false,
            'message' => 'AI cevabı okunamadı.'
        ];
    }

    $content = $data['choices'][0]['message']['content'] ?? '';
    if (is_array($content)) {
        $content = implode('', array_map(static function ($part): string {
            return is_array($part) ? ya_chat_string($part['text'] ?? '') : '';
        }, $content));
    }

    $answer = ya_chat_string($content);
    if ($answer === '') {
        return [
            'ok' => false,
            'message' => 'AI cevabı boş döndü.'
        ];
    }

    return [
        'ok' => true,
        'answer' => $answer
    ];
}

function ya_chat_post_json(string $url, array $body, array $headers, int $timeoutSeconds): array
{
    $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return [
            'ok' => false,
            'body' => ''
        ];
    }

    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        curl_setopt_array($handle, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeoutSeconds
        ]);
        $bodyText = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
        curl_close($handle);

        return [
            'ok' => is_string($bodyText) && $status >= 200 && $status < 300,
            'body' => is_string($bodyText) ? $bodyText : ''
        ];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'content' => $json,
            'timeout' => $timeoutSeconds,
            'ignore_errors' => true
        ]
    ]);
    $bodyText = file_get_contents($url, false, $context);
    $statusLine = $http_response_header[0] ?? '';
    preg_match('/\s(\d{3})\s/', $statusLine, $matches);
    $status = isset($matches[1]) ? (int) $matches[1] : 0;

    return [
        'ok' => is_string($bodyText) && $status >= 200 && $status < 300,
        'body' => is_string($bodyText) ? $bodyText : ''
    ];
}

function ya_chat_completions_url(string $baseUrl): string
{
    $baseUrl = rtrim($baseUrl, '/');
    if (str_ends_with($baseUrl, '/chat/completions')) {
        return $baseUrl;
    }

    return $baseUrl . '/chat/completions';
}

function ya_chat_load_knowledge(string $directory): array
{
    $fileNames = ['firma.md', 'odalar.md', 'restoran.md', 'menu.md', 'sik-sorulan-sorular.md'];
    $documents = [];
    $usedChars = 0;
    $maxCharsPerFile = 2400;
    $maxTotalChars = 9000;

    foreach ($fileNames as $fileName) {
        if ($usedChars >= $maxTotalChars) {
            break;
        }

        $path = $directory . '/' . $fileName;
        if (!is_file($path)) {
            continue;
        }

        $rawContent = trim((string) file_get_contents($path));
        if ($rawContent === '') {
            continue;
        }

        $limit = min($maxCharsPerFile, $maxTotalChars - $usedChars);
        $content = mb_substr($rawContent, 0, $limit);
        $usedChars += mb_strlen($content);

        $documents[] = [
            'id' => pathinfo($fileName, PATHINFO_FILENAME),
            'title' => ya_chat_markdown_title($rawContent) ?: $fileName,
            'content' => $content,
            'truncated' => mb_strlen($rawContent) > mb_strlen($content)
        ];
    }

    return $documents;
}

function ya_chat_markdown_title(string $content): string
{
    foreach (preg_split('/\r?\n/', $content) ?: [] as $line) {
        if (str_starts_with($line, '# ')) {
            return trim(substr($line, 2));
        }
    }

    return '';
}

function ya_chat_fallback_answer(): string
{
    return 'AI yardımcı şu anda aktif değil. Talebinizi form veya WhatsApp üzerinden iletebilirsiniz; işletme sahibi müsaitlik ve fiyat bilgisini kontrol edip dönüş yapacaktır.';
}

function ya_chat_extract_request(array $businessConfig, array $payload, string $message, string $now): array
{
    if (!ya_chat_has_request_intent($payload, $message)) {
        return [
            'request' => null,
            'missing_fields' => []
        ];
    }

    $customerName = ya_chat_first_string($payload, ['customer_name', 'customerName', 'name', 'full_name', 'fullName']);
    $customerPhone = ya_chat_first_string($payload, ['customer_phone', 'customerPhone', 'phone', 'phone_number', 'phoneNumber']);
    $phone = ya_chat_normalize_tr_phone($customerPhone);
    $missingFields = [];

    if ($customerName === '') {
        $missingFields[] = 'customer_name';
    }

    if (!$phone['ok']) {
        $missingFields[] = 'customer_phone';
    }

    if ($missingFields !== []) {
        return [
            'request' => null,
            'missing_fields' => $missingFields
        ];
    }

    $requestType = ya_chat_normalize_request_type(ya_chat_first_string($payload, ['request_type', 'requestType']));
    if ($requestType === '') {
        $requestType = ya_chat_detect_request_type($message);
    }

    $dateText = ya_chat_extract_date_text($payload, $message);
    $startDate = ya_chat_first_string($payload, ['start_date', 'startDate']);
    $endDate = ya_chat_first_string($payload, ['end_date', 'endDate']);
    $time = ya_chat_extract_time($payload, $message);
    $guestCount = ya_chat_extract_guest_count($payload, $message);
    $adultCount = ya_chat_int(ya_chat_first_string($payload, ['adult_count', 'adultCount']), 0);
    $childCount = ya_chat_int(ya_chat_first_string($payload, ['child_count', 'childCount']), 0);
    $requestMessage = ya_chat_first_string($payload, ['request_message', 'requestMessage', 'note', 'notes']);

    if ($requestMessage === '') {
        $requestMessage = $message;
    }

    $request = [
        'id' => ya_chat_create_id('request_'),
        'customer_id' => '',
        'source' => 'web_ai',
        'request_type' => $requestType,
        'status' => 'new',
        'customer_name' => $customerName,
        'customer_phone' => $phone['e164'],
        'date_text' => $dateText,
        'start_date' => $startDate,
        'end_date' => $endDate,
        'time' => $time,
        'guest_count' => $guestCount,
        'adult_count' => max(0, $adultCount),
        'child_count' => max(0, $childCount),
        'message' => mb_substr($requestMessage, 0, 1200),
        'ai_summary' => 'Web AI sohbetinden oluşturuldu.',
        'ai_suggested_reply' => '',
        'whatsapp_message' => '',
        'assigned_to' => '',
        'priority' => 'normal',
        'sync_status' => 'pending',
        'created_at' => $now,
        'updated_at' => $now
    ];
    $request['whatsapp_message'] = ya_chat_build_request_whatsapp_message($businessConfig, $request);

    return [
        'request' => $request,
        'missing_fields' => []
    ];
}

function ya_chat_has_request_intent(array $payload, string $message): bool
{
    if (ya_chat_bool($payload['create_request'] ?? $payload['createRequest'] ?? false)) {
        return true;
    }

    if (ya_chat_normalize_request_type(ya_chat_first_string($payload, ['request_type', 'requestType'])) !== '') {
        return true;
    }

    return preg_match('/\b(rezervasyon|rezerve|talep|oda|pansiyon|konaklama|masa|kahvaltı|kahvalti|fiyat|ücret|ucret|müsait|musait|yer var|bilgi almak)\b/iu', $message) === 1;
}

function ya_chat_normalize_request_type(string $requestType): string
{
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

    return in_array($requestType, $allowedTypes, true) ? $requestType : '';
}

function ya_chat_detect_request_type(string $text): string
{
    $normalized = ya_chat_lower($text);

    if (ya_chat_contains_any($normalized, ['kahvaltı', 'kahvalti', 'serpme'])) {
        return 'breakfast_request';
    }

    if (ya_chat_contains_any($normalized, ['oda', 'pansiyon', 'konaklama', 'geceleme'])) {
        return 'pension_reservation';
    }

    if (ya_chat_contains_any($normalized, ['masa', 'restoran', 'restaurant', 'akşam yemeği', 'aksam yemegi'])) {
        return 'restaurant_reservation';
    }

    if (ya_chat_contains_any($normalized, ['menü', 'menu', 'qr'])) {
        return 'qr_menu_question';
    }

    if (ya_chat_contains_any($normalized, ['adres', 'konum', 'ulaşım', 'ulasim', 'nasıl gel', 'nasil gel'])) {
        return 'location_question';
    }

    if (ya_chat_contains_any($normalized, ['fiyat', 'ücret', 'ucret', 'ne kadar'])) {
        return 'price_question';
    }

    return 'general_info';
}

function ya_chat_extract_guest_count(array $payload, string $message): int
{
    $explicitGuestCount = ya_chat_int(ya_chat_first_string($payload, ['guest_count', 'guestCount', 'guests', 'person_count', 'personCount']), 0);
    if ($explicitGuestCount > 0) {
        return min($explicitGuestCount, 99);
    }

    $adultCount = ya_chat_int(ya_chat_first_string($payload, ['adult_count', 'adultCount']), 0);
    $childCount = ya_chat_int(ya_chat_first_string($payload, ['child_count', 'childCount']), 0);
    if ($adultCount + $childCount > 0) {
        return min($adultCount + $childCount, 99);
    }

    if (preg_match_all('/(\d{1,2})\s*(kişi|kisi|misafir|yetişkin|yetiskin|çocuk|cocuk|adult|guest)/iu', $message, $matches) >= 1) {
        $total = 0;
        foreach ($matches[1] as $count) {
            $total += (int) $count;
        }

        if ($total > 0) {
            return min($total, 99);
        }
    }

    return 1;
}

function ya_chat_extract_date_text(array $payload, string $message): string
{
    $explicitDate = ya_chat_first_string($payload, ['date_text', 'dateText', 'date', 'start_date', 'startDate']);
    if ($explicitDate !== '') {
        return $explicitDate;
    }

    if (preg_match('/\b(bugün|bugun|yarın|yarin|bu akşam|bu aksam|hafta sonu)\b/iu', $message, $matches) === 1) {
        return ya_chat_string($matches[1] ?? '');
    }

    $months = 'ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik';
    if (preg_match('/\b\d{1,2}\s*(?:' . $months . ')(?:\s*[-–]\s*\d{1,2}\s*(?:' . $months . ')?)?\b/iu', $message, $matches) === 1) {
        return ya_chat_string($matches[0] ?? '');
    }

    if (preg_match('/\b\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b/u', $message, $matches) === 1) {
        return ya_chat_string($matches[0] ?? '');
    }

    return '';
}

function ya_chat_extract_time(array $payload, string $message): string
{
    $explicitTime = ya_chat_first_string($payload, ['time', 'time_text', 'timeText']);
    if ($explicitTime !== '') {
        return $explicitTime;
    }

    if (preg_match('/\b(?:saat\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/iu', $message, $matches) === 1) {
        return sprintf('%02d:%02d', (int) $matches[1], (int) $matches[2]);
    }

    return '';
}

function ya_chat_build_request_whatsapp_message(array $businessConfig, array $request): string
{
    $businessName = ya_chat_string($businessConfig['display_name'] ?? $businessConfig['name'] ?? 'İşletme');
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
    $requestType = ya_chat_string($request['request_type'] ?? 'general_info');
    $lines = [
        'Merhaba, ' . $businessName . ' için talep oluşturmak istiyorum.',
        'Talep türü: ' . ($requestTypeLabels[$requestType] ?? 'Bilgi talebi'),
        'Ad soyad: ' . ya_chat_string($request['customer_name'] ?? ''),
        'Telefon: ' . ya_chat_string($request['customer_phone'] ?? ''),
        'Tarih: ' . (ya_chat_string($request['date_text'] ?? '') ?: ya_chat_string($request['start_date'] ?? '')),
        'Kişi sayısı: ' . ya_chat_int($request['guest_count'] ?? 1, 1)
    ];
    $time = ya_chat_string($request['time'] ?? '');
    $message = ya_chat_string($request['message'] ?? '');

    if ($time !== '') {
        $lines[] = 'Saat: ' . $time;
    }

    if ($message !== '') {
        $lines[] = 'Not: ' . $message;
    }

    $lines[] = 'Lütfen bilgileri kontrol edip gönder tuşuna basın.';

    return implode("\n", $lines);
}

function ya_chat_normalize_tr_phone(string $phone): array
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
            'e164' => ''
        ];
    }

    return [
        'ok' => true,
        'e164' => '+90' . $national
    ];
}

function ya_chat_first_string(array $payload, array $keys): string
{
    foreach ($keys as $key) {
        $value = ya_chat_string($payload[$key] ?? '');
        if ($value !== '') {
            return $value;
        }
    }

    return '';
}

function ya_chat_contains_any(string $text, array $needles): bool
{
    foreach ($needles as $needle) {
        if (str_contains($text, ya_chat_lower($needle))) {
            return true;
        }
    }

    return false;
}

function ya_chat_lower(string $value): string
{
    return mb_strtolower($value, 'UTF-8');
}

function ya_chat_load_json(string $path, mixed $fallback): mixed
{
    if (!is_file($path)) {
        return $fallback;
    }

    $json = file_get_contents($path);
    $data = json_decode($json ?: '', true);

    return $data === null ? $fallback : $data;
}

function ya_chat_apply_cors(array $businessConfig): void
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

function ya_chat_read_payload(): array
{
    $rawBody = file_get_contents('php://input') ?: '';
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (stripos($contentType, 'application/json') !== false || $rawBody !== '') {
        $data = json_decode($rawBody, true);
        if (is_array($data)) {
            return [
                'ok' => true,
                'data' => $data
            ];
        }
    }

    if ($_POST !== []) {
        return [
            'ok' => true,
            'data' => $_POST
        ];
    }

    return [
        'ok' => false,
        'message' => 'Mesaj bilgisi alınamadı.'
    ];
}

function ya_chat_append_json_record(string $path, array $record): void
{
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
        throw new RuntimeException('data_directory_missing');
    }

    $handle = fopen($path, 'c+');
    if ($handle === false) {
        throw new RuntimeException('data_file_open_failed');
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            throw new RuntimeException('data_file_lock_failed');
        }

        rewind($handle);
        $contents = stream_get_contents($handle);
        $records = json_decode($contents ?: '[]', true);
        if (!is_array($records)) {
            $records = [];
        }

        $records[] = $record;
        $json = json_encode($records, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('data_encode_failed');
        }

        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, $json . PHP_EOL);
        fflush($handle);
        flock($handle, LOCK_UN);
    } finally {
        fclose($handle);
    }
}

function ya_chat_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ya_chat_create_id(string $prefix): string
{
    return $prefix . date('YmdHis') . '_' . bin2hex(random_bytes(4));
}

function ya_chat_string(mixed $value): string
{
    return trim((string) $value);
}

function ya_chat_int(mixed $value, int $fallback): int
{
    if (is_numeric($value)) {
        return (int) $value;
    }

    return $fallback;
}

function ya_chat_bool(mixed $value): bool
{
    if (is_bool($value)) {
        return $value;
    }

    if (is_string($value)) {
        return in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
    }

    return (bool) $value;
}
