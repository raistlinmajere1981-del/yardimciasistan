<?php
declare(strict_types=1);

const YA_BASE_DIR = __DIR__ . '/..';
const YA_CONFIG_FILE = YA_BASE_DIR . '/config/business.json';
const YA_AI_CONFIG_FILE = YA_BASE_DIR . '/config/ai.php';
const YA_KNOWLEDGE_DIR = YA_BASE_DIR . '/knowledge';
const YA_AI_CONVERSATIONS_FILE = YA_BASE_DIR . '/data/ai-conversations.json';

require_once YA_BASE_DIR . '/lib/storage.php';
require_once YA_BASE_DIR . '/lib/android-device-auth.php';
require_once YA_BASE_DIR . '/lib/business-ai-policy.php';
require_once YA_BASE_DIR . '/lib/cloudflare-ai.php';

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
if (array_key_exists('report_mode', $payload)) {
    ya_chat_generate_android_report($businessConfig, $aiConfig, $payload);
}
if (!ya_android_auth_snapshot_has_capabilities(['service.ai'])) {
    ya_chat_response(403, [
        'ok' => false,
        'code' => 'ai_capability_disabled',
        'message' => 'AI bu işletmede etkin değil.'
    ]);
}
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

$businessContext = ya_chat_load_business_context();
$effectiveBusinessConfig = ya_chat_merge_business_context($businessConfig, $businessContext);
$profileId = ya_chat_string($effectiveBusinessConfig['profile_id'] ?? '');
$knowledgeDocuments = ya_chat_load_knowledge(YA_KNOWLEDGE_DIR, $profileId);
$catalogContext = ya_chat_find_catalog_matches(ya_chat_load_ai_catalog(), $message, 8);
$result = ya_chat_generate_reply($effectiveBusinessConfig, $aiConfig, $payload, $message, $knowledgeDocuments, $businessContext, $catalogContext);
$conversationId = ya_chat_create_id('ai_conv_');
$now = date(DATE_ATOM);
$requestDraft = ya_chat_extract_request($effectiveBusinessConfig, $businessContext, $payload, $message, $now);
$request = $requestDraft['request'];
$requestId = '';
$requestShouldBeCreated = is_array($request);
$requestWasCreated = false;

try {
    if ($requestShouldBeCreated) {
        ya_storage_insert_request($request);
        $requestId = $request['id'];
        $requestWasCreated = true;
    }

    ya_chat_append_json_record(YA_AI_CONVERSATIONS_FILE, [
        'id' => $conversationId,
        'source' => 'web_ai',
        'customer_id' => '',
        'request_id' => $requestId,
        'status' => $requestId !== '' ? 'converted_to_request' : ($result['fallback'] ? 'fallback' : 'answered'),
        'provider' => $result['provider'],
        'model' => $result['model'],
        'error_code' => (string) ($result['error']['code'] ?? ''),
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
        'summary' => $result['fallback'] ? (string) ($result['error']['message'] ?? '') : '',
        'created_at' => $now,
        'updated_at' => $now,
        'sync_status' => 'local_only'
    ]);
} catch (Throwable $error) {
    $storageUnavailable = $error->getMessage() === 'pdo_sqlite_missing';
    ya_chat_response($storageUnavailable ? 503 : 500, [
        'ok' => false,
        'message' => $storageUnavailable
            ? 'Hostingde PHP SQLite desteği etkin değil. PDO_SQLITE eklentisini açıp tekrar deneyin.'
            : ($requestShouldBeCreated && !$requestWasCreated ? 'AI talebi kaydedilemedi.' : 'AI konuşması kaydedilemedi.')
    ]);
}

