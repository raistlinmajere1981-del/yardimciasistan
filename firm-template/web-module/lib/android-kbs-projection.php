<?php
declare(strict_types=1);

/** Separate admin policy; no rooms/tasks group inheritance and no shared-secret Android access. */
function ya_kbs_snapshot(mixed $value, array $capabilities): ?array
{
    if (!is_array($value) || ($value['enabled'] ?? false) !== true
        || !in_array($value['provider'] ?? '', ['egm', 'jandarma'], true)
        || count(array_intersect(['service.android', 'accommodation.rooms', 'accommodation.stays'], $capabilities)) !== 3) return null;
    $text = static fn(mixed $v, int $max): string => is_string($v) ? mb_substr(trim($v), 0, $max) : '';
    $count = static fn(mixed $v): int => is_int($v) && $v >= 0 ? $v : 0;
    $rows = [];
    foreach (array_slice(is_array($value['notifications'] ?? null) ? $value['notifications'] : [], 0, 500) as $row) {
        if (!is_array($row) || $text($row['id'] ?? '', 180) === ''
            || !in_array($row['kind'] ?? '', ['arrival', 'departure', 'room_change'], true)
            || !in_array($row['status'] ?? '', ['pending', 'failed', 'submission_unknown', 'sent'], true)) continue;
        $rows[] = ['id' => $text($row['id'], 180), 'customer_name' => $text($row['customer_name'] ?? '', 160),
            'room_name' => $text($row['room_name'] ?? '', 120), 'room_number' => $text($row['room_number'] ?? '', 40),
            'occurred_at' => $text($row['occurred_at'] ?? '', 80), 'kind' => $row['kind'], 'status' => $row['status'],
            'identity_ready' => ($row['identity_ready'] ?? false) === true,
            'retry_ready' => $row['status'] === 'failed' && ($row['retry_ready'] ?? false) === true,
            'delivery_requested' => $row['status'] === 'pending' && ($row['delivery_requested'] ?? false) === true,
            'request_state' => in_array($row['request_state'] ?? '', ['queued','sent','failed','waiting','submission_unknown','denied'], true) ? $row['request_state'] : ''];
    }
    return ['enabled' => true, 'configured' => ($value['configured'] ?? false) === true, 'provider' => $value['provider'],
        'pending_count' => $count($value['pending_count'] ?? 0), 'failed_count' => $count($value['failed_count'] ?? 0),
        'submission_unknown_count' => $count($value['submission_unknown_count'] ?? 0), 'sent_count' => $count($value['sent_count'] ?? 0),
        'identity_ready_count' => $count($value['identity_ready_count'] ?? 0), 'identity_missing_count' => $count($value['identity_missing_count'] ?? 0),
        'notifications' => $rows];
}

function ya_kbs_for_device(mixed $value, array $capabilities, array $profile, bool $personalDevice): ?array
{
    return $personalDevice && ($profile['role'] ?? '') === 'admin' && ($profile['is_active'] ?? false) === true
        && in_array('kbs.view', $profile['permissions'] ?? [], true) ? ya_kbs_snapshot($value, $capabilities) : null;
}

function ya_kbs_action_authorized(string $type, array $snapshot, array $profile, bool $personalDevice): bool
{
    $permission = ['kbs_send_request' => 'kbs.send', 'kbs_retry_prepare' => 'kbs.retry',
        'kbs_mark_sent_externally' => 'kbs.reconcile_external'][$type] ?? '';
    return $permission !== '' && in_array($permission, $profile['permissions'] ?? [], true)
        && ya_kbs_for_device($snapshot['kbs'] ?? null, $snapshot['business_capabilities'] ?? [], $profile, $personalDevice) !== null;
}

function ya_kbs_payload_valid(string $type, array $payload): bool
{
    $external = $type === 'kbs_mark_sent_externally';
    $allowed = ['notification_id', 'provider', 'expected_status', ...($external ? ['portal_record_verified', 'external_confirmation'] : [])];
    return array_diff(array_keys($payload), $allowed) === [] && is_string($payload['notification_id'] ?? null)
        && trim($payload['notification_id']) !== '' && strlen($payload['notification_id']) <= 180
        && trim($payload['notification_id']) === $payload['notification_id']
        && in_array($payload['provider'] ?? '', ['egm', 'jandarma'], true)
        && in_array($payload['expected_status'] ?? '', ['pending', 'failed', 'submission_unknown'], true)
        && ($type !== 'kbs_send_request' || $payload['expected_status'] === 'pending')
        && ($type !== 'kbs_retry_prepare' || $payload['expected_status'] === 'failed')
        && (!$external || (($payload['portal_record_verified'] ?? false) === true
            && ($payload['external_confirmation'] ?? '') === 'government_portal_verified'));
}
