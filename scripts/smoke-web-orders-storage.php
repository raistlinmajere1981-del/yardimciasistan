<?php
// Standalone behavior check against a fresh current-schema hosting store.
declare(strict_types=1);
$root = sys_get_temp_dir() . '/ya-web-orders-' . bin2hex(random_bytes(8));
mkdir($root . '/lib', 0700, true);
copy(__DIR__ . '/../firm-template/web-module/lib/storage.php', $root . '/lib/storage.php');
require $root . '/lib/storage.php';
function expect(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
try {
    $now = date(DATE_ATOM);
    $order = ['id' => 'order-1', 'items' => [['productId' => 'product-1', 'quantity' => 2]], 'buyer' => ['name' => 'Guest', 'phone' => '+1 (202) 555-0100', 'email' => 'guest@example.test'], 'note' => 'Guest note', 'createdAt' => $now];
    $first = ya_storage_enqueue_web_order($order);
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
    expect(count(ya_storage_pull_web_orders(200, 0)['orders']) === 2, 'cursor replay remains available');
    expect($db->query("SELECT COUNT(*) FROM web_orders WHERE imported_at = ''")->fetchColumn() == 1, 'later order remains pending');
    expect(in_array('web_orders_v1', ya_storage_capabilities()['features'], true), 'machine-readable feature');
    $deleted = ya_storage_reset_runtime();
    expect($deleted['web_orders'] === 2 && $deleted['sync_clients'] === 1, 'reset clears orders and clients');
    expect(ya_storage_pull_web_orders(200, 0)['orders'] === [], 'reset queue empty');
    expect(ya_storage_enqueue_web_order($order)['syncSeq'] === 1, 'reset sequence');
    echo "web-orders-storage-smoke-ok\n";
} finally {
    foreach (glob($root . '/data/*') ?: [] as $file) unlink($file);
    unlink($root . '/lib/storage.php');
    rmdir($root . '/data');
    rmdir($root . '/lib');
    rmdir($root);
}
