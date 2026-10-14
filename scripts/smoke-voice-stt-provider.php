<?php
declare(strict_types=1);
require_once __DIR__ . '/../firm-template/web-module/lib/audio-transcription.php';

function check(bool $ok, string $label): void
{
    if (!$ok) throw new RuntimeException($label);
}
function code_is(array $result, int $status, string $code): void
{
    check($result['status'] === $status && ($result['payload']['code'] ?? '') === $code, $code);
    check(!str_contains(json_encode($result), 'fixture-provider-key'), 'no credential in failure');
}

$root = sys_get_temp_dir() . '/ya-stt-' . bin2hex(random_bytes(8));
mkdir($root, 0700);
$wav = $root . '/private-recording.wav';
$samples = str_repeat("\0", 1600);
$waveBytes = 'RIFF' . pack('V', 36 + strlen($samples)) . 'WAVEfmt ' . pack('VvvVVvv', 16, 1, 1, 8000, 16000, 2, 16)
    . 'data' . pack('V', strlen($samples)) . $samples;
file_put_contents($wav, $waveBytes);
$config = ['enabled' => true, 'provider' => 'openai_compatible', 'service' => 'openai',
    'base_url' => 'https://api.openai.com/v1', 'stt_model' => 'gpt-4o-mini-transcribe',
    'api_key' => 'fixture-provider-key', 'timeout_seconds' => 120];
