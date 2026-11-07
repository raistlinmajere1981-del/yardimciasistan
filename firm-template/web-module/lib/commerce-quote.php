<?php
declare(strict_types=1);

/** Hosting quote from an already authorized publication, never from client money.
 * Current commerce currencies use two decimal minor units. Unsupported exponents
 * must be introduced explicitly before offering payment in those currencies.
 */
function ya_commerce_quote(array $items, array $products): array
{
    $indexed = array_column($products, null, 'product_id');
    $lines = []; $currency = null; $total = 0;
    // Bound every intermediate to the interoperable JSON safe-integer range.
    $maximum = 9007199254740991;
    foreach ($items as $item) {
        $product = $indexed[$item['productId']] ?? null;
        if (!$product) throw new YaOnlineOrderRejection(422, 'product_not_published', 'Ürün artık satışta değil.');
        $quantity = $item['quantity'];
        if (in_array($product['unit'], ['piece', 'pack', 'box'], true) && floor($quantity) !== (float)$quantity) {
            throw new YaOnlineOrderRejection(422, 'invalid_quantity', 'Bu ürün tam sayı miktarla sipariş edilebilir.');
        }
        if ($currency !== null && $currency !== $product['currency']) {
            throw new YaOnlineOrderRejection(422, 'mixed_currency', 'Farklı para birimlerindeki ürünleri ayrı sipariş edin.');
        }
        $currency = $product['currency'];
        if (!in_array($currency, ['TRY', 'EUR', 'USD', 'GBP'], true)) {
            throw new YaOnlineOrderRejection(422, 'unsupported_currency', 'Bu para birimiyle sipariş henüz desteklenmiyor.');
        }
        $price = $product['price'];
        if ((!is_int($price) && !is_float($price)) || !is_finite((float)$price) || $price < 0 || $price > 900000000) {
            throw new YaOnlineOrderRejection(422, 'invalid_price', 'Ürün fiyatı doğrulanamadı.');
        }
        $minor = (int)round($price * 100, 0, PHP_ROUND_HALF_UP);
        $scaledQuantity = (int)round($quantity * 10000);
        if ($scaledQuantity < 1 || $scaledQuantity > 10000000 || $minor > intdiv($maximum - 5000, $scaledQuantity)) {
            throw new YaOnlineOrderRejection(422, 'amount_out_of_range', 'Sipariş tutarı sınırı aşıldı.');
        }
        $lineTotal = intdiv($minor * $scaledQuantity + 5000, 10000);
        if ($total > $maximum - $lineTotal) throw new YaOnlineOrderRejection(422, 'amount_out_of_range', 'Sipariş tutarı sınırı aşıldı.');
        $total += $lineTotal;
        $lines[] = ['product_id' => $product['product_id'], 'name' => $product['name'], 'unit' => $product['unit'],
            'tax_rate' => $product['tax_rate'], 'sku' => $product['sku'],
            'quantity' => $quantity, 'unit_price_minor' => $minor, 'line_total_minor' => $lineTotal];
    }
    if (!$lines) throw new YaOnlineOrderRejection(422, 'invalid_order', 'Sepet boş.');
    return ['version' => 1, 'currency' => $currency, 'minor_unit' => 2, 'items' => $lines, 'subtotal_minor' => $total];
}
