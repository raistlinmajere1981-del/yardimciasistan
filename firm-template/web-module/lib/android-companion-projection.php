<?php
declare(strict_types=1);

/** Companion v3 wire allowlist, never a domain writer or publication lifecycle. */
function ya_companion_rows(mixed $records, int $limit, array $fields): array
{
    $result = [];
    foreach (is_array($records) ? $records : [] as $record) {
        if (!is_array($record)) continue;
        $row = [];
        foreach ($fields as $key => $rule) {
            $value = $record[$key] ?? null;
            if (is_array($rule)) {
                if (!in_array($value, $rule, true)) continue 2;
                $row[$key] = $value;
            } elseif ($rule === 'optional_id') {
                $row[$key] = is_string($value) && preg_match('/^[A-Za-z0-9._:-]{1,120}$/D', $value) === 1 ? $value : '';
            } elseif ($rule === 'id') {
                if (!is_string($value) || preg_match('/^[A-Za-z0-9._:-]{1,120}$/D', $value) !== 1) continue 2;
                $row[$key] = $value;
            } elseif ($rule === 'time') {
                $row[$key] = is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}T[0-9:.+Z-]{8,30}$/D', $value) === 1 ? $value : '';
            } elseif ($rule === 'bool') {
                $row[$key] = $value === true;
            } elseif ($rule === 'money') {
                $row[$key] = is_numeric($value) && is_finite((float)$value) && (float)$value >= 0 ? (float)$value : 0;
            } elseif ($rule === 'currency') {
                $row[$key] = is_string($value) && preg_match('/^[A-Z]{3}$/D', $value) === 1 ? $value : 'TRY';
            } else {
                $row[$key] = is_numeric($value) && (float)$value >= 0 && (float)$value <= 9007199254740991
                    && floor((float)$value) === (float)$value ? (int)$value : 0;
            }
        }
        $result[] = $row;
        if (count($result) >= $limit) break;
    }
    return $result;
}

