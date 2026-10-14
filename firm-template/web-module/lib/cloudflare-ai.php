<?php
declare(strict_types=1);

function ya_cloudflare_base_url_supported(string $baseUrl): bool
{
    return preg_match('#^https://api\.cloudflare\.com/client/v4/accounts/[a-fA-F0-9]{32}/ai/?$#D', $baseUrl) === 1;
}

/** Codes precede HTTP status: daily free quota and temporary capacity both return 429. */
function ya_cloudflare_failure_code(int $status, ?array $payload): string
{
    $error = $payload['errors'][0] ?? [];
    $rawCode = is_array($error) ? ($error['code'] ?? '') : '';
    $code = is_string($rawCode) || is_int($rawCode) ? (string) $rawCode : '';
    $known = match ($code) {
        '10000', '10001', '9109', '7003' => 'provider_authentication_failed',
        '5018', '5016', '3023', '3041', '5035' => 'provider_permission_denied',
        '3036' => 'provider_quota_exhausted',
        '3040' => 'provider_busy',
        '3007', '3008' => 'provider_timeout',
        '5007', '3042' => 'provider_model_unavailable',
        default => ''
    };
    if ($known !== '') return $known;
    return match (true) {
        $status === 401 => 'provider_authentication_failed',
        $status === 403 => 'provider_permission_denied',
        $status === 429 => 'provider_rate_limited',
        in_array($status, [408, 504], true) => 'provider_timeout',
        $status === 404 => 'provider_model_unavailable',
        $status >= 500 => 'provider_busy',
        $status === 0 => 'provider_network',
        default => 'provider_invalid_response'
    };
}

function ya_cloudflare_failure_message(string $code): string
{
    return match ($code) {
        'provider_authentication_failed' => 'Cloudflare API Token veya hesap bilgisi kabul edilmedi.',
        'provider_permission_denied' => 'Cloudflare hesabının bu modele erişim izni yok. Token yetkisini ve planı kontrol edin.',
        'provider_quota_exhausted' => 'Cloudflare günlük ücretsiz AI kotası doldu. Kota yenilendiğinde tekrar deneyin.',
        'provider_rate_limited' => 'Cloudflare istek sınırına ulaşıldı. Kısa süre sonra tekrar deneyin.',
        'provider_busy' => 'Cloudflare şu anda yoğun veya geçici olarak kullanılamıyor.',
        'provider_timeout' => 'Cloudflare yanıtı zamanında alınamadı.',
        'provider_network' => 'Cloudflare bağlantısı kurulamadı. İnternet bağlantısını kontrol edin.',
        'provider_model_unavailable' => 'Seçilen Cloudflare modeli bulunamadı veya kullanılamıyor.',
        'provider_configuration_invalid' => 'Cloudflare Account ID, API Token ve model ayarlarını kontrol edin.',
        default => 'Cloudflare yanıtı uygulamanın beklediği biçimde değil.'
    };
}

