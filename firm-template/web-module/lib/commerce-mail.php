<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';

/** The caller owns the transaction with its domain write. No network IO here. */
function ya_commerce_mail_enqueue(PDO $db, string $eventId, string $recipient, string $subject, string $body): void
{
    if ($recipient === '' || !filter_var($recipient, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $recipient)
        || $eventId === '' || strlen($eventId) > 240 || strlen($body) > 131072 || strlen($subject) > 500) {
        throw new InvalidArgumentException('invalid_mail_event');
    }
    $id = hash('sha256', $eventId . ':' . strtolower($recipient));
    $hash = hash('sha256', json_encode([$recipient, $subject, $body], JSON_THROW_ON_ERROR));
    $statement = $db->prepare('INSERT INTO commerce_mail_outbox(id, content_hash, recipient, subject, body, next_attempt_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING');
    $statement->execute([$id, $hash, $recipient, $subject, $body, time(), time()]);
    $find = $db->prepare('SELECT content_hash FROM commerce_mail_outbox WHERE id = ?'); $find->execute([$id]);
    if (!hash_equals($hash, (string)$find->fetchColumn())) throw new RuntimeException('mail_event_conflict');
}

/** Stable template for accepted intake; does not claim payment or final fulfillment. */
function ya_commerce_mail_order(PDO $db, string $id, array $request, array $quote): void
{
    $body = "Sipariş talebiniz alındı.\nSipariş referansı: " . $id . "\n\n";
    foreach ($quote['items'] as $line) {
        $body .= $line['name'] . ' × ' . $line['quantity'] . ': ' . number_format($line['line_total_minor'] / 100, 2, '.', '') . ' ' . $quote['currency'] . "\n";
    }
    $body .= "\nÜrünler toplamı: " . number_format($quote['subtotal_minor'] / 100, 2, '.', '') . ' ' . $quote['currency']
        . "\nTeslimat ve ödeme talimatları henüz kesinleşmedi. Bu mesaj ödeme onayı değildir.\n";
    $email = $request['buyer']['email'] ?? '';
    if ($email !== '') ya_commerce_mail_enqueue($db, $id . ':received', $email, 'Sipariş talebiniz alındı', $body);
    $business = getenv('YA_COMMERCE_NOTIFICATION_EMAIL') ?: '';
    if ($business !== '') ya_commerce_mail_enqueue($db, $id . ':business-received', $business, 'Yeni web sipariş talebi', $body);
}

/** Lease under SQLite write lock; SMTP runs outside the transaction.
 * Stable Message-ID and unique event keys deduplicate normal replays. SMTP itself
 * cannot guarantee exactly-once after an ambiguous remote DATA acknowledgement.
 */
function ya_commerce_mail_run(PDO $db, callable $send, int $limit = 20): array
{
    $result = ['sent' => 0, 'retry' => 0, 'failed' => 0];
    for ($index = 0; $index < max(1, min(100, $limit)); $index++) {
        $now = time(); $lease = bin2hex(random_bytes(16));
        $db->exec('BEGIN IMMEDIATE');
        try {
            $find = $db->prepare("SELECT * FROM commerce_mail_outbox WHERE (status = 'pending' AND next_attempt_at <= ?) OR (status = 'sending' AND lease_until <= ?) ORDER BY created_at, id LIMIT 1");
            $find->execute([$now, $now]); $row = $find->fetch();
            if (!$row) { $db->exec('COMMIT'); break; }
            $db->prepare("UPDATE commerce_mail_outbox SET status = 'sending', attempts = attempts + 1, lease_token = ?, lease_until = ? WHERE id = ?")
                ->execute([$lease, $now + 600, $row['id']]);
            $db->exec('COMMIT');
        } catch (Throwable $error) { $db->exec('ROLLBACK'); throw $error; }
        $attempt = (int)$row['attempts'] + 1;
        try {
            $send($row['recipient'], $row['subject'], $row['body'], '<' . $row['id'] . '@yardimci.invalid>');
        } catch (Throwable) {
            $status = $attempt >= 8 ? 'failed' : 'pending';
            $db->prepare('UPDATE commerce_mail_outbox SET status = ?, next_attempt_at = ?, last_error = ?, lease_token = ?, lease_until = 0 WHERE id = ? AND lease_token = ?')
                ->execute([$status, time() + min(21600, 30 * (2 ** min(10, $attempt - 1))), 'transport_failed', '', $row['id'], $lease]);
            $result[$status === 'failed' ? 'failed' : 'retry']++;
            continue;
        }
        // A DB failure after SMTP acceptance remains an uncertain delivery, never
        // relabeled as a transport failure. The expired lease enables recovery.
        $db->prepare("UPDATE commerce_mail_outbox SET status = 'sent', sent_at = ?, last_error = '', lease_token = '', lease_until = 0 WHERE id = ? AND lease_token = ?")
            ->execute([time(), $row['id'], $lease]);
        $result['sent']++;
    }
    return $result;
}
