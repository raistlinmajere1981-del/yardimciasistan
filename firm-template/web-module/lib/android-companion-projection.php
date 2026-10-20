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
            if (is_string($rule) && str_starts_with($rule, 'optional_text:') && !array_key_exists($key, $record)) {
                continue;
            } elseif (is_array($rule)) {
                if (!in_array($value, $rule, true)) continue 2;
                $row[$key] = $value;
            } elseif ($rule === 'optional_id') {
                $row[$key] = is_string($value) && preg_match('/^[A-Za-z0-9._:-]{1,120}$/D', $value) === 1 ? $value : '';
            } elseif ($rule === 'id') {
                if (!is_string($value) || preg_match('/^[A-Za-z0-9._:-]{1,120}$/D', $value) !== 1) continue 2;
                $row[$key] = $value;
            } elseif ($rule === 'time') {
                $row[$key] = is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}T[0-9:.+Z-]{8,30}$/D', $value) === 1 ? $value : '';
            } elseif ($rule === 'optional_bool') {
                if ($value !== true) continue;
                $row[$key] = true;
            } elseif ($rule === 'optional_count') {
                if (!array_key_exists($key, $record)) continue;
                $row[$key] = ya_companion_rows([['value' => $value]], 1, ['value' => 'count'])[0]['value'];
            } elseif ($rule === 'bool') {
                $row[$key] = $value === true;
            } elseif (str_starts_with($rule, 'required_text:')) {
                if (!is_string($value)) continue 2;
                $row[$key] = ya_companion_text($value, (int)substr($rule, strpos($rule, ':') + 1));
            } elseif (str_starts_with($rule, 'text:') || str_starts_with($rule, 'optional_text:')) {
                $row[$key] = ya_companion_text($value, (int)substr($rule, strpos($rule, ':') + 1));
            } elseif ($rule === 'url') {
                $row[$key] = ya_companion_tracking_url($value);
            } elseif ($rule === 'amount' || $rule === 'positive_amount') {
                if (!ya_companion_amount($value) || ($rule === 'positive_amount' && $value <= 0)) continue 2;
                $row[$key] = $value;
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

function ya_companion_text(mixed $value, int $limit): string
{
    if (!is_string($value)) return '';
    return preg_match('/^.{0,' . $limit . '}/us', $value, $match) === 1 ? $match[0] : '';
}

function ya_companion_amount(mixed $value): bool
{
    return (is_int($value) || is_float($value)) && is_finite((float)$value) && $value >= 0 && $value <= 9007199254740991;
}

function ya_companion_tracking_url(mixed $value): string
{
    if (!is_string($value) || strlen($value) > 2048 || preg_match('/[\s\x00-\x1f\x7f]/u', $value)) return '';
    $url = parse_url($value);
    return is_array($url) && in_array(strtolower($url['scheme'] ?? ''), ['http', 'https'], true)
        && !empty($url['host']) && !isset($url['user']) && !isset($url['pass']) ? $value : '';
}

/** Sanitize facts and advertised domain eligibility; never evaluate order transitions here. */
function ya_companion_order_details(array $detail, bool $shipping, array $permissions, int $remainingItems): ?array
{
    if (!ya_companion_amount($detail['subtotal'] ?? null) || !ya_companion_amount($detail['discount_total'] ?? null)) return null;
    $input = is_array($detail['items'] ?? null) ? $detail['items'] : [];
    $totalRows = ya_companion_rows([$detail], 1, ['items_total_count' => 'count']);
    $total = $totalRows[0]['items_total_count'];
    $items = count($input) <= 500 && count($input) <= $remainingItems ? ya_companion_rows($input, 500, [
        'id' => 'id', 'product_id' => 'id', 'product_name' => 'required_text:200',
        'unit' => ['piece', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'meter', 'other'],
        'quantity' => 'positive_amount', 'unit_price' => 'amount', 'line_total' => 'amount'
    ]) : [];
    $complete = ($detail['items_complete'] ?? false) === true && $total > 0
        && $total === count($items) && count($items) === count($input);
    $buyer = is_array($detail['buyer'] ?? null) ? ya_companion_rows([$detail['buyer']], 1,
        ['name' => 'text:200', 'phone' => 'text:80', 'email' => 'text:254'])[0] : null;
    $address = $shipping && is_array($detail['delivery_address'] ?? null) ? ya_companion_rows([$detail['delivery_address']], 1, [
        'recipient_name' => 'text:200', 'address_line1' => 'text:500', 'address_line2' => 'text:500',
        'district' => 'text:120', 'city' => 'text:120', 'postal_code' => 'text:40', 'country_code' => 'text:2', 'note' => 'text:2000'
    ])[0] : null;
    $actions = [];
    foreach ($complete && is_array($detail['available_actions'] ?? null) ? $detail['available_actions'] : [] as $action) {
        $permission = $action === 'commerce_order_confirm' ? 'commerce_order.confirm' : ($action === 'commerce_order_cancel' ? 'commerce_order.cancel' : '');
        if ($permission !== '' && in_array($permission, $permissions, true) && !in_array($action, $actions, true)) $actions[] = $action;
    }
    return ['customer_name' => ya_companion_text($detail['customer_name'] ?? '', 200), 'buyer' => $buyer,
        'delivery_address' => $address, 'subtotal' => $detail['subtotal'], 'discount_total' => $detail['discount_total'],
        'note' => ya_companion_text($detail['note'] ?? '', 4000), 'items' => $items, 'items_total_count' => $total,
        'items_complete' => $complete, 'available_actions' => $actions];
}

function ya_companion_project(array $snapshot, array $permissions): array
{
    $commerce = ['orders' => [], 'customers' => [], 'customer_profiles' => [], 'shipments' => [], 'order_counts' => [], 'shipment_counts' => [],
        'online_catalog' => ['desired_product_count' => 0, 'pending' => false, 'updated_at' => '']];
    $marketing = ['publications' => [], 'schedules' => [], 'campaigns' => []];
    $caps = array_fill_keys(is_array($snapshot['business_capabilities'] ?? null) ? $snapshot['business_capabilities'] : [], true);
    if (!isset($caps['service.android'])) return compact('commerce', 'marketing');
    $can = static fn(string $permission): bool => in_array($permission, $permissions, true);
    $contactAllowed = isset($caps['core.customers']) && ($can('customer.view')
        || ($can('dealer.view') && isset($caps['commerce.orders'], $caps['commerce.wholesale'])));
    $sourceAllowed = static fn(array $row): bool => (($row['source'] !== 'web-dealer' && ($row['dealer_order'] ?? false) !== true) || isset($caps['commerce.wholesale']))
        && ($row['source'] !== 'web-online-sales' || (isset($caps['channel.online_sales']) && $can('online_sales.view')));
    $c = is_array($snapshot['commerce'] ?? null) ? $snapshot['commerce'] : [];
    $sources = ['desktop', 'web-online-sales', 'web-dealer', 'other'];
    $statuses = ['placed', 'confirmed', 'fulfilled', 'cancelled'];
    if (isset($caps['commerce.orders']) && $can('commerce_order.view')) {
        $commerce['orders'] = array_slice(array_values(array_filter(ya_companion_rows($c['orders'] ?? [], 100, [
            'id' => 'id', 'customer_id' => 'optional_id', 'status' => $statuses, 'source' => $sources, 'total' => 'money', 'currency' => 'currency',
            'delivery_method' => ['pickup', 'shipping'], 'placed_at' => 'time', 'updated_at' => 'time', 'dealer_order' => 'optional_bool'
        ]), $sourceAllowed)), 0, 100);
        if (!$contactAllowed) {
            foreach ($commerce['orders'] as &$order) $order['customer_id'] = '';
            unset($order);
        }
        $detailsById = [];
        foreach (is_array($c['orders'] ?? null) ? array_slice($c['orders'], 0, 100) : [] as $order) {
            if (is_array($order) && is_string($order['id'] ?? null)
                && preg_match('/^[A-Za-z0-9._:-]{1,120}$/D', $order['id']) === 1 && is_array($order['details'] ?? null)) {
                $detailsById[$order['id']] = $order['details'];
            }
        }
        $remainingItems = 2000; $remainingBytes = 1024 * 1024;
        foreach ($commerce['orders'] as &$order) {
            if (!isset($detailsById[$order['id']])) continue;
            $detail = ya_companion_order_details($detailsById[$order['id']], $order['delivery_method'] === 'shipping', $permissions, $remainingItems);
            if ($detail === null) continue;
            $encoded = json_encode($detail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
            if ($encoded === false || strlen($encoded) > $remainingBytes) continue;
            $order['details'] = $detail;
            $remainingItems -= count($detail['items']); $remainingBytes -= strlen($encoded);
        }
        unset($order);
        $commerce['order_counts'] = array_values(array_filter(ya_companion_rows($c['order_counts'] ?? [], 16, [
            'source' => $sources, 'status' => $statuses, 'count' => 'count', 'dealer_count' => 'optional_count'
        ]), $sourceAllowed));
        if (!isset($caps['commerce.wholesale'])) foreach ($commerce['order_counts'] as &$countRow) {
            $countRow['count'] = max(0, $countRow['count'] - ($countRow['dealer_count'] ?? 0));
            unset($countRow['dealer_count']);
        }
        unset($countRow);
        if ($can('shipment.view')) {
            $orderIds = array_fill_keys(array_column($commerce['orders'], 'id'), true);
            $commerce['shipments'] = array_values(array_filter(ya_companion_rows($c['shipments'] ?? [], 100, [
                'id' => 'id', 'order_id' => 'id', 'status' => ['draft', 'ready', 'dispatched', 'delivered', 'cancelled'],
                'tracking_available' => 'bool', 'updated_at' => 'time',
                'provider_name' => 'optional_text:120', 'tracking_number' => 'optional_text:120',
                'tracking_url' => 'url', 'note' => 'optional_text:2000'
            ]), static fn(array $row): bool => isset($orderIds[$row['order_id']])));
            foreach ($commerce['shipments'] as &$shipment) {
                if (!array_key_exists('tracking_number', $shipment)) {
                    unset($shipment['provider_name'], $shipment['tracking_url'], $shipment['note']);
                } else {
                    $shipment['provider_name'] = $shipment['provider_name'] ?? '';
                    $shipment['note'] = $shipment['note'] ?? '';
                }
            }
            unset($shipment);
            $commerce['shipment_counts'] = array_values(array_filter(ya_companion_rows($c['shipment_counts'] ?? [], 4, [
                'source' => $sources, 'pending' => 'count', 'dealer_pending' => 'optional_count'
            ]), $sourceAllowed));
            if (!isset($caps['commerce.wholesale'])) foreach ($commerce['shipment_counts'] as &$countRow) {
                $countRow['pending'] = max(0, $countRow['pending'] - ($countRow['dealer_pending'] ?? 0));
                unset($countRow['dealer_pending']);
            }
            unset($countRow);
        }
        if (isset($caps['channel.online_sales']) && $can('online_sales.view')) {
            $rows = ya_companion_rows([$c['online_catalog'] ?? []], 1, [
                'desired_product_count' => 'count', 'pending' => 'bool', 'updated_at' => 'time']);
            $commerce['online_catalog'] = $rows[0];
        }
    }
    $customerIds = array_fill_keys(array_filter(array_column($commerce['orders'], 'customer_id')), true);
    if ($contactAllowed) {
        $commerce['customers'] = array_values(array_filter(ya_companion_rows($c['customers'] ?? [], 100, [
            'id' => 'id', 'full_name' => 'text:200', 'phone' => 'text:80', 'email' => 'text:254', 'updated_at' => 'time'
        ]), static fn(array $row): bool => isset($customerIds[$row['id']])));
    }
    if (isset($caps['commerce.orders'], $caps['commerce.wholesale'], $caps['core.customers']) && $can('dealer.view')) {
        $commerce['customer_profiles'] = array_values(array_filter(ya_companion_rows($c['customer_profiles'] ?? [], 100, [
            'customer_id' => 'id', 'dealer_status' => ['active', 'inactive'],
            'price_group' => ['retail', 'dealer_a', 'dealer_b'], 'updated_at' => 'time',
            'company_name' => 'optional_text:200', 'authorized_person' => 'optional_text:200'
        ]), static fn(array $row): bool => isset($customerIds[$row['customer_id']])));
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
