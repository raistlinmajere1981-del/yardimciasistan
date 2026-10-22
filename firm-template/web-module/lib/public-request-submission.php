<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';

final class YaPublicRequestRejection extends RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $responseCode, string $message)
    {
        parent::__construct($message);
    }
}

/** Normalized user intent only; generated WhatsApp copy, timestamps, IDs and
 * sourcePath are presentation/transport, not identity. Never log this material.
 */
function ya_public_request_intent(array $request, string $businessId): array
{
    $intent = ['business_id' => $businessId];
    foreach (['customer_id', 'source', 'request_type', 'customer_name', 'customer_phone',
        'start_date', 'end_date', 'time', 'message'] as $field) {
        $value = trim(str_replace(["\r\n", "\r"], "\n", (string) ($request[$field] ?? '')));
        $intent[$field] = $field === 'message' ? $value : preg_replace('/\s+/u', ' ', $value);
    }
    // With structured dates, localized date display does not change intent.
    $intent['date_text'] = $intent['start_date'] !== '' ? '' : trim((string) ($request['date_text'] ?? ''));
    foreach (['guest_count', 'adult_count', 'child_count'] as $field) $intent[$field] = (int) ($request[$field] ?? 0);
    $context = $request['context'] ?? [];
    foreach (['resourceType', 'resourceId', 'resourceName'] as $field) $intent['context'][$field] = trim((string) ($context[$field] ?? ''));
    if (($request['request_type'] ?? '') === 'dealer_application') {
        $intent['dealer_application'] = $request['dealer_application'];
        $intent['documents'] = array_map(static function (array $doc): array { unset($doc['id']); return $doc; }, $request['documents'] ?? []);
    }
    return $intent;
}

/** Creation ingress is independent of publication ordering. Queue and exact
 * response receipt commit together under the same SQLite write lock.
 */
function ya_public_request_submit(mixed $key, array $request, array $response, string $businessId, array $uploads = []): array
{
    if (!is_string($key) || preg_match('/^[A-Za-z0-9_-]{16,128}$/D', $key) !== 1) {
        throw new YaPublicRequestRejection(422, 'invalid_idempotency_key', 'Tekrar deneme kimliği gerekli veya geçersiz.');
    }
    $database = ya_storage_open();
    $createdFiles = [];
    $database->exec('BEGIN IMMEDIATE');
    try {
        $secret = $database->query("SELECT value FROM sync_meta WHERE key = 'web_request_receipt_secret'")->fetchColumn();
        if (!is_string($secret) || $secret === '') {
            $secret = bin2hex(random_bytes(32));
            $database->prepare("INSERT INTO sync_meta (key, value) VALUES ('web_request_receipt_secret', ?)")->execute([$secret]);
        }
        $keyHash = hash('sha256', $key);
        $requestHash = hash_hmac('sha256', ya_storage_encode(ya_public_request_intent($request, $businessId)), $secret);
        $lookup = $database->prepare('SELECT request_hash, response_json FROM web_request_submission_receipts WHERE key_hash = ?');
        $lookup->execute([$keyHash]);
        $receipt = $lookup->fetch();
        if (is_array($receipt)) {
            if (!hash_equals($receipt['request_hash'], $requestHash)) {
                throw new YaPublicRequestRejection(409, 'idempotency_conflict', 'Tekrar deneme kimliği farklı bir talep için kullanılmış.');
            }
            $database->exec('COMMIT');
            return ya_storage_decode($receipt['response_json'], []);
        }
        foreach ($uploads as $index => $doc) {
            // Stable private identity also reuses bytes left by a process crash before COMMIT.
            $doc['id'] = substr(hash_hmac('sha256', $keyHash . ':' . $requestHash . ':' . $index, $secret), 0, 32);
            $request['documents'][$index]['id'] = $doc['id'];
            $path = ya_request_document_root() . '/' . $doc['id'];
            if (!is_file($path)) {
                if (!move_uploaded_file($doc['_upload'], $path)) throw new RuntimeException('document_move_failed');
                $createdFiles[] = $path;
            } elseif (filesize($path) !== $doc['size'] || hash_file('sha256', $path) !== $doc['sha256']) {
                throw new RuntimeException('document_integrity_failed');
            }
            if (!chmod($path, 0600)) throw new RuntimeException('document_permissions_failed');
        }
        ya_storage_insert_request($request);
        $database->prepare('INSERT INTO web_request_submission_receipts (key_hash, request_hash, response_json, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$keyHash, $requestHash, ya_storage_encode($response), $request['created_at']]);
        $database->exec('COMMIT');
        return $response;
    } catch (Throwable $error) {
        $database->exec('ROLLBACK');
        foreach ($createdFiles as $path) @unlink($path);
        throw $error;
    }
}
