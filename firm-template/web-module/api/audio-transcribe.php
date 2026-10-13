<?php
declare(strict_types=1);

// Neither parser/provider errors nor request contents belong in PHP logs.
ini_set('display_errors', '0');
ini_set('log_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

require_once dirname(__DIR__) . '/lib/audio-transcription.php';

function ya_stt_cleanup_uploads(): void
{
    $remove = static function (mixed $path) use (&$remove): void {
        if (is_array($path)) { foreach ($path as $item) $remove($item); }
        elseif (is_string($path) && is_uploaded_file($path)) @unlink($path);
    };
    foreach ($_FILES as $upload) {
        if (is_array($upload)) $remove($upload['tmp_name'] ?? null);
    }
}

register_shutdown_function('ya_stt_cleanup_uploads');
$result = ya_stt_failure(500, 'transcription_failed');
try {
    // Reject other verbs before opening tenant storage.
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        $result = ya_stt_failure(405, 'method_not_allowed');
    } else {
        $businessPath = dirname(__DIR__) . '/config/business.json';
        $business = is_file($businessPath) ? json_decode((string) file_get_contents($businessPath), true) : [];
        require_once dirname(__DIR__) . '/lib/android-device-auth.php';
        $result = ya_stt_request_gate($_SERVER, $_POST, is_array($business) ? $business : [], static function (): array {
            $snapshot = ya_android_auth_snapshot();
            return is_array($snapshot['business_capabilities'] ?? null) ? $snapshot['business_capabilities'] : [];
        });
        if ($result === null) {
            $upload = $_FILES['audio'] ?? null;
            if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > YA_STT_MAX_AUDIO_BYTES + 65536
                || (is_array($upload) && in_array($upload['error'] ?? null, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true))) {
                $result = ya_stt_failure(413, 'audio_too_large');
            } elseif (count($_FILES) !== 1 || !is_array($upload) || ($upload['error'] ?? null) !== UPLOAD_ERR_OK
                || !is_string($upload['tmp_name'] ?? null) || !is_uploaded_file($upload['tmp_name'])) {
                $result = ya_stt_failure(422, 'invalid_audio');
            } else {
                $config = require dirname(__DIR__) . '/config/ai.php';
                $result = ya_stt_transcribe(is_array($config) ? $config : [], $upload['tmp_name']);
            }
        }
    }
} catch (Throwable) {
    $result = ya_stt_failure(500, 'transcription_failed');
} finally {
    ya_stt_cleanup_uploads();
}
http_response_code($result['status']);
if ($result['status'] === 405) header('Allow: POST');
echo json_encode($result['payload'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
