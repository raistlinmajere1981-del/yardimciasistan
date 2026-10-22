<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';

function ya_dealer_application_enabled(): bool
{
    $context = ya_storage_get_publication('business_context', []);
    $access = ya_storage_get_publication('dealer_access_private', []);
    $snapshot = ya_storage_get_publication('android_snapshot', []);
    $caps = $snapshot['business_capabilities'] ?? [];
    return ($context['dealerApplicationEnabled'] ?? false) === true && ($access['enabled'] ?? false) === true
        && is_array($caps) && in_array('commerce.wholesale', $caps, true) && in_array('customer.requests', $caps, true);
}

/** Outside the HTTP document root; bytes are served only by authenticated sync. */
function ya_request_document_root(): string
{
    $webRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: realpath(YA_STORAGE_BASE_DIR);
    $root = dirname($webRoot) . '/.ya-request-documents-' . substr(hash('sha256', (string)realpath(YA_STORAGE_BASE_DIR)), 0, 24);
    if (!is_dir($root) && !mkdir($root, 0700, true) && !is_dir($root)) throw new RuntimeException('document_storage_unavailable');
    if (str_starts_with((string)realpath($root) . '/', rtrim($webRoot, '/') . '/')) throw new RuntimeException('document_root_must_be_private');
    if (!chmod($root, 0700)) throw new RuntimeException('document_storage_permissions');
    return $root;
}

/** PHP upload errors, actual MIME/signature and limits are checked before any queue write. */
function ya_request_document_uploads(array $files, mixed $kinds): array
{
    if ($files === [] && $kinds === []) return [];
    if (!is_array($kinds) || !is_array($files['name'] ?? null) || count($files['name']) > 5 || count($files['name']) !== count($kinds)) {
        throw new InvalidArgumentException('En fazla 5 belge ekleyin.');
    }
    $result = []; $mime = new finfo(FILEINFO_MIME_TYPE);
    foreach ($files['name'] as $index => $name) {
        $path = $files['tmp_name'][$index] ?? '';
        if (($files['error'][$index] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($path)) throw new InvalidArgumentException('Belge yüklenemedi. Dosyayı yeniden seçin.');
        $size = filesize($path);
        if ($size < 1 || $size > 10 * 1024 * 1024) throw new InvalidArgumentException('Her belge en fazla 10 MB olabilir.');
        $type = $mime->file($path);
        $extension = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png'][$type] ?? null;
        if (!$extension || ($type !== 'application/pdf' && @getimagesize($path) === false)) throw new InvalidArgumentException('Yalnız PDF, JPG ve PNG belgeleri yüklenebilir.');
        if ($type === 'application/pdf') {
            $handle = fopen($path, 'rb'); $header = fread($handle, 5); fseek($handle, max(0, $size - 1024)); $tail = stream_get_contents($handle); fclose($handle);
            if ($header !== '%PDF-' || !str_contains($tail, '%%EOF')) throw new InvalidArgumentException('PDF belgesi okunamadı.');
        }
        $kind = $kinds[$index];
        if (!in_array($kind, ['tax_certificate', 'activity_certificate', 'authorization', 'other'], true)) throw new InvalidArgumentException('Belge türü geçersiz.');
        $safeName = mb_substr(preg_replace('/[\x00-\x1f\x7f\/\\\\]/u', '_', (string)$name) ?? 'belge', 0, 180);
        $result[] = ['id' => bin2hex(random_bytes(16)), 'name' => $safeName, 'kind' => $kind,
            'mime' => $type, 'size' => $size, 'sha256' => hash_file('sha256', $path), '_upload' => $path, '_extension' => $extension];
    }
    return $result;
}

function ya_request_document_download(array $payload): never
{
    $request = ya_storage_get_request((string)($payload['request_id'] ?? ''));
    foreach ($request['documents'] ?? [] as $doc) {
        if ($doc['id'] !== ($payload['document_id'] ?? '') || !preg_match('/^[a-f0-9]{32}$/D', $doc['id'])) continue;
        $path = ya_request_document_root() . '/' . $doc['id'];
        if (!is_file($path) || filesize($path) !== $doc['size']) break;
        header('Content-Type: ' . $doc['mime']); header('Content-Length: ' . $doc['size']);
        header('Content-Disposition: attachment; filename="document"');
        header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
        readfile($path); exit;
    }
    http_response_code(404); exit;
}
