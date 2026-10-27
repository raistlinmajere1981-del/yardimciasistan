<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';

/** The existing Desktop runtime publication is the capability authority. Its
 * absence never grants a service from bootstrap config or a profile preset.
 */
function ya_public_runtime_capabilities(): array
{
    try {
        $snapshot = ya_storage_get_publication('android_snapshot', []);
    } catch (Throwable) {
        return [];
    }
    $capabilities = $snapshot['business_capabilities'] ?? null;
    if (!is_array($capabilities) || !array_is_list($capabilities)) return [];
    return array_values(array_unique(array_filter(array_map(
        static fn (mixed $value): string => is_string($value) ? trim($value) : '',
        $capabilities
    ), static fn (string $value): bool => $value !== '')));
}

function ya_public_requests_enabled(array $capabilities): bool
{
    return in_array('customer.requests', $capabilities, true)
        && in_array('core.customers', $capabilities, true);
}

/** Checked projection of shared/capability-policy.isRequestTypeAvailable. The
 * HTTP request test compares every type against that canonical policy.
 */
function ya_public_request_type_requirements(): array
{
    return [
        'dealer_application' => 'commerce.wholesale',
        'general_info' => null,
        'pension_reservation' => 'accommodation.reservations',
        'restaurant_reservation' => 'food_service.reservations',
        'breakfast_request' => 'food_service.reservations',
        'qr_menu_question' => 'channel.qr_menu',
        'location_question' => null,
        'price_question' => null,
        'other' => null,
    ];
}

function ya_public_request_types(array $capabilities, bool $dealerApplicationEnabled = false): array
{
    if (!ya_public_requests_enabled($capabilities)) return [];
    $types = [];
    foreach (ya_public_request_type_requirements() as $type => $required) {
        if ($required !== null && !in_array($required, $capabilities, true)) continue;
        if ($type === 'dealer_application' && !$dealerApplicationEnabled) continue;
        $types[] = $type;
    }
    return $types;
}
