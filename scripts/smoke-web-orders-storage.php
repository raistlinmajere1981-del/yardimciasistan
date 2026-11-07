<?php
// Standalone behavior check against a fresh current-schema hosting store.
declare(strict_types=1);
$root = sys_get_temp_dir() . '/ya-web-orders-' . bin2hex(random_bytes(8));
mkdir($root . '/lib', 0700, true);
copy(__DIR__ . '/../firm-template/web-module/lib/storage.php', $root . '/lib/storage.php');
copy(__DIR__ . '/../firm-template/web-module/lib/commerce-mail.php', $root . '/lib/commerce-mail.php');
require $root . '/lib/commerce-mail.php';
function expect(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
try {
    $now = date(DATE_ATOM);
    $order = ['id' => 'order-1', 'items' => [['productId' => 'product-1', 'quantity' => 2]], 'buyer' => ['name' => 'Guest', 'phone' => '+1 (202) 555-0100', 'email' => 'guest@example.test'], 'delivery' => ['method' => 'pickup', 'address' => null], 'note' => 'Guest note', 'createdAt' => $now];
    $first = ya_storage_enqueue_web_order($order);
    expect($first['delivery'] === $order['delivery'], 'delivery round-trip');
    $duplicate = ya_storage_enqueue_web_order([...$order, 'items' => []]);
    expect($first['buyer'] === $order['buyer'] && $first['note'] === $order['note'], 'buyer and note round-trip');
    expect($first === $duplicate, 'duplicate id must retain first payload and sequence');
    ya_storage_enqueue_web_order([...$order, 'id' => 'order-2']);
    $pulled = ya_storage_pull_web_orders(1, 0);
    expect(count($pulled['orders']) === 1 && $pulled['has_more'], 'bounded first page');
    expect($pulled['orders'][0]['id'] === 'order-1', 'FIFO order');
    $second = ya_storage_pull_web_orders(200, $pulled['next_cursor']);
    expect(count($second['orders']) === 1 && !$second['has_more'], 'second page');
    expect(ya_storage_pull_web_orders(200, $second['next_cursor'])['orders'] === [], 'end cursor');
    $db = ya_storage_open();
    ya_storage_insert_request(['id' => 'request-1', 'created_at' => $now]);
    ya_storage_acknowledge_web_orders('desktop-storage', 0, $now);
    expect(ya_storage_get_request('request-1')['sync_status'] === 'pending', 'order ack must not consume request');
    ya_storage_acknowledge_requests('desktop-storage', 17, $now);
    $ack = ya_storage_acknowledge_web_orders('desktop-storage', $first['syncSeq'], $now);
    expect(ya_storage_get_request('request-1')['sync_status'] === 'synced', 'request ack operates only on requests');
    expect($ack['updated_count'] === 1, 'ack imported prefix');
    $client = $db->query("SELECT * FROM sync_clients WHERE client_id = 'desktop-storage'")->fetch();
    expect((int)$client['request_ack_seq'] === 17, 'order ack must not alter request ack');
    expect((int)$client['web_order_ack_seq'] === $first['syncSeq'], 'separate order ack');
    ya_storage_acknowledge_requests('desktop-storage', 19, $now);
    $client = $db->query("SELECT * FROM sync_clients WHERE client_id = 'desktop-storage'")->fetch();
    expect((int)$client['web_order_ack_seq'] === $first['syncSeq'], 'request ack must not alter order ack');
    expect(ya_storage_acknowledge_web_orders('desktop-storage', 0, $now)['acknowledged_cursor'] === $first['syncSeq'], 'ack monotonic');
    expect(ya_storage_acknowledge_web_orders('desktop-storage', $first['syncSeq'], $now)['updated_count'] === 0, 'retry ack idempotent');
    $pending = ya_storage_pull_web_orders(1, 0);
    expect(array_column($pending['orders'], 'id') === ['order-2'], 'zero cursor excludes acknowledged history');
    expect(!$pending['has_more'] && $pending['next_cursor'] === $second['next_cursor'], 'pagination counts pending records only');
    expect($db->query("SELECT COUNT(*) FROM web_orders WHERE imported_at = ''")->fetchColumn() == 1, 'later order remains pending');
    $db->exec("CREATE TRIGGER reject_order_ack BEFORE UPDATE ON sync_clients BEGIN SELECT RAISE(ABORT, 'fixture_ack_failure'); END");
    $failed = false;
    try { ya_storage_acknowledge_web_orders('desktop-storage', $second['next_cursor'], $now); }
    catch (PDOException $error) { $failed = true; }
    expect($failed, 'ack persistence failure surfaced');
    expect($db->query("SELECT imported_at FROM web_orders WHERE id = 'order-2'")->fetchColumn() === '', 'failed ack rolls back imported marker');
    expect((int)$db->query("SELECT web_order_ack_seq FROM sync_clients WHERE client_id = 'desktop-storage'")->fetchColumn() === $first['syncSeq'], 'failed ack preserves client cursor');
    expect(ya_storage_pull_web_orders(1, 0) === $pending, 'unpersisted ack remains retryable');
    $db->exec('DROP TRIGGER reject_order_ack');
    ya_storage_acknowledge_web_orders('desktop-new-client', $second['next_cursor'], $now);
    $empty = ya_storage_pull_web_orders(1, 0);
    expect($empty === ['orders' => [], 'next_cursor' => 0, 'has_more' => false], 'new client zero cursor cannot replay acknowledged orders');
    expect(ya_storage_pull_web_orders(1, $second['next_cursor'])['next_cursor'] === $second['next_cursor'], 'empty page preserves requested cursor');
    $third = ya_storage_enqueue_web_order([...$order, 'id' => 'order-3']);
    $fourth = ya_storage_enqueue_web_order([...$order, 'id' => 'order-4']);
    $mixed = ya_storage_pull_web_orders(1, 0);
    expect(array_column($mixed['orders'], 'id') === ['order-3'] && $mixed['has_more'], 'mixed queue pages only pending records');
    expect($mixed['next_cursor'] === $third['syncSeq'], 'cursor skips acknowledged sequence gaps');
    $last = ya_storage_pull_web_orders(1, $mixed['next_cursor']);
    expect(array_column($last['orders'], 'id') === ['order-4'] && !$last['has_more'] && $last['next_cursor'] === $fourth['syncSeq'], 'pending last page metadata');
    expect(in_array('web_orders_v1', ya_storage_capabilities()['features'], true), 'machine-readable feature');
    $deleted = ya_storage_reset_runtime();
    expect($deleted['web_orders'] === 4 && $deleted['sync_clients'] === 2, 'reset clears orders and clients');
    expect(ya_storage_pull_web_orders(200, 0)['orders'] === [], 'reset queue empty');
    expect(ya_storage_enqueue_web_order($order)['syncSeq'] === 1, 'reset sequence');
    ya_commerce_mail_enqueue($db, 'event-1', 'guest@example.test', 'Subject', 'Body');
    ya_commerce_mail_enqueue($db, 'event-1', 'guest@example.test', 'Subject', 'Body');
    expect((int)$db->query('SELECT COUNT(*) FROM commerce_mail_outbox')->fetchColumn() === 1, 'mail event replay dedupes');
    $conflict = false;
    try { ya_commerce_mail_enqueue($db, 'event-1', 'guest@example.test', 'Subject', 'Changed'); }
    catch (RuntimeException) { $conflict = true; }
    expect($conflict, 'changed event content conflicts');
    $failed = ya_commerce_mail_run($db, static function () { throw new RuntimeException('SECRET SMTP FAILURE'); });
    expect($failed === ['sent' => 0, 'retry' => 1, 'failed' => 0], 'failed transport remains retryable');
    $row = $db->query('SELECT * FROM commerce_mail_outbox')->fetch();
    expect($row['status'] === 'pending' && $row['last_error'] === 'transport_failed' && $row['next_attempt_at'] > time(), 'safe failure and backoff stored');
    expect(ya_commerce_mail_run($db, static function () { throw new RuntimeException('too early'); }) === ['sent' => 0, 'retry' => 0, 'failed' => 0], 'backoff respected');
    $db->exec('UPDATE commerce_mail_outbox SET next_attempt_at = 0');
    $sent = [];
    $deliver = static function (...$args) use (&$sent): void { $sent[] = $args; };
    expect(ya_commerce_mail_run($db, $deliver)['sent'] === 1, 'retry delivered');
    expect(count($sent) === 1 && preg_match('/^<[a-f0-9]{64}@yardimci.invalid>$/', $sent[0][3]) === 1, 'stable message identifier');
    expect(ya_commerce_mail_run($db, $deliver)['sent'] === 0 && count($sent) === 1, 'sent events never resent by normal replay');
    ya_commerce_mail_enqueue($db, 'event-2', 'guest@example.test', 'Subject', 'Body');
    $db->exec("UPDATE commerce_mail_outbox SET status = 'sending', lease_token = 'active', lease_until = " . (time() + 600) . " WHERE status = 'pending'");
    expect(ya_commerce_mail_run($db, $deliver)['sent'] === 0, 'active worker lease excludes concurrent claim');
    $db->exec("UPDATE commerce_mail_outbox SET lease_until = 1 WHERE status = 'sending'");
    expect(ya_commerce_mail_run($db, $deliver)['sent'] === 1, 'crashed worker lease recovered');
    ya_commerce_mail_enqueue($db, 'event-3', 'guest@example.test', 'Subject', 'Body');
    $db->exec("UPDATE commerce_mail_outbox SET attempts = 7 WHERE status = 'pending'");
    expect(ya_commerce_mail_run($db, static function () { throw new RuntimeException('failure'); })['failed'] === 1, 'retry limit produces explicit failed state');
    $db->exec('BEGIN IMMEDIATE');
    ya_commerce_mail_enqueue($db, 'event-rollback', 'guest@example.test', 'Subject', 'Body');
    $db->exec('ROLLBACK');
    expect((int)$db->query('SELECT COUNT(*) FROM commerce_mail_outbox')->fetchColumn() === 3, 'domain rollback also rolls back mail event');
    echo "web-orders-storage-smoke-ok\n";
} finally {
    foreach (glob($root . '/data/*') ?: [] as $file) unlink($file);
    unlink($root . '/lib/storage.php');
    unlink($root . '/lib/commerce-mail.php');
    rmdir($root . '/data');
    rmdir($root . '/lib');
    rmdir($root);
}