function ya_companion_project(array $snapshot, array $permissions): array
{
    $commerce = ['orders' => [], 'customer_profiles' => [], 'shipments' => [], 'order_counts' => [], 'shipment_counts' => [],
        'online_catalog' => ['desired_product_count' => 0, 'pending' => false, 'updated_at' => '']];
    $marketing = ['publications' => [], 'schedules' => [], 'campaigns' => []];
    $caps = array_fill_keys(is_array($snapshot['business_capabilities'] ?? null) ? $snapshot['business_capabilities'] : [], true);
    if (!isset($caps['service.android'])) return compact('commerce', 'marketing');
    $can = static fn(string $permission): bool => in_array($permission, $permissions, true);
    $sourceAllowed = static fn(array $row): bool => ($row['source'] !== 'web-dealer' || isset($caps['commerce.wholesale']))
        && ($row['source'] !== 'web-online-sales' || (isset($caps['channel.online_sales']) && $can('online_sales.view')));
    $c = is_array($snapshot['commerce'] ?? null) ? $snapshot['commerce'] : [];
    $sources = ['desktop', 'web-online-sales', 'web-dealer', 'other'];
    $statuses = ['placed', 'confirmed', 'fulfilled', 'cancelled'];
    if (isset($caps['commerce.orders']) && $can('commerce_order.view')) {
        $commerce['orders'] = array_slice(array_values(array_filter(ya_companion_rows($c['orders'] ?? [], 100, [
            'id' => 'id', 'customer_id' => 'optional_id', 'status' => $statuses, 'source' => $sources, 'total' => 'money', 'currency' => 'currency',
            'delivery_method' => ['pickup', 'shipping'], 'placed_at' => 'time', 'updated_at' => 'time'
        ]), $sourceAllowed)), 0, 100);
        if (!$can('dealer.view') || !isset($caps['commerce.wholesale'], $caps['core.customers'])) {
            foreach ($commerce['orders'] as &$order) $order['customer_id'] = '';
            unset($order);
        }
        $commerce['order_counts'] = array_values(array_filter(ya_companion_rows($c['order_counts'] ?? [], 16, [
            'source' => $sources, 'status' => $statuses, 'count' => 'count'
        ]), $sourceAllowed));
        if ($can('shipment.view')) {
            $orderIds = array_fill_keys(array_column($commerce['orders'], 'id'), true);
            $commerce['shipments'] = array_values(array_filter(ya_companion_rows($c['shipments'] ?? [], 100, [
                'id' => 'id', 'order_id' => 'id', 'status' => ['draft', 'ready', 'dispatched', 'delivered', 'cancelled'],
                'tracking_available' => 'bool', 'updated_at' => 'time'
            ]), static fn(array $row): bool => isset($orderIds[$row['order_id']])));
            $commerce['shipment_counts'] = array_values(array_filter(ya_companion_rows($c['shipment_counts'] ?? [], 4, [
                'source' => $sources, 'pending' => 'count'
            ]), $sourceAllowed));
        }
        if (isset($caps['channel.online_sales']) && $can('online_sales.view')) {
            $rows = ya_companion_rows([$c['online_catalog'] ?? []], 1, [
                'desired_product_count' => 'count', 'pending' => 'bool', 'updated_at' => 'time']);
            $commerce['online_catalog'] = $rows[0];
        }
    }
    if (isset($caps['commerce.orders'], $caps['commerce.wholesale'], $caps['core.customers']) && $can('dealer.view')) {
        $commerce['customer_profiles'] = ya_companion_rows($c['customer_profiles'] ?? [], 100, [
            'customer_id' => 'id', 'dealer_status' => ['candidate', 'active', 'inactive'],
            'price_group' => ['retail', 'dealer_a', 'dealer_b'], 'updated_at' => 'time']);
    }
    if (isset($caps['marketing.studio']) && $can('marketing.status.view')) {
        $m = is_array($snapshot['marketing'] ?? null) ? $snapshot['marketing'] : [];
        $campaignAllowed = isset($caps['messaging.campaigns'], $caps['core.customers']);
        $marketing['publications'] = ya_companion_rows($m['publications'] ?? [], 50, [
            'id' => 'id', 'channel' => ['website', 'instagram'], 'status' => ['draft', 'publishing', 'published', 'unpublished', 'failed'],
            'revision' => 'count', 'published_revision' => 'count', 'desired_published' => 'bool', 'updated_at' => 'time']);
        $marketing['schedules'] = array_values(array_filter(ya_companion_rows($m['schedules'] ?? [], 50, [
            'id' => 'id', 'channel' => ['website', 'instagram', 'whatsapp', 'sms'],
            'target_type' => ['public_publication', 'audience_campaign'], 'status' => ['active', 'paused', 'completed', 'cancelled'],
            'next_run_at' => 'time', 'last_execution_status' => ['', 'pending', 'claimed', 'succeeded', 'skipped', 'failed'], 'updated_at' => 'time'
        ]), static fn(array $row): bool => ($row['target_type'] === 'public_publication' && in_array($row['channel'], ['website', 'instagram'], true))
            || ($campaignAllowed && $row['target_type'] === 'audience_campaign' && in_array($row['channel'], ['whatsapp', 'sms'], true))));
        if ($campaignAllowed) $marketing['campaigns'] = ya_companion_rows($m['campaigns'] ?? [], 50, [
            'id' => 'id', 'channel' => ['whatsapp', 'sms'], 'status' => ['draft', 'prepared', 'running', 'paused', 'cancelled', 'completed'],
            'pending_count' => 'count', 'failed_count' => 'count', 'updated_at' => 'time']);
    }
    return compact('commerce', 'marketing');
}

function ya_companion_counters(array $companion): array
{
    $c = $companion['commerce']; $m = $companion['marketing'];
    return [
        'pending_commerce_orders' => array_sum(array_column(array_filter($c['order_counts'], static fn(array $r): bool => $r['status'] === 'placed'), 'count')),
        'open_commerce_orders' => array_sum(array_column(array_filter($c['order_counts'], static fn(array $r): bool => in_array($r['status'], ['placed', 'confirmed'], true)), 'count')),
        'pending_shipments' => array_sum(array_column($c['shipment_counts'], 'pending')),
        'online_catalog_pending' => $c['online_catalog']['pending'] ? 1 : 0,
        'recent_failed_marketing_operations' => count(array_filter($m['publications'], static fn(array $r): bool => $r['status'] === 'failed'))
            + count(array_filter($m['schedules'], static fn(array $r): bool => $r['last_execution_status'] === 'failed'))
            + count(array_filter($m['campaigns'], static fn(array $r): bool => $r['failed_count'] > 0))
    ];
}