$transportCalls = 0;
$response = ['status' => 200, 'error' => 0, 'body' => json_encode(['text' => "  Merhaba\0 <b>dünya</b>.  ", 'api_key' => 'fixture-provider-key'])];
$transport = static function (string $url, array $options) use (&$transportCalls, &$response, $wav, $waveBytes): array {
    $transportCalls++;
    check($options[CURLOPT_POST] === true, 'POST provider');
    check($options[CURLOPT_TIMEOUT] <= 60 && $options[CURLOPT_CONNECTTIMEOUT] <= 10, 'bounded timeout');
    check($options[CURLOPT_FOLLOWLOCATION] === false && $options[CURLOPT_MAXREDIRS] === 0, 'no redirects');
    check($options[CURLOPT_PROTOCOLS] === CURLPROTO_HTTPS && $options[CURLOPT_REDIR_PROTOCOLS] === CURLPROTO_HTTPS, 'HTTPS only');
    check($options[CURLOPT_SSL_VERIFYPEER] === true && $options[CURLOPT_SSL_VERIFYHOST] === 2, 'verify TLS');
    check($options[CURLOPT_VERBOSE] === false && $options[CURLOPT_PROXY] === '', 'no diagnostic/proxy forwarding');
    check(!str_contains($url, 'fixture-provider-key') && !str_contains($url, '?'), 'no key in URL');
    if (str_contains($url, 'openai.com')) {
        check($url === 'https://api.openai.com/v1/audio/transcriptions', 'real transcription path');
        check(!isset($options[CURLOPT_IPRESOLVE]), 'OpenAI retains OS-selected networking');
        check(in_array('Authorization: Bearer fixture-provider-key', $options[CURLOPT_HTTPHEADER], true), 'OpenAI auth');
        check(!in_array('Content-Type: application/json', $options[CURLOPT_HTTPHEADER], true), 'curl owns multipart boundary');
        $body = $options[CURLOPT_POSTFIELDS];
        check($body['response_format'] === 'json' && $body['file'] instanceof CURLFile, 'multipart format');
        check($body['file']->getFilename() === $wav && $body['file']->getMimeType() === 'audio/wav', 'file content and MIME');
        check($body['file']->getPostFilename() === 'audio.wav' && count($body) === 3, 'safe filename and no chat payload');
        check(in_array($body['model'], ya_stt_models('openai'), true), 'known OpenAI model');
    } else {
        check(str_starts_with($url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-')
            && str_ends_with($url, ':generateContent'), 'real Gemini path');
        check(($options[CURLOPT_IPRESOLVE] ?? null) === CURL_IPRESOLVE_V4,
            'Gemini uses IPv4 Google API route on Hosting');
        check(in_array('x-goog-api-key: fixture-provider-key', $options[CURLOPT_HTTPHEADER], true), 'Gemini header auth');
        $body = json_decode($options[CURLOPT_POSTFIELDS], true, 32, JSON_THROW_ON_ERROR);
        $inline = $body['contents'][0]['parts'][0]['inline_data'];
        check($inline['mime_type'] === 'audio/wav' && base64_decode($inline['data'], true) === $waveBytes, 'inline audio bytes');
        check(!isset($body['tools']) && $body['generationConfig']['maxOutputTokens'] === 8192, 'text only bounded generation');
    }
    return $response;
};

try {
    $capReads = 0;
    $caps = static function () use (&$capReads): array { $capReads++; return ['service.ai']; };
    $server = ['REQUEST_METHOD' => 'POST', 'HTTP_X_YA_SYNC_SECRET' => 'fixture-sync-secret'];
    $business = ['sync_secret' => 'fixture-sync-secret'];
    check(ya_stt_request_gate($server, ['source' => 'desktop'], $business, $caps) === null, 'desktop authorized');
    code_is(ya_stt_request_gate([...$server, 'REQUEST_METHOD' => 'GET'], [], $business, $caps), 405, 'method_not_allowed');
    code_is(ya_stt_request_gate([...$server, 'HTTP_X_YA_SYNC_SECRET' => 'wrong'], [], $business, $caps), 401, 'unauthorized');
    check($capReads === 1, 'unauthorized requests never read tenant capabilities');
    code_is(ya_stt_request_gate($server, ['source' => 'desktop'], $business, static fn(): array => []), 403, 'ai_capability_disabled');
    foreach ([['source' => 'android'], ['source' => ['desktop']], ['source' => 'desktop', 'model' => 'whisper-1']] as $post) {
        check(ya_stt_request_gate($server, $post, $business, $caps)['status'] >= 400, 'invalid/scope denied');
    }
    code_is(ya_stt_request_gate([...$server, 'HTTP_X_YA_DEVICE_TOKEN' => 'yat_fixture'], ['source' => 'desktop'], $business, $caps), 403, 'android_stt_scope_denied');
    code_is(ya_stt_request_gate([...$server, 'QUERY_STRING' => 'text=private'], ['source' => 'desktop'], $business, $caps), 422, 'invalid_request');
    code_is(ya_stt_request_gate([...$server, 'CONTENT_LENGTH' => YA_STT_MAX_AUDIO_BYTES + 65537], [], $business, $caps), 413, 'audio_too_large');

    code_is(ya_stt_transcribe([...$config, 'enabled' => false], $wav, $transport), 422, 'ai_disabled');
    code_is(ya_stt_transcribe([...$config, 'stt_model' => ''], $wav, $transport), 422, 'stt_not_configured');
    foreach (['gpt-4o', 'gemini-3.5-transcribe', '../chat/completions', null, ['whisper-1']] as $model) {
        code_is(ya_stt_transcribe([...$config, 'stt_model' => $model], $wav, $transport), 422, 'stt_configuration_invalid');
    }
    foreach (['http://api.openai.com/v1', 'https://127.0.0.1/v1', 'https://api.openai.com.evil.test/v1',
        'https://user:pass@api.openai.com/v1', 'https://api.openai.com:443/v1', 'https://api.openai.com/v1?key=test',
        'https://api.openai.com/v1#fragment', 'https://api.openai.com/v1/../v1', 'https://[::1]/v1'] as $url) {
        code_is(ya_stt_transcribe([...$config, 'base_url' => $url], $wav, $transport), 422, 'stt_configuration_invalid');
    }
    foreach (['custom', 'groq', 'openrouter'] as $service) {
        code_is(ya_stt_transcribe([...$config, 'service' => $service], $wav, $transport), 422, 'stt_configuration_invalid');
    }
    foreach (['', "key\r\nInjected: value"] as $key) code_is(ya_stt_transcribe([...$config, 'api_key' => $key], $wav, $transport), 422, 'stt_configuration_invalid');
    foreach ([0, 121, '30'] as $timeout) code_is(ya_stt_transcribe([...$config, 'timeout_seconds' => $timeout], $wav, $transport), 422, 'stt_configuration_invalid');
    file_put_contents($root . '/fake.wav', '<html>Not an audio recording</html>');
    code_is(ya_stt_transcribe($config, $root . '/fake.wav', $transport), 415, 'unsupported_audio_type');
    file_put_contents($root . '/empty', '');
    code_is(ya_stt_transcribe($config, $root . '/empty', $transport), 422, 'invalid_audio');
    code_is(ya_stt_transcribe($config, $root . '/missing', $transport), 422, 'invalid_audio');
    file_put_contents($root . '/large.wav', $waveBytes . str_repeat("\0", YA_STT_MAX_AUDIO_BYTES));
    code_is(ya_stt_transcribe($config, $root . '/large.wav', $transport), 413, 'audio_too_large');
    check($transportCalls === 0, 'all invalid input fails before provider');

    $binding = hash('sha256', json_encode([$config['provider'], $config['service'], $config['base_url'],
        $config['stt_model'], $config['api_key'], $config['timeout_seconds']], JSON_UNESCAPED_SLASHES));
    foreach (['changed', str_repeat('a', 64)] as $wrong) {
        code_is(ya_stt_transcribe($config, $wav, $transport, $wrong), 409, 'stt_configuration_changed');
    }
    foreach (['service' => 'gemini', 'stt_model' => 'whisper-1', 'api_key' => 'changed-fixture-key', 'timeout_seconds' => 30] as $key => $value) {
        check(ya_stt_transcribe([...$config, $key => $value], $wav, $transport, $binding)['status'] >= 400, 'stale config cannot verify');
    }
    check($transportCalls === 0, 'stale test fails before any billed provider request');
    $verified = ya_stt_transcribe($config, $wav, $transport, $binding);
    check($verified['status'] === 200 && $verified['payload']['stt_configuration'] === $binding, 'actual audio response binds saved config');

    foreach (ya_stt_models('openai') as $model) {
        $result = ya_stt_transcribe([...$config, 'stt_model' => $model], $wav, $transport);
        check($result === ['status' => 200, 'payload' => ['ok' => true, 'text' => 'Merhaba dünya.']], 'clean editable text only');
    }
    foreach ([
        ['status' => 429, 'error' => 0, 'body' => '{"error":{"message":"fixture-provider-key"}}'],
        ['status' => 200, 'error' => 0, 'body' => 'malformed fixture-provider-key'],
        ['status' => 200, 'error' => 0, 'body' => json_encode(['text' => ['bad']])],
        ['status' => 200, 'error' => 0, 'body' => json_encode(['text' => str_repeat('x', YA_STT_MAX_TEXT_CHARS + 1)])],
        ['status' => 200, 'error' => 0, 'body' => str_repeat('x', YA_STT_MAX_RESPONSE_BYTES + 1)],
        ['status' => 200, 'error' => 0, 'body' => "{\"text\":\"\xff\"}"],
        ['status' => 302, 'error' => 0, 'body' => 'redirect fixture-provider-key'],
        ['status' => 0, 'error' => CURLE_COULDNT_CONNECT, 'body' => 'fixture-provider-key']
    ] as $response) code_is(ya_stt_transcribe($config, $wav, $transport), 502, 'provider_failed');
    $response = ['status' => 0, 'error' => CURLE_OPERATION_TIMEDOUT, 'body' => ''];
    code_is(ya_stt_transcribe($config, $wav, $transport), 504, 'provider_timeout');
    code_is(ya_stt_transcribe($config, $wav, static function (): never { throw new RuntimeException('fixture-provider-key'); }), 502, 'provider_failed');
    $response = ['status' => 200, 'error' => 0, 'body' => json_encode(['text' => 'fixture-provider-key'])];
    check(ya_stt_transcribe($config, $wav, $transport)['payload']['text'] === '[gizlendi]', 'no key echo in transcript');
    $response['body'] = '{"text":""}';
    check(ya_stt_transcribe($config, $wav, $transport)['payload']['text'] === '', 'silence allowed');

    $gemini = [...$config, 'service' => 'gemini', 'base_url' => 'https://generativelanguage.googleapis.com/v1beta', 'stt_model' => 'gemini-3.6-flash'];
    $candidate = ['finishReason' => 'STOP', 'content' => ['parts' => [['thought' => true, 'text' => 'private reasoning'], ['text' => 'Ses '], ['text' => 'metni.']]]];
    $response['body'] = json_encode(['candidates' => [$candidate], 'usageMetadata' => ['secret' => 'fixture-provider-key']]);
    check(ya_stt_transcribe($gemini, $wav, $transport)['payload'] === ['ok' => true, 'text' => 'Ses metni.'], 'Gemini joins final text without thought/metadata');
    foreach ([['finishReason' => 'MAX_TOKENS'], ['finishReason' => 'SAFETY'], ['content' => ['parts' => []]], ['content' => ['parts' => [['functionCall' => ['name' => 'execute']]]]]] as $patch) {
        $response['body'] = json_encode(['candidates' => [array_replace($candidate, $patch)]]);
        code_is(ya_stt_transcribe($gemini, $wav, $transport), 502, 'provider_failed');
    }
    $cloudflare = [...$config, 'service' => 'cloudflare',
        'base_url' => 'https://api.cloudflare.com/client/v4/accounts/' . str_repeat('a', 32) . '/ai',
        'stt_model' => '@cf/openai/whisper-large-v3-turbo'];
    $cloudflareResponse = ['status' => 200, 'error' => 0, 'body' => json_encode(['success' => true, 'result' => ['text' => 'Türkçe konuşma.']])];
    $cloudflareCalls = 0;
    $cloudflareTransport = static function (string $url, array $options) use (&$cloudflareCalls, &$cloudflareResponse, $cloudflare, $waveBytes): array {
        $cloudflareCalls++;
        check($url === $cloudflare['base_url'] . '/run/@cf/openai/whisper-large-v3-turbo', 'Cloudflare native STT path');
        check($options[CURLOPT_FOLLOWLOCATION] === false && $options[CURLOPT_SSL_VERIFYPEER] === true, 'Cloudflare TLS/no redirects');
        check($options[CURLOPT_TIMEOUT] <= 60 && $options[CURLOPT_PROXY] === '', 'Cloudflare bounded/no proxy');
        check(in_array('Authorization: Bearer fixture-provider-key', $options[CURLOPT_HTTPHEADER], true), 'Cloudflare header token');
        $body = json_decode($options[CURLOPT_POSTFIELDS], true, 32, JSON_THROW_ON_ERROR);
        check(base64_decode($body['audio'], true) === $waveBytes, 'Cloudflare audio bytes intact');
        check($body['task'] === 'transcribe' && $body['language'] === 'tr', 'Turkish transcription, no translation');
        return $cloudflareResponse;
    };
    foreach ([$cloudflare['base_url'] . '?x=1', str_replace('https:', 'http:', $cloudflare['base_url']),
        str_replace('.com/', '.com:443/', $cloudflare['base_url']), str_replace('/ai', '/ai/../ai', $cloudflare['base_url'])] as $unsafe) {
        code_is(ya_stt_transcribe([...$cloudflare, 'base_url' => $unsafe], $wav, $cloudflareTransport), 422, 'stt_configuration_invalid');
    }
    check($cloudflareCalls === 0, 'unsafe Cloudflare roots fail before transport');
    $cfBinding = hash('sha256', json_encode([$cloudflare['provider'], $cloudflare['service'], $cloudflare['base_url'],
        $cloudflare['stt_model'], $cloudflare['api_key'], $cloudflare['timeout_seconds']], JSON_UNESCAPED_SLASHES));
    $cfResult = ya_stt_transcribe($cloudflare, $wav, $cloudflareTransport, $cfBinding);
    check($cfResult['payload']['text'] === 'Türkçe konuşma.' && $cfResult['payload']['stt_configuration'] === $cfBinding, 'Cloudflare actual audio evidence');
    foreach ([[401, 10000, 'provider_authentication_failed'], [403, 5018, 'provider_permission_denied'],
        [403, 5035, 'provider_permission_denied'], [429, 3036, 'provider_quota_exhausted'],
        [429, 3040, 'provider_busy'], [429, 0, 'provider_rate_limited'], [400, 5007, 'provider_model_unavailable']] as [$status, $code, $expected]) {
        $cloudflareResponse = ['status' => $status, 'error' => 0, 'body' => json_encode(['success' => false,
            'errors' => [['code' => $code, 'message' => 'fixture-provider-key private transcript']]])];
        code_is(ya_stt_transcribe($cloudflare, $wav, $cloudflareTransport), 502, $expected);
        $chat = ya_cloudflare_chat(['base_url' => $cloudflare['base_url'], 'model' => '@cf/zai-org/glm-4.7-flash',
            'api_key' => $cloudflare['api_key'], 'messages' => [['role' => 'user', 'content' => 'Merhaba']]],
            static fn(): array => $cloudflareResponse);
        check($chat['error']['code'] === $expected && !str_contains(json_encode($chat), 'fixture-provider-key'), 'Cloudflare chat/STT diagnostics parity');
    }
    foreach (['bad JSON', '{}', '{"success":true,"result":{}}', '{"success":false}', str_repeat('x', YA_STT_MAX_RESPONSE_BYTES + 1)] as $bad) {
        $cloudflareResponse = ['status' => 200, 'error' => 0, 'body' => $bad];
        code_is(ya_stt_transcribe($cloudflare, $wav, $cloudflareTransport), 502, 'provider_invalid_response');
    }
    $cloudflareResponse = ['status' => 200, 'error' => CURLE_WRITE_ERROR, 'body' => '', 'limit_exceeded' => true];
    code_is(ya_stt_transcribe($cloudflare, $wav, $cloudflareTransport), 502, 'provider_invalid_response');
    foreach ([CURLE_COULDNT_CONNECT => 'provider_network', CURLE_OPERATION_TIMEDOUT => 'provider_timeout'] as $curlError => $expected) {
        $cloudflareResponse = ['status' => 0, 'error' => $curlError, 'body' => 'fixture-provider-key'];
        code_is(ya_stt_transcribe($cloudflare, $wav, $cloudflareTransport), $curlError === CURLE_OPERATION_TIMEDOUT ? 504 : 502, $expected);
    }
    foreach ([['response' => 'Merhaba'], ['choices' => [['message' => ['content' => 'Merhaba'], 'finish_reason' => 'stop']]]] as $result) {
        $chat = ya_cloudflare_chat(['base_url' => $cloudflare['base_url'], 'model' => '@cf/zai-org/glm-4.7-flash',
            'api_key' => $cloudflare['api_key'], 'messages' => [['role' => 'user', 'content' => 'Merhaba']]],
            static function (string $url, array $options) use ($result): array {
                check(str_ends_with($url, '/run/@cf/zai-org/glm-4.7-flash'), 'Hosting native text endpoint');
                check(json_decode($options[CURLOPT_POSTFIELDS], true)['stream'] === false, 'bounded non-stream text');
                return ['status' => 200, 'error' => 0, 'body' => json_encode(['success' => true, 'result' => $result])];
            });
        check($chat['ok'] === true && $chat['answer'] === 'Merhaba', 'Hosting GLM/Scout text envelope');
    }
    require_once __DIR__ . '/../firm-template/web-module/lib/stock-image-analysis.php';
    $visionConfig = [...$cloudflare, 'model' => '@cf/zai-org/glm-4.7-flash', 'vision_model' => '@cf/meta/llama-4-scout-17b-16e-instruct'];
    $image = $root . '/vision.png';
    $imageBytes = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
    file_put_contents($image, $imageBytes);
    $stockAnalyzer = ya_stock_image_create_analyzer($visionConfig);
    check($stockAnalyzer instanceof YaCloudflareVisionStockAnalyzer && $stockAnalyzer->supports($visionConfig), 'Cloudflare separate vision analyzer');
    check(!$stockAnalyzer->supports([...$visionConfig, 'vision_model' => '']), 'text does not imply vision');
    $vision = ya_cloudflare_analyze_image($visionConfig, $image, 'image/png', 'Oku', 'JSON döndür.',
        static function (string $url, array $options) use ($imageBytes): array {
            check(str_ends_with($url, '/run/@cf/meta/llama-4-scout-17b-16e-instruct'), 'vision never uses GLM text model');
            $body = json_decode($options[CURLOPT_POSTFIELDS], true);
            check(base64_decode(explode(',', $body['messages'][1]['content'][1]['image_url']['url'], 2)[1], true) === $imageBytes, 'vision inline bytes intact');
            return ['status' => 200, 'error' => 0, 'body' => json_encode(['success' => true, 'result' => ['response' => '{"lines":[]}']])];
        });
    check($vision['ok'] === true && json_decode($vision['answer'], true) === ['lines' => []], 'vision output goes to existing analysis decoder');
    check(ya_cloudflare_analyze_image([...$visionConfig, 'vision_model' => ''], $image, 'image/png', 'Oku', 'JSON')['code'] === 'vision_not_supported', 'vision explicit OFF');
    echo "voice-stt-provider-smoke-ok: provider formats, gates, size, MIME, HTTPS, bounded errors and credential privacy\n";
} finally {
    foreach (glob($root . '/*') ?: [] as $file) unlink($file);
    rmdir($root);
}
