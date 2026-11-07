<?php
declare(strict_types=1);

/** Public configuration allowlist. Missing configuration closes checkout, never guesses a fee. */
function ya_commerce_checkout_settings(mixed $raw): array
{
    $closed = ['version' => 1, 'enabled' => false, 'demo' => true, 'currency' => 'TRY', 'shippingFeeMinor' => null, 'bank' => null, 'legal' => null];
    if ($raw === null) return $closed;
    if (!is_array($raw) || ($raw['version'] ?? null) !== 1 || !is_bool($raw['enabled'] ?? null)
        || !is_bool($raw['demo'] ?? null) || !in_array($raw['currency'] ?? '', ['TRY','EUR','USD','GBP'], true)) throw new InvalidArgumentException('invalid_checkout_settings');
    $fee = $raw['shippingFeeMinor'] ?? null;
    if ($fee !== null && (!is_int($fee) || $fee < 0 || $fee > 90000000000)) throw new InvalidArgumentException('invalid_shipping_fee');
    $result = [...$closed, 'enabled' => $raw['enabled'], 'demo' => $raw['demo'], 'currency' => $raw['currency'], 'shippingFeeMinor' => $fee];
    foreach (['bank' => ['name' => 160, 'accountHolder' => 160, 'iban' => 80], 'legal' => ['version' => 80, 'preliminary' => 20000, 'agreement' => 20000]] as $group => $fields) {
        if (($raw[$group] ?? null) === null && !$raw['enabled']) continue;
        if (!is_array($raw[$group] ?? null)) throw new InvalidArgumentException('invalid_checkout_' . $group);
        $result[$group] = [];
        foreach ($fields as $key => $maximum) {
            $value = $raw[$group][$key] ?? null;
            if (!is_string($value) || trim($value) === '' || mb_strlen($value) > $maximum || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $value)) throw new InvalidArgumentException('invalid_checkout_' . $group);
            $result[$group][$key] = trim($value);
        }
    }
    if ($raw['enabled'] && $raw['demo'] && (!str_contains($result['bank']['iban'], 'DEMO') || preg_match('/^[A-Z]{2}\d{2}[A-Z0-9 ]+$/D', $result['bank']['iban']))) throw new InvalidArgumentException('demo_bank_must_be_invalid');
    if ($raw['enabled'] && !$raw['demo']) {
        $iban = str_replace(' ', '', strtoupper($result['bank']['iban']));
        if (!preg_match('/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/D', $iban)) throw new InvalidArgumentException('invalid_bank_iban');
        $digits = '';
        foreach (str_split(substr($iban, 4) . substr($iban, 0, 4)) as $char) $digits .= ctype_alpha($char) ? (string)(ord($char) - 55) : $char;
        $remainder = 0;
        foreach (str_split($digits) as $digit) $remainder = ($remainder * 10 + (int)$digit) % 97;
        if ($remainder !== 1) throw new InvalidArgumentException('invalid_bank_iban');
    }
    return $result;
}

/** Canonical amount from authorized retail products and published business terms. */
function ya_commerce_checkout_quote(array $items, array $delivery, array $catalog): array
{
    if (!$catalog['enabled']) throw new YaOnlineOrderRejection(403, 'online_sales_disabled', 'Web siparişleri şu anda kapalı.');
    if (!$catalog['delivery_methods']) throw new YaOnlineOrderRejection(403, 'online_ordering_disabled', 'Web siparişleri şu anda kapalı.');
    if (!in_array($delivery['method'], $catalog['delivery_methods'], true)) throw new YaOnlineOrderRejection(422, 'delivery_method_unavailable', 'Teslimat yöntemi artık sunulmuyor.');
    $quote = ya_commerce_quote($items, $catalog['products']);
    $settings = $catalog['checkout'];
    if (!$settings['enabled']) throw new YaOnlineOrderRejection(409, 'checkout_unconfigured', 'İşletme ödeme ve sözleşme ayarlarını henüz tamamlamadı.');
    if ($quote['currency'] !== $settings['currency']) throw new YaOnlineOrderRejection(422, 'checkout_currency_mismatch', 'Bu ürünlerin para biriminde ödeme yapılandırılmadı.');
    $fee = $delivery['method'] === 'pickup' ? 0 : $settings['shippingFeeMinor'];
    if ($fee === null) throw new YaOnlineOrderRejection(409, 'shipping_fee_unconfigured', 'Kargo bedeli henüz tanımlanmadı. Mağazadan teslim seçebilirsiniz.');
    if ($quote['subtotal_minor'] + $fee === 0) throw new YaOnlineOrderRejection(422, 'positive_checkout_total_required', 'Sıfır tutarlı siparişlerde havale checkout henüz desteklenmiyor.');
    if ($quote['subtotal_minor'] > 900000000000 - $fee) throw new YaOnlineOrderRejection(422, 'amount_out_of_range', 'Sipariş tutarı sınırı aşıldı.');
    $quote = [...$quote, 'version' => 2, 'delivery_fee_minor' => $fee, 'total_minor' => $quote['subtotal_minor'] + $fee,
        'delivery_method' => $delivery['method'], 'payment_method' => 'bank_transfer', 'bank' => $settings['bank'], 'demo' => $settings['demo'], 'legal' => $settings['legal']];
    // Terms, destination and quantities participate; a changed quote needs a new review.
    $quote['quote_id'] = hash('sha256', json_encode([$quote, $delivery], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $quote;
}

function ya_commerce_checkout_acceptance(array $input): array
{
    $consent = $input['consent'] ?? null;
    if (($input['paymentMethod'] ?? '') !== 'bank_transfer') throw new YaOnlineOrderRejection(422, 'payment_method_unavailable', 'Yalnız havale ile ödeme kullanılabilir.');
    if (!is_array($consent) || ($consent['preliminary'] ?? false) !== true || ($consent['agreement'] ?? false) !== true
        || !is_bool($consent['marketing'] ?? null)) throw new YaOnlineOrderRejection(422, 'consent_required', 'Ön bilgilendirme ve satış sözleşmesi kabul edilmeli.');
    $quoteId = $input['quoteId'] ?? '';
    if (!is_string($quoteId) || !preg_match('/^[a-f0-9]{64}$/D', $quoteId)) throw new YaOnlineOrderRejection(422, 'quote_required', 'Sipariş özetini yeniden inceleyin.');
    return ['paymentMethod' => 'bank_transfer', 'quoteId' => $quoteId,
        'consent' => ['preliminary' => true, 'agreement' => true, 'marketing' => $consent['marketing']]];
}
