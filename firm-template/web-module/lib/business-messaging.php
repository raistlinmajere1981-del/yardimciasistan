<?php
declare(strict_types=1);

/** Secrets are hosting environment values, never publications or business.json fields. */
function ya_messaging_verify_challenge(array $query, string $verifyToken): ?string
{
    // PHP normalizes dots in GET keys to underscores.
    $mode = $query['hub_mode'] ?? $query['hub.mode'] ?? '';
    $token = $query['hub_verify_token'] ?? $query['hub.verify_token'] ?? '';
    $challenge = $query['hub_challenge'] ?? $query['hub.challenge'] ?? '';
    if ($verifyToken === '' || $mode !== 'subscribe' || !is_string($token) || !hash_equals($verifyToken, $token)
        || !is_string($challenge) || !preg_match('/^[\x20-\x7e]{1,256}$/D', $challenge)) return null;
    return $challenge;
}
function ya_messaging_valid_signature(string $body, string $signature, string $appSecret): bool
{
    return $appSecret !== '' && preg_match('/^sha256=[a-f0-9]{64}$/D', $signature) === 1
        && hash_equals('sha256=' . hash_hmac('sha256', $body, $appSecret), $signature);
}
/** Only allowlisted status metadata survives. Inbound conversations and raw payloads are discarded. */
function ya_messaging_statuses(string $body): array
{
    if (strlen($body) > 1048576) throw new RuntimeException('body_too_large');
    $payload = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($payload) || ($payload['object'] ?? '') !== 'whatsapp_business_account' || !is_array($payload['entry'] ?? null)) throw new RuntimeException('invalid_payload');
    $result = [];
    foreach ($payload['entry'] as $entry) {
        if (!is_array($entry)) throw new RuntimeException('invalid_payload');
        $waba = $entry['id'] ?? '';
        if (!is_string($waba) || !preg_match('/^[0-9]{1,40}$/D', $waba)) continue;
        if (!is_array($entry['changes'] ?? null)) continue;
        foreach ($entry['changes'] as $change) {
            if (!is_array($change) || ($change['field'] ?? '') !== 'messages') continue;
            $value = $change['value'] ?? [];
            if (!is_array($value) || !is_array($value['metadata'] ?? null) || !is_array($value['statuses'] ?? [])) continue;
            $phone = $value['metadata']['phone_number_id'] ?? '';
            if (!is_string($phone) || !preg_match('/^[0-9]{1,40}$/D', $phone)) continue;
            foreach ($value['statuses'] ?? [] as $status) {
                if (!is_array($status)) continue;
                $id = $status['id'] ?? ''; $state = $status['status'] ?? ''; $time = $status['timestamp'] ?? '';
                if (!is_string($id) || !preg_match('/^[A-Za-z0-9_.=:-]{1,512}$/D', $id)
                    || !in_array($state, ['accepted', 'sent', 'delivered', 'read', 'failed'], true)
                    || !is_string($time) || !preg_match('/^[0-9]{1,11}$/D', $time) || (int)$time <= 0 || (int)$time > time() + 86400) continue;
                $callback = $status['biz_opaque_callback_data'] ?? '';
                $messageId = is_string($callback) && preg_match('/^business_message_[a-f0-9-]{36}$/D', $callback) ? $callback : '';
                $code = $status['errors'][0]['code'] ?? '';
                $result[] = ['accountKey' => hash('sha256', $waba . ':' . $phone), 'providerMessageId' => $id,
                    'status' => $state === 'sent' ? 'accepted' : $state, 'timestamp' => gmdate('c', (int)$time),
                    'failureCode' => is_int($code) && $code >= 0 ? 'provider_' . $code : '', 'messageId' => $messageId];
                if (count($result) > 1000) throw new RuntimeException('status_limit');
            }
        }
    }
    return $result;
}
function ya_messaging_enqueue(PDO $database, array $statuses): void
{
    $database->beginTransaction();
    try {
        $insert = $database->prepare('INSERT INTO business_messaging_status_queue(event_key, account_key, payload_json, created_at) VALUES(?,?,?,?) ON CONFLICT(event_key) DO NOTHING');
        foreach ($statuses as $status) {
            $json = json_encode($status, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
            // Receipt stays after ACK, so Meta retries cannot enqueue a duplicate.
            $insert->execute([hash('sha256', $json), $status['accountKey'], $json, gmdate('c')]);
        }
        $database->commit();
    } catch (Throwable $error) { if ($database->inTransaction()) $database->rollBack(); throw $error; }
}
function ya_messaging_pull(PDO $database, string $accountKey): array
{
    $statement = $database->prepare('SELECT seq, payload_json FROM business_messaging_status_queue WHERE account_key=? AND acknowledged=0 ORDER BY seq LIMIT 100');
    $statement->execute([$accountKey]);
    return array_map(static function (array $row): array {
        return ['seq' => (int)$row['seq']] + json_decode($row['payload_json'], true, 16, JSON_THROW_ON_ERROR);
    }, $statement->fetchAll());
}
function ya_messaging_ack(PDO $database, string $accountKey, array $ids): void
{
    if (!array_is_list($ids) || count($ids) > 100 || array_filter($ids, static fn($id) => !is_int($id) || $id <= 0)) throw new RuntimeException('invalid_ack');
    $database->beginTransaction();
    try {
        $statement = $database->prepare("UPDATE business_messaging_status_queue SET acknowledged=1, payload_json='{}' WHERE account_key=? AND seq=?");
        foreach ($ids as $id) $statement->execute([$accountKey, $id]);
        $database->commit();
    } catch (Throwable $error) { if ($database->inTransaction()) $database->rollBack(); throw $error; }
}