ya_chat_response(200, [
    'ok' => true,
    'answer' => $result['answer'],
    'fallback' => $result['fallback'],
    'error' => $result['fallback'] ? $result['error'] : null,
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

function ya_chat_generate_android_report(array $businessConfig, array $aiConfig, array $payload): void
{
    $configuredSecret = ya_chat_string($businessConfig['sync_secret'] ?? '');
    $providedSecret = ya_chat_string($_SERVER['HTTP_X_YA_SYNC_SECRET'] ?? '');
    if ($configuredSecret === '' || $providedSecret === '' || !hash_equals($configuredSecret, $providedSecret)) {
        ya_chat_response(401, [
            'ok' => false,
            'message' => 'AI rapor yorumu izni alınamadı. Güvenlik anahtarını kontrol edin.'
        ]);
    }

    $deviceId = ya_chat_string($payload['device_id'] ?? '');
    if (preg_match('/^[A-Za-z0-9._:-]{6,120}$/', $deviceId) !== 1) {
        ya_chat_response(422, ['ok' => false, 'message' => 'Telefon kimliği geçersiz.']);
    }
    $snapshot = ya_storage_get_publication('android_snapshot', []);
    unset($snapshot['_publication']);
    $profile = ya_android_auth_device_profile($snapshot, $deviceId);
    if (($profile['role'] ?? 'staff') !== 'admin' || !ya_chat_bool($profile['is_active'] ?? false)) {
        ya_chat_response(403, [
            'ok' => false,
            'message' => 'Bu cihazın raporlara erişim yetkisi yok.'
        ]);
    }
    if (!ya_android_auth_snapshot_has_capabilities(['service.android', 'service.ai', 'core.reports'], $snapshot)) {
        ya_chat_response(403, [
            'ok' => false,
            'code' => 'android_ai_capability_disabled',
            'message' => 'Android AI rapor yorumu bu işletmede etkin değil.'
        ]);
    }

    $mode = ya_chat_string($payload['report_mode'] ?? '');
    $preset = ya_chat_string($payload['report_preset'] ?? '');
    $modeInstructions = [
        'summary' => 'Seçilen dönemin genel durumunu 3–5 kısa cümle veya maddeyle özetle.',
        'attention' => 'Dikkat gerektirenleri müşteri talepleri, rezervasyonlar, hesap bekleyen masalar, işler ve stok sırasıyla önceliklendir.',
        'sales' => 'Yalnız restoran cirosunu, ortalama hesabı, en çok satılan ürünleri ve günlük değişimleri yorumla.',
        'recommendations' => 'Mevcut verilere dayanan en fazla 3 kısa ve uygulanabilir işletme önerisi ver.'
    ];
    if (!isset($modeInstructions[$mode]) || !in_array($preset, ['today', 'yesterday', 'last7', 'last30'], true)) {
        ya_chat_response(422, ['ok' => false, 'message' => 'AI rapor yorumu seçimi geçersiz.']);
    }
    $report = is_array($snapshot['reports'][$preset] ?? null) ? $snapshot['reports'][$preset] : [];
    if ($report === []) {
        ya_chat_response(409, [
            'ok' => false,
            'message' => 'Rapor verisi henüz hazır değil. Masaüstünde senkronu yenileyin.'
        ]);
    }

    if (!ya_chat_bool($aiConfig['enabled'] ?? false)
        || ya_chat_string($aiConfig['provider'] ?? '') !== 'openai_compatible') {
        ya_chat_response(503, [
            'ok' => false,
            'message' => 'Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.'
        ]);
    }
    $baseUrl = ya_chat_string($aiConfig['base_url'] ?? '');
    $model = ya_chat_string($aiConfig['model'] ?? '');
    $apiKey = ya_chat_string($aiConfig['api_key'] ?? '');
    $service = ya_chat_string($aiConfig['service'] ?? 'custom');
    if ($baseUrl === '' || $model === '' || $apiKey === '') {
        ya_chat_response(503, [
            'ok' => false,
            'message' => 'Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.'
        ]);
    }

    if (!ya_chat_report_has_data($report)) {
        ya_chat_response(200, [
            'ok' => true,
            'answer' => 'Bu dönem için yeterli veri yok.',
            'fallback' => false,
            'provider' => 'local_validation',
            'model' => ''
        ]);
    }
    $systemPrompt = implode("\n", [
        'İşletme sahibine kısa bir rapor yorumu yaz.',
        $modeInstructions[$mode],
        'Yalnız kullanıcı mesajındaki hesaplanmış JSON verisini kullan.',
        'Hiçbir metrik hesaplama, oran çıkarma veya tahmin yapma.',
        'JSON içinde bulunmayan hiçbir sayı, tarih, tutar ya da adet yazma.',
        'Sayısal bilgileri yalnız rakamla yaz; sayı kelimeleri kullanma.',
        'Veri yoksa aynen “Bu dönem için yeterli veri yok.” yaz.',
        'Türkçe, sade ve doğrudan yaz; başlık veya tablo ekleme.',
        'Numaralı liste kullanma; gerekiyorsa tire işaretli en fazla 5 madde yaz.',
        'Muhasebe, vergi, yatırım, kâr-zarar veya finansal tahmin tavsiyesi verme.'
    ]);
    $reportJson = json_encode($report, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($reportJson)) {
        ya_chat_response(500, [
            'ok' => false,
            'message' => 'Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.'
        ]);
    }
    $chatOptions = [
        'base_url' => $baseUrl,
        'model' => $model,
        'api_key' => $apiKey,
        'timeout_seconds' => ya_chat_int($aiConfig['timeout_seconds'] ?? 15, 15),
        'messages' => [
            ['role' => 'system', 'content' => $systemPrompt],
            ['role' => 'user', 'content' => $reportJson]
        ]
    ];
    $result = $service === 'gemini'
        ? ya_chat_call_google_ai_studio($chatOptions)
        : ($service === 'cloudflare' ? ya_cloudflare_chat($chatOptions) : ya_chat_call_openai_compatible($chatOptions));
    if (!($result['ok'] ?? false)) {
        ya_chat_response(503, [
            'ok' => false,
            'message' => 'Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.'
        ]);
    }
    $answer = ya_chat_sanitize_report_answer(
        ya_chat_string($result['answer'] ?? ''),
        $report,
        $mode === 'recommendations' ? 3 : 5
    );
    if ($answer === '') {
        ya_chat_response(502, [
            'ok' => false,
            'message' => 'Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı.'
        ]);
    }
    ya_chat_response(200, [
        'ok' => true,
        'answer' => $answer,
        'fallback' => false,
        'provider' => 'openai_compatible',
        'model' => $model
    ]);
}

function ya_chat_report_has_data(array $report): bool
{
    $summary = is_array($report['summary'] ?? null) ? $report['summary'] : [];
    foreach ($summary as $value) {
        if (is_numeric($value) && (float) $value > 0) {
            return true;
        }
    }
    $restaurant = is_array($report['restaurant'] ?? null) ? $report['restaurant'] : [];
    $attention = is_array($report['attention'] ?? null) ? $report['attention'] : [];
    return (is_array($restaurant['top_items'] ?? null) && $restaurant['top_items'] !== [])
        || (is_array($attention['items'] ?? null) && $attention['items'] !== []);
}

function ya_chat_sanitize_report_answer(string $answer, array $report, int $maxLines): string
{
    $answer = trim((string) preg_replace('/^\s*\d+[.)]\s+/mu', '- ', str_replace(["\r\n", "\r"], "\n", $answer)));
    if ($answer === '') {
        return '';
    }
    $allowed = ['decimals' => [], 'integers' => []];
    ya_chat_collect_report_numbers($report, $allowed);
    preg_match_all('/[-+]?\d+(?:[.,]\d+)*/u', $answer, $matches);
    foreach ($matches[0] ?? [] as $token) {
        if (!ya_chat_report_number_allowed((string) $token, $allowed)) {
            return '';
        }
    }
    $lines = array_values(array_filter(array_map('trim', explode("\n", $answer)), static fn(string $line): bool => $line !== ''));
    if (count($lines) > 1) {
        return mb_substr(implode("\n", array_slice($lines, 0, $maxLines)), 0, 2400);
    }
    $sentences = preg_split('/(?<=[.!?])\s+/u', $answer) ?: [$answer];
    return mb_substr(implode(' ', array_slice($sentences, 0, $maxLines)), 0, 2400);
}

function ya_chat_collect_report_numbers(mixed $value, array &$allowed): void
{
    if (is_int($value) || is_float($value)) {
        $canonical = ya_chat_report_decimal((float) $value);
        $allowed['decimals'][$canonical] = true;
        if ((float) (int) $value === (float) $value) {
            $allowed['integers'][(string) abs((int) $value)] = true;
        }
        return;
    }
    if (is_string($value)) {
        preg_match_all('/\d+(?:[.,]\d+)*/u', $value, $matches);
        foreach ($matches[0] ?? [] as $token) {
            $normalized = ya_chat_report_decimal_token((string) $token);
            if ($normalized !== null) {
                $allowed['decimals'][$normalized] = true;
            }
            if (preg_match('/^\d+$/', (string) $token) === 1) {
                $allowed['integers'][ltrim((string) $token, '0') ?: '0'] = true;
            }
        }
        return;
    }
    if (is_array($value)) {
        foreach ($value as $nested) {
            ya_chat_collect_report_numbers($nested, $allowed);
        }
    }
}

function ya_chat_report_number_allowed(string $token, array $allowed): bool
{
    foreach (ya_chat_report_number_candidates($token) as $candidate) {
        if (isset($allowed['decimals'][$candidate])) {
            return true;
        }
    }
    return false;
}

function ya_chat_report_number_candidates(string $value): array
{
    $token = trim($value);
    $sign = str_starts_with($token, '-') ? -1 : 1;
    $unsigned = preg_replace('/^[+-]/', '', $token) ?: '';
    $candidates = [];
    $add = static function (string $normalized) use (&$candidates, $sign): void {
        if (!is_numeric($normalized)) {
            return;
        }
        $candidate = ya_chat_report_decimal((float) $normalized * $sign);
        $candidates[$candidate] = true;
    };

    if (preg_match('/^\d+$/', $unsigned) === 1) {
        $add($unsigned);
        return array_keys($candidates);
    }
    if (preg_match('/^\d{1,3}([.,])\d{3}(?:\1\d{3})*$/', $unsigned) === 1) {
        $add((string) preg_replace('/[.,]/', '', $unsigned));
    }

    $lastDot = strrpos($unsigned, '.');
    $lastComma = strrpos($unsigned, ',');
    if ($lastDot !== false && $lastComma !== false) {
        $decimalSeparator = $lastDot > $lastComma ? '.' : ',';
        $groupingSeparator = $decimalSeparator === '.' ? ',' : '.';
        $decimalIndex = strrpos($unsigned, $decimalSeparator);
        $integerPart = substr($unsigned, 0, (int) $decimalIndex);
        $fractionPart = substr($unsigned, (int) $decimalIndex + 1);
        $groupPattern = $groupingSeparator === '.'
            ? '/^\d{1,3}(?:\.\d{3})*$/'
            : '/^\d{1,3}(?:,\d{3})*$/';
        if (preg_match($groupPattern, $integerPart) === 1 && preg_match('/^\d+$/', $fractionPart) === 1) {
            $add(str_replace($groupingSeparator, '', $integerPart) . '.' . $fractionPart);
        }
    } else {
        $normalized = ya_chat_report_decimal_token($unsigned);
        if ($normalized !== null) {
            $add($normalized);
        }
    }
    return array_keys($candidates);
}

function ya_chat_report_decimal_token(string $value): ?string
{
    if (preg_match('/^\d+(?:[.,]\d+)?$/', $value) !== 1) {
        return null;
    }
    return ya_chat_report_decimal((float) str_replace(',', '.', $value));
}

function ya_chat_report_decimal(float $value): string
{
    return rtrim(rtrim(number_format(round($value, 3), 3, '.', ''), '0'), '.') ?: '0';
}

function ya_chat_generate_reply(array $businessConfig, array $aiConfig, array $payload, string $message, array $knowledgeDocuments, array $businessContext, array $catalogContext): array
{
    $enabled = ya_chat_bool($aiConfig['enabled'] ?? false);
    $provider = ya_chat_string($aiConfig['provider'] ?? 'disabled') ?: 'disabled';
    $responseLanguage = ($payload['response_language'] ?? null) === 'en' ? 'en' : 'tr';
    $requestType = ya_chat_normalize_request_type(ya_chat_first_string($payload, ['request_type', 'requestType']));
    if ($requestType === '') {
        $requestType = ya_chat_detect_request_type($message);
    }
    $decision = ya_business_ai_evaluate($businessContext['capability_ids'] ?? [], $requestType, $message, array_column($catalogContext, 'source'));
    if (in_array($decision['kind'], ['unsupported', 'unrecognized'], true)) {
        $unsupportedDomain = $decision['domain'] ?? '';
        $boundaryAnswer = ya_chat_unsupported_business_answer($unsupportedDomain, $responseLanguage);
        return [
            'answer' => $boundaryAnswer,
            'fallback' => true,
            'provider' => $provider,
            'model' => '',
            'error' => ya_chat_error(
                $decision['kind'] === 'unsupported' ? 'unsupported_business_domain' : 'unrecognized_business_intent',
                $boundaryAnswer,
                false
            )
        ];
    }

    if (!$enabled) {
        return ya_chat_fallback_result('disabled', '', ya_chat_error(
            'ai_disabled',
            'AI bağlantısı işletme ayarlarında kapalı.',
            false
        ), $businessConfig, $businessContext, $catalogContext, $message, $responseLanguage);
    }

    if ($provider !== 'openai_compatible') {
        return ya_chat_fallback_result($provider, '', ya_chat_error(
            'unsupported_provider',
            'Seçili AI sağlayıcısı web sohbeti tarafından desteklenmiyor.',
            false
        ), $businessConfig, $businessContext, $catalogContext, $message, $responseLanguage);
    }

    $baseUrl = ya_chat_string($aiConfig['base_url'] ?? '');
    $model = ya_chat_string($aiConfig['model'] ?? '');
    $apiKey = ya_chat_string($aiConfig['api_key'] ?? '');
    $service = ya_chat_string($aiConfig['service'] ?? 'custom');

    if ($baseUrl === '' || $model === '' || $apiKey === '') {
        return ya_chat_fallback_result('openai_compatible', $model, ya_chat_error(
            'configuration_incomplete',
            'AI bağlantı adresi, model veya erişim anahtarı ayarlarından biri eksik.',
            false
        ), $businessConfig, $businessContext, $catalogContext, $message, $responseLanguage);
    }

    $chatOptions = [
        'base_url' => $baseUrl,
        'model' => $model,
        'api_key' => $apiKey,
        'timeout_seconds' => ya_chat_int($aiConfig['timeout_seconds'] ?? 15, 15),
        'messages' => ya_chat_build_messages($businessConfig, $payload, $message, $knowledgeDocuments, $businessContext, $catalogContext)
    ];
    $chatResult = $service === 'gemini'
        ? ya_chat_call_google_ai_studio($chatOptions)
        : ($service === 'cloudflare' ? ya_cloudflare_chat($chatOptions) : ya_chat_call_openai_compatible($chatOptions));

    if (!$chatResult['ok']) {
        return ya_chat_fallback_result('openai_compatible', $model, $chatResult['error'], $businessConfig, $businessContext, $catalogContext, $message, $responseLanguage);
    }

    return [
        'answer' => $chatResult['answer'],
        'fallback' => false,
        'provider' => 'openai_compatible',
        'model' => $model,
        'error' => null
    ];
}

function ya_chat_build_messages(array $businessConfig, array $payload, string $message, array $knowledgeDocuments, array $businessContext, array $catalogContext): array
{
    $history = $payload['history'] ?? [];
    $messages = [
        [
            'role' => 'system',
            'content' => ya_chat_build_system_prompt($businessConfig, $knowledgeDocuments, $businessContext, $catalogContext, ($payload['response_language'] ?? null) === 'en' ? 'en' : 'tr')
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

function ya_chat_build_system_prompt(array $businessConfig, array $knowledgeDocuments, array $businessContext, array $catalogContext, string $responseLanguage = 'tr'): string
{
    $businessName = ya_chat_string(
        $businessContext['business_name']
            ?? $businessConfig['display_name']
            ?? $businessConfig['name']
            ?? 'İşletme'
    );
    $knowledge = [];
    foreach ($knowledgeDocuments as $document) {
        $knowledge[] = '## ' . $document['title'] . "\n" . $document['content'];
    }
    $currentContext = ya_chat_business_context_text($businessContext);
    $catalogText = ya_chat_catalog_context_text($catalogContext);

    return implode("\n", [
        $businessName . ' için web sitesinde müşteriye yardımcı olan kısa yanıtlı bir asistansın.',
        $responseLanguage === 'en'
            ? 'Reply in English only, clearly and concisely. Do not append a Turkish translation.'
            : 'Türkçe, samimi ve net cevap ver.',
        'Kesin rezervasyon, kesin müsaitlik veya bağlayıcı fiyat onayı verme.',
        'Müsaitlik veya bağlayıcı fiyat sorulursa yalnız mevcut güncel bilgiye dayan; yoksa işletme sahibinin kontrol edip dönüş yapacağını belirt.',
        'Eksik bilgi varsa yalnız kullanıcının sorusu ve mevcut sektör için gerçekten gerekli olan en fazla iki kısa soru sor.',
        'Gerekirse etkin kanallara yönlendir; WhatsApp kapalıysa WhatsApp önermemelisin.',
        'Bilmediğin konuda tahmin yürütme; güncel işletme bağlamında bulunmayan sektör, hizmet, saat veya özellik bilgisini varsayma.',
        'Güncel işletme bağlamı, aşağıdaki ek bilgi dosyalarıyla çelişirse güncel işletme bağlamını esas al.',
        ya_business_ai_authority_prompt($businessContext['capability_ids'] ?? []),
        'Güncel ürün/menü eşleşmeleri verilmişse fiyat ve bulunabilirlik sorularında yalnız bu eşleşmeleri kullan; eşleşme yoksa ürün veya fiyat uydurma.',
        'Katalogda eşleşme olmaması ürünün kesinlikle satılmadığını kanıtlamaz. Eşleşme yoksa yalnız güncel katalogda doğrulayamadığını söyle; işletmenin satmadığı ürün veya ürün kategorileri hakkında çıkarım yapma.',
        '',
        'Güncel işletme bağlamı:',
        $currentContext !== '' ? $currentContext : 'Masaüstünden yayınlanmış güncel işletme bağlamı bulunamadı.',
        '',
        'Güncel ürün/menü eşleşmeleri:',
        $catalogText !== '' ? $catalogText : 'Bu soru için güncel ürün veya menü eşleşmesi bulunamadı.',
        '',
        'Ek bilgi dosyaları:',
        $knowledge === [] ? 'Bu sektör için ek bilgi dosyası bulunamadı.' : implode("\n\n", $knowledge)
    ]);
}

function ya_chat_business_context_text(array $context): string
{
    if ($context === []) {
        return '';
    }

    $lines = [];
    $fields = [
        'profile_label' => 'Sektör',
        'business_name' => 'İşletme adı',
        'phone' => 'Telefon',
        'email' => 'E-posta',
        'address' => 'Adres',
        'description' => 'İşletme açıklaması',
        'directions_note' => 'Ulaşım',
        'policy_note' => 'Politika',
        'payment_note' => 'Ödeme',
        'check_in_time' => 'Giriş saati',
        'check_out_time' => 'Çıkış saati',
        'breakfast_start_time' => 'Kahvaltı başlangıcı',
        'breakfast_end_time' => 'Kahvaltı bitişi'
    ];
    foreach ($fields as $key => $label) {
        $value = ya_chat_string($context[$key] ?? '');
        if ($value !== '') {
            $lines[] = $label . ': ' . $value;
        }
    }

    if (ya_chat_bool($context['whatsapp_enabled'] ?? false)) {
        $whatsapp = ya_chat_string($context['whatsapp'] ?? '');
        if ($whatsapp !== '') {
            $lines[] = 'WhatsApp: ' . $whatsapp;
        }
    }
    $languages = array_values(array_filter(array_map('ya_chat_string', is_array($context['languages'] ?? null) ? $context['languages'] : [])));
    if ($languages !== []) {
        $lines[] = 'Konuşulan diller: ' . implode(', ', $languages);
    }
    $features = array_values(array_filter(array_map('ya_chat_string', is_array($context['features'] ?? null) ? $context['features'] : [])));
    if ($features !== []) {
        $lines[] = 'Sunulan özellikler: ' . implode(', ', $features);
    }
    $capabilityIds = array_values(array_filter(array_map('ya_chat_string', is_array($context['capability_ids'] ?? null) ? $context['capability_ids'] : [])));
    if ($capabilityIds !== []) {
        $lines[] = 'Etkin yetenekler: ' . implode(', ', $capabilityIds);
    }

    return implode("\n", $lines);
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
            'error' => ya_chat_classify_provider_error($response)
        ];
    }

    $data = json_decode($response['body'], true);
    if (!is_array($data)) {
        return [
            'ok' => false,
            'error' => ya_chat_error(
                'provider_invalid_response',
                'AI servisi geçerli bir JSON yanıtı döndürmedi.',
                true
            )
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
            'error' => ya_chat_error(
                'provider_empty_response',
                'AI servisi boş bir yanıt döndürdü.',
                true
            )
        ];
    }

    return [
        'ok' => true,
        'answer' => $answer,
        'error' => null
    ];
}

function ya_chat_call_google_ai_studio(array $options): array
{
    $systemParts = [];
    $contents = [];
    foreach ($options['messages'] as $message) {
        $role = ya_chat_string($message['role'] ?? '');
        $text = ya_chat_string($message['content'] ?? '');
        if ($text === '') {
            continue;
        }
        if (in_array($role, ['system', 'developer'], true)) {
            $systemParts[] = $text;
            continue;
        }
        if (!in_array($role, ['user', 'assistant'], true)) {
            continue;
        }
        $contents[] = [
            'role' => $role === 'assistant' ? 'model' : 'user',
            'parts' => [['text' => $text]]
        ];
    }

    $requestBody = ['contents' => $contents];
    if ($systemParts !== []) {
        $requestBody['systemInstruction'] = [
            'parts' => [['text' => implode("\n\n", $systemParts)]]
        ];
    }

    $response = ya_chat_post_json(
        ya_chat_google_generate_content_url($options['base_url'], $options['model']),
        $requestBody,
        [
            'x-goog-api-key: ' . $options['api_key'],
            'Content-Type: application/json'
        ],
        max(1, ya_chat_int($options['timeout_seconds'] ?? 15, 15))
    );

    if (!$response['ok']) {
        return [
            'ok' => false,
            'error' => ya_chat_classify_provider_error($response)
        ];
    }

    $data = json_decode($response['body'], true);
    if (!is_array($data)) {
        return [
            'ok' => false,
            'error' => ya_chat_error('provider_invalid_response', 'Google AI Studio geçerli bir JSON yanıtı döndürmedi.', true)
        ];
    }

    $parts = $data['candidates'][0]['content']['parts'] ?? [];
    $answerParts = [];
    if (is_array($parts)) {
        foreach ($parts as $part) {
            if (is_array($part)) {
                $answerParts[] = ya_chat_string($part['text'] ?? '');
            }
        }
    }
    $answer = trim(implode('', $answerParts));
    if ($answer === '') {
        return [
            'ok' => false,
            'error' => ya_chat_error('provider_empty_response', 'Google AI Studio boş bir yanıt döndürdü.', true)
        ];
    }

    return ['ok' => true, 'answer' => $answer, 'error' => null];
}

function ya_chat_post_json(string $url, array $body, array $headers, int $timeoutSeconds): array
{
    $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return [
            'ok' => false,
            'body' => '',
            'status' => 0,
            'network_error' => 0,
            'network_message' => ''
        ];
    }

    if (function_exists('curl_init')) {
        $result = ya_chat_curl_post_json($url, $json, $headers, $timeoutSeconds, null);
        if (ya_chat_is_google_api_url($url)
            && defined('CURL_IPRESOLVE_V4')
            && ya_chat_should_retry_google_over_ipv4($result)) {
            $ipv4Result = ya_chat_curl_post_json($url, $json, $headers, $timeoutSeconds, CURL_IPRESOLVE_V4);
            if ($ipv4Result['ok'] || (int) $ipv4Result['status'] > 0) {
                return $ipv4Result;
            }
        }
        return $result;
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
        'body' => is_string($bodyText) ? $bodyText : '',
        'status' => $status,
        'network_error' => $bodyText === false ? 1 : 0,
        'network_message' => ''
    ];
}

function ya_chat_curl_post_json(string $url, string $json, array $headers, int $timeoutSeconds, ?int $ipResolve): array
{
    $handle = curl_init($url);
    if ($handle === false) {
        return [
            'ok' => false,
            'body' => '',
            'status' => 0,
            'network_error' => 1,
            'network_message' => 'curl_init_failed'
        ];
    }
    $options = [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $json,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeoutSeconds
    ];
    if ($ipResolve !== null) {
        $options[CURLOPT_IPRESOLVE] = $ipResolve;
    }
    curl_setopt_array($handle, $options);
    $bodyText = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    $curlErrorNumber = curl_errno($handle);
    $curlError = curl_error($handle);
    curl_close($handle);

    return [
        'ok' => is_string($bodyText) && $status >= 200 && $status < 300,
        'body' => is_string($bodyText) ? $bodyText : '',
        'status' => $status,
        'network_error' => $curlErrorNumber,
        'network_message' => $curlError
    ];
}

function ya_chat_is_google_api_url(string $url): bool
{
    return strtolower((string) parse_url($url, PHP_URL_HOST)) === 'generativelanguage.googleapis.com';
}

function ya_chat_should_retry_google_over_ipv4(array $response): bool
{
    if ((int) ($response['status'] ?? 0) === 0 || (int) ($response['network_error'] ?? 0) !== 0) {
        return true;
    }
    if ((int) ($response['status'] ?? 0) !== 400) {
        return false;
    }
    $payload = json_decode((string) ($response['body'] ?? ''), true);
    $error = is_array($payload) && is_array($payload['error'] ?? null) ? $payload['error'] : [];
    $providerStatus = strtoupper(ya_chat_string($error['status'] ?? ''));
    $providerMessage = strtolower(ya_chat_string($error['message'] ?? ''));
    return $providerStatus === 'FAILED_PRECONDITION'
        && (str_contains($providerMessage, 'location is not supported')
            || str_contains($providerMessage, 'free tier is not available')
            || str_contains($providerMessage, 'not supported in your country'));
}

function ya_chat_classify_provider_error(array $response): array
{
    $status = (int) ($response['status'] ?? 0);
    $networkError = (int) ($response['network_error'] ?? 0);
    $networkMessage = strtolower((string) ($response['network_message'] ?? ''));

    if ($status === 429) {
        return ya_chat_error(
            'provider_rate_limited',
            'AI servisi istek sınırına ulaştı. Lütfen birkaç dakika sonra yeniden deneyin.',
            true,
            429
        );
    }

    if (in_array($status, [401, 403], true)) {
        return ya_chat_error(
            'provider_authentication_failed',
            'AI servisi erişim anahtarını kabul etmedi. İşletme AI ayarları kontrol edilmeli.',
            false,
            $status
        );
    }

    if ($status === 404) {
        return ya_chat_error(
            'provider_model_or_endpoint_not_found',
            'AI servis adresi veya seçili model bulunamadı. İşletme AI ayarları kontrol edilmeli.',
            false,
            404
        );
    }

    if (in_array($status, [408, 504], true) || str_contains($networkMessage, 'timed out')) {
        return ya_chat_error(
            'provider_timeout',
            'AI servisi zamanında yanıt vermedi. Lütfen kısa süre sonra yeniden deneyin.',
            true,
            $status
        );
    }

    if ($status >= 500) {
        return ya_chat_error(
            'provider_unavailable',
            'AI sağlayıcısında geçici bir servis sorunu var. Lütfen daha sonra yeniden deneyin.',
            true,
            $status
        );
    }

    if ($status === 0 || $networkError !== 0) {
        return ya_chat_error(
            'provider_connection_failed',
            'AI sağlayıcısına ağ bağlantısı kurulamadı. Sunucu bağlantısı kontrol edilmeli.',
            true
        );
    }

    return ya_chat_error(
        'provider_request_failed',
        'AI sağlayıcısı isteği kabul etmedi. İşletme AI ayarları ve servis durumu kontrol edilmeli.',
        $status >= 500,
        $status
    );
}

function ya_chat_error(string $code, string $message, bool $retryable, int $httpStatus = 0): array
{
    return [
        'code' => $code,
        'message' => $message,
        'retryable' => $retryable,
        'provider_status' => $httpStatus > 0 ? $httpStatus : null
    ];
}

function ya_chat_fallback_result(
    string $provider,
    string $model,
    array $error,
    array $businessConfig = [],
    array $businessContext = [],
    array $catalogContext = [],
    string $message = '',
    string $responseLanguage = 'tr'
): array {
    return [
        'answer' => ya_chat_fallback_answer(
            (string) ($error['message'] ?? ''),
            $businessConfig,
            $businessContext,
            $catalogContext,
            $message,
            $responseLanguage
        ),
        'fallback' => true,
        'provider' => $provider,
        'model' => $model,
        'error' => $error
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

function ya_chat_google_generate_content_url(string $baseUrl, string $model): string
{
    $apiBaseUrl = preg_replace('#/openai/?$#', '', rtrim($baseUrl, '/'));
    return rtrim((string) $apiBaseUrl, '/') . '/models/' . rawurlencode(preg_replace('#^models/#', '', trim($model))) . ':generateContent';
}

function ya_chat_merge_business_context(array $config, array $context): array
{
    $fieldMap = [
        'business_name' => 'display_name',
        'profile_id' => 'profile_id',
        'phone' => 'phone',
        'whatsapp' => 'whatsapp',
        'email' => 'email',
        'address' => 'address'
    ];
    foreach ($fieldMap as $contextKey => $configKey) {
        if (array_key_exists($contextKey, $context)) {
            $config[$configKey] = ya_chat_string($context[$contextKey]);
        }
    }
    return $config;
}

function ya_chat_catalog_context_text(array $items): string
{
    $lines = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $name = ya_chat_string($item['name'] ?? '');
        if ($name === '') {
            continue;
        }
        $parts = [$name];
        $category = ya_chat_string($item['category'] ?? '');
        $brand = ya_chat_string($item['brand'] ?? '');
        if ($brand !== '') $parts[] = 'marka: ' . $brand;
        if ($category !== '') $parts[] = 'kategori: ' . $category;
        if (is_numeric($item['price'] ?? null)) {
            $price = (float) $item['price'];
            $currency = ya_chat_string($item['currency'] ?? 'TRY') ?: 'TRY';
            $parts[] = 'fiyat: ' . rtrim(rtrim(number_format($price, 2, '.', ''), '0'), '.') . ' ' . $currency;
        }
        $parts[] = ($item['available'] ?? false) === true ? 'durum: mevcut' : 'durum: şu anda mevcut değil';
        $description = ya_chat_string($item['description'] ?? '');
        if ($description !== '') $parts[] = 'açıklama: ' . mb_substr($description, 0, 240);
        $lines[] = '- ' . implode(' | ', $parts);
    }
    return implode("\n", $lines);
}

function ya_chat_load_ai_catalog(): array
{
    try {
        $catalog = ya_storage_get_publication('ai_catalog', []);
        unset($catalog['_publication']);
        return is_array($catalog) ? $catalog : [];
    } catch (Throwable) {
        return [];
    }
}

function ya_chat_find_catalog_matches(array $catalog, string $query, int $limit): array
{
    $items = is_array($catalog['items'] ?? null) ? $catalog['items'] : [];
    if ($items === []) {
        return [];
    }

    $normalizedQuery = ya_chat_catalog_normalize($query);
    if ($normalizedQuery === '') {
        return [];
    }
    $compactQuery = str_replace(' ', '', $normalizedQuery);
    $tokens = array_values(array_filter(
        array_unique(explode(' ', $normalizedQuery)),
        static fn (string $token): bool => mb_strlen($token) >= 2 && !in_array($token, ya_chat_catalog_stop_words(), true)
    ));
    $genericMenu = str_contains($normalizedQuery, 'menu') || str_contains($normalizedQuery, 'menü');

    $scored = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $source = ya_chat_string($item['source'] ?? '');
        $name = ya_chat_catalog_normalize($item['name'] ?? '');
        $brand = ya_chat_catalog_normalize($item['brand'] ?? '');
        $category = ya_chat_catalog_normalize($item['category'] ?? '');
        $description = ya_chat_catalog_normalize($item['description'] ?? '');
        $tags = ya_chat_catalog_normalize(implode(' ', is_array($item['tags'] ?? null) ? $item['tags'] : []));
        $barcode = preg_replace('/\s+/', '', ya_chat_string($item['barcode'] ?? '')) ?: '';
        $score = 0;

        if (preg_match('/^\d{6,18}$/', $compactQuery) === 1 && $barcode === $compactQuery) $score += 100;
        if ($normalizedQuery === $name) $score += 80;
        if (mb_strlen($normalizedQuery) >= 3 && str_contains($name, $normalizedQuery)) $score += 45;
        if (mb_strlen($normalizedQuery) >= 3 && $brand !== '' && str_contains($brand, $normalizedQuery)) $score += 20;

        foreach ($tokens as $token) {
            if ($name === $token) $score += 24;
            elseif (str_contains($name, $token)) $score += 14;
            if ($brand !== '' && str_contains($brand, $token)) $score += 7;
            if ($category !== '' && str_contains($category, $token)) $score += 5;
            if ($description !== '' && str_contains($description, $token)) $score += 3;
            if ($tags !== '' && str_contains($tags, $token)) $score += 3;
            if ($barcode !== '' && $barcode === $token) $score += 100;
        }

        if ($score === 0 && $tokens === [] && $genericMenu && $source === 'menu' && ($item['available'] ?? false) === true) {
            $score = ($item['featured'] ?? false) === true ? 2 : 1;
        } elseif ($score > 0) {
            if (($item['featured'] ?? false) === true) $score += 1;
            if (($item['available'] ?? false) === true) $score += 1;
        }

        if ($score > 0) {
            $scored[] = ['score' => $score, 'item' => $item];
        }
    }

    usort($scored, static function (array $left, array $right): int {
        $scoreOrder = ((int) $right['score']) <=> ((int) $left['score']);
        if ($scoreOrder !== 0) return $scoreOrder;
        return strcasecmp(
            ya_chat_string($left['item']['name'] ?? ''),
            ya_chat_string($right['item']['name'] ?? '')
        );
    });

    return array_values(array_map(
        static fn (array $entry): array => $entry['item'],
        array_slice($scored, 0, max(1, min(20, $limit)))
    ));
}

function ya_chat_catalog_normalize(mixed $value): string
{
    $text = mb_strtolower(ya_chat_string($value), 'UTF-8');
    $text = strtr($text, [
        'ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u'
    ]);
    $text = preg_replace('/[^a-z0-9]+/u', ' ', $text) ?: '';
    return trim(preg_replace('/\s+/', ' ', $text) ?: '');
}

function ya_chat_catalog_stop_words(): array
{
    return [
        'acaba', 'adet', 'bir', 'bu', 'bunu', 'da', 'de', 'fiyat', 'fiyati', 'fiyatlar',
        'icin', 'kac', 'kadar', 'mevcut', 'mi', 'mu', 'nedir', 'ne', 'neler', 'olan',
        'olarak', 'urun', 'urunler', 'var', 'varmi', 've'
    ];
}

function ya_chat_load_business_context(): array
{
    try {
        $context = ya_storage_get_publication('business_context', []);
        unset($context['_publication']);
        return is_array($context) ? $context : [];
    } catch (Throwable) {
        return [];
    }
}

function ya_chat_load_knowledge(string $directory, string $profileId): array
{
    $fileNames = match ($profileId) {
        'pension_restaurant' => ['firma.md', 'odalar.md', 'restoran.md', 'menu.md', 'sik-sorulan-sorular.md'],
        'pension' => ['firma.md', 'odalar.md', 'sik-sorulan-sorular.md'],
        'restaurant' => ['firma.md', 'restoran.md', 'menu.md', 'sik-sorulan-sorular.md'],
        'market' => ['firma.md', 'sik-sorulan-sorular.md'],
        default => ['firma.md', 'sik-sorulan-sorular.md']
    };
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

function ya_chat_fallback_answer(
    string $reason = '',
    array $businessConfig = [],
    array $businessContext = [],
    array $catalogContext = [],
    string $message = '',
    string $responseLanguage = 'tr'
): string {
    $normalized = ya_chat_catalog_normalize($message);

    if ($catalogContext !== []) {
        $item = $catalogContext[0] ?? null;
        if (is_array($item)) {
            $name = ya_chat_string($item['name'] ?? '');
            $available = ($item['available'] ?? false) === true;
            $price = is_numeric($item['price'] ?? null) ? (float) $item['price'] : null;
            $currency = ya_chat_string($item['currency'] ?? 'TRY') ?: 'TRY';
            if ($name !== '') {
                $parts = [$responseLanguage === 'en'
                    ? ($available ? $name . ' appears to be available.' : $name . ' does not appear to be available.')
                    : ($available ? $name . ' şu anda mevcut görünüyor.' : $name . ' şu anda mevcut görünmüyor.')];
                if ($price !== null) {
                    $formattedPrice = rtrim(rtrim(number_format($price, 2, '.', ''), '0'), '.');
                    $parts[] = ($responseLanguage === 'en' ? 'Listed price: ' : 'Kayıtlı satış fiyatı ') . $formattedPrice . ' ' . $currency . '.';
                }
                return implode(' ', $parts);
            }
        }
    }

    $asksPayment = ya_chat_contains_any($normalized, [
        'kart', 'kredi kart', 'banka kart', 'nakit', 'odeme', 'pos', 'temassiz',
        'payment', 'cash', 'credit card', 'debit card'
    ]);
    if ($asksPayment) {
        $payment = ya_chat_string($businessContext['payment_note'] ?? '');
        if ($payment !== '') {
            // Untranslated source notes cannot be represented as a verified English translation.
            return $responseLanguage === 'en'
                ? 'Please contact the business to confirm accepted payment methods.'
                : $payment;
        }
    }

    $asksDirections = ya_chat_contains_any($normalized, [
        'nasil gel', 'adres', 'konum', 'nerede', 'yol', 'tarif', 'ulasim',
        'address', 'location', 'directions', 'how to get', 'where are'
    ]);
    if ($asksDirections) {
        $directions = ya_chat_string($businessContext['directions_note'] ?? '');
        $address = ya_chat_string($businessContext['address'] ?? $businessConfig['address'] ?? '');
        if ($responseLanguage === 'en') {
            // Street address is a proper address, unlike free-form Turkish directions.
            return $address !== '' ? 'Address: ' . $address : 'Please contact the business for directions.';
        }
        if ($directions !== '' && $address !== '') {
            return 'Adres: ' . $address . '. Ulaşım tarifi: ' . $directions;
        }
        if ($directions !== '') {
            return $directions;
        }
        if ($address !== '') {
            return 'Adres: ' . $address;
        }
    }

    if ($responseLanguage === 'en') {
        return 'I cannot confirm that right now. You can send your question to the business for a verified answer.';
    }
    $prefix = trim($reason);
    if ($prefix !== '') {
        $prefix .= ' ';
    }

    return $prefix . 'Mesajınızı işletmeye iletebilirsiniz; işletme sahibi gerekli bilgiyi kontrol edip dönüş yapacaktır.';
}

function ya_chat_extract_request(array $businessConfig, array $businessContext, array $payload, string $message, string $now): array
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
    $decision = ya_business_ai_evaluate($businessContext['capability_ids'] ?? [], $requestType, $message);
    if (in_array($decision['kind'], ['unsupported', 'unrecognized'], true)) {
        // Preserve the customer's message, but do not create an impossible hospitality-domain request.
        $requestType = 'general_info';
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
    foreach (ya_business_ai_mentions('', $text) as $domain) {
        $types = ya_business_ai_policy()['intents'][$domain]['requestTypes'];
        if ($types !== [] && $domain !== 'appointment') return $types[0];
    }
    $normalized = ya_chat_lower($text);

    if (ya_chat_contains_any($normalized, ['adres', 'konum', 'ulaşım', 'ulasim', 'nasıl gel', 'nasil gel'])) {
        return 'location_question';
    }

    if (ya_chat_contains_any($normalized, ['fiyat', 'ücret', 'ucret', 'ne kadar'])) {
        return 'price_question';
    }

    return 'general_info';
}

function ya_chat_unsupported_business_answer(string $domain, string $responseLanguage = 'tr'): string
{
    $rule = ya_business_ai_policy()['domains'][$domain] ?? null;
    if ($responseLanguage === 'en') {
        return !is_array($rule)
            ? 'I cannot verify that this business offers the service you mentioned. Could you clarify your question?'
            : 'That service is not enabled for this business. I can help with other available services.';
    }
    if (!is_array($rule)) return 'Bu hizmetin işletmemiz tarafından sunulduğunu doğrulayamıyorum. Hangi ürün veya hizmet hakkında bilgi istediğinizi netleştirebilir misiniz?';
    return 'Bu işletmede ' . $rule['label'] . ' hizmeti etkin değil. Ürünlerimiz veya sunduğumuz diğer hizmetlerle ilgili başka bir konuda yardımcı olabilirim.';
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