/** Uses the existing bounded HTTPS transport; no redirect, retry or raw provider errors. */
function ya_cloudflare_chat(array $options, ?callable $transport = null): array
{
    require_once __DIR__ . '/audio-transcription.php';
    $failure = static fn(string $code, int $status = 0): array => ['ok' => false, 'error' => [
        'code' => $code, 'message' => ya_cloudflare_failure_message($code),
        'retryable' => in_array($code, ['provider_busy', 'provider_rate_limited', 'provider_timeout', 'provider_network'], true),
        'provider_status' => $status > 0 ? $status : null
    ]];
    $baseUrl = $options['base_url'] ?? '';
    $key = $options['api_key'] ?? '';
    $model = $options['model'] ?? '';
    if (!is_string($baseUrl) || !ya_cloudflare_base_url_supported($baseUrl)
        || !in_array($model, ['@cf/zai-org/glm-4.7-flash', '@cf/meta/llama-4-scout-17b-16e-instruct'], true)
        || !is_string($key) || $key === '' || strlen($key) > 8192 || preg_match('/[\x00-\x20\x7F]/', $key) === 1) {
        return $failure('provider_configuration_invalid');
    }
    try {
        $timeout = min(120, max(5, (int) ($options['timeout_seconds'] ?? 30)));
        $response = ($transport ?? 'ya_stt_curl')(rtrim($baseUrl, '/') . '/run/' . $model, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode(['messages' => $options['messages'], 'stream' => false], JSON_THROW_ON_ERROR),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $key],
            CURLOPT_CONNECTTIMEOUT => min(10, $timeout), CURLOPT_TIMEOUT => $timeout,
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXREDIRS => 0,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_PROXY => '', CURLOPT_VERBOSE => false
        ]);
        $status = (int) ($response['status'] ?? 0);
        if (($response['limit_exceeded'] ?? false) === true) return $failure('provider_invalid_response');
        if (($response['error'] ?? 0) !== 0) return $failure(($response['error'] ?? 0) === CURLE_OPERATION_TIMEDOUT ? 'provider_timeout' : 'provider_network');
        if (!is_string($response['body'] ?? null) || strlen($response['body']) > YA_STT_MAX_RESPONSE_BYTES) return $failure('provider_invalid_response');
        $payload = json_decode($response['body'], true);
        if ($status !== 200 || (is_array($payload) && ($payload['success'] ?? null) === false)) {
            return $failure(ya_cloudflare_failure_code($status, is_array($payload) ? $payload : null), $status);
        }
        if (!is_array($payload) || ($payload['success'] ?? null) !== true || !is_array($payload['result'] ?? null)) return $failure('provider_invalid_response');
        $result = $payload['result'];
        $choice = $result['choices'][0] ?? [];
        $text = $result['response'] ?? ($choice['message']['content'] ?? null);
        if (!is_string($text) || trim($text) === '' || strlen($text) > 64000
            || !mb_check_encoding($text, 'UTF-8') || (isset($choice['finish_reason']) && $choice['finish_reason'] !== 'stop')) return $failure('provider_invalid_response');
        return ['ok' => true, 'answer' => trim(str_replace($key, '[gizlendi]', $text)), 'error' => null];
    } catch (Throwable) { return $failure('provider_invalid_response'); }
}

/** Existing stock/identity endpoints retain their authorization and result validation. */
function ya_cloudflare_analyze_image(array $config, string $imagePath, string $mimeType, string $prompt, string $instruction, ?callable $transport = null): array
{
    if (($config['vision_model'] ?? '') !== '@cf/meta/llama-4-scout-17b-16e-instruct'
        || !in_array($mimeType, ['image/png', 'image/jpeg', 'image/webp'], true)) {
        return ['ok' => false, 'code' => 'vision_not_supported', 'message' => 'Cloudflare görsel analiz modeli seçilmemiş veya görsel biçimi desteklenmiyor.'];
    }
    $bytes = file_get_contents($imagePath, false, null, 0, 10 * 1024 * 1024 + 1);
    if (!is_string($bytes) || $bytes === '' || strlen($bytes) > 10 * 1024 * 1024) {
        return ['ok' => false, 'code' => 'image_unreadable', 'message' => 'Görsel okunamadı veya boyut sınırını aşıyor.'];
    }
    $result = ya_cloudflare_chat([
        'base_url' => $config['base_url'] ?? '', 'api_key' => $config['api_key'] ?? '',
        'model' => $config['vision_model'], 'timeout_seconds' => $config['timeout_seconds'] ?? 30,
        'messages' => [['role' => 'system', 'content' => $instruction], ['role' => 'user', 'content' => [
            ['type' => 'text', 'text' => $prompt],
            ['type' => 'image_url', 'image_url' => ['url' => 'data:' . $mimeType . ';base64,' . base64_encode($bytes)]]
        ]]]
    ], $transport);
    unset($bytes);
    return $result['ok'] ? $result : ['ok' => false, ...$result['error']];
}
