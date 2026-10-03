<?php
declare(strict_types=1);

/** Transport allowlist only. Desktop owns publication selection and retail pricing. */
function ya_online_catalog_projection(array $candidate): array
{
    $enabled = ($candidate['enabled'] ?? false) === true;
    $products = [];
    if ($enabled) {
        if (!is_array($candidate['products'] ?? null)) throw new InvalidArgumentException('invalid_online_catalog');
        foreach ($candidate['products'] as $raw) {
            if (!is_array($raw)) throw new InvalidArgumentException('invalid_online_product');
            $id = is_string($raw['product_id'] ?? null) ? trim($raw['product_id']) : '';
            $name = is_string($raw['name'] ?? null) ? trim($raw['name']) : '';
            $price = $raw['price'] ?? null;
            $taxRate = $raw['tax_rate'] ?? null;
            $currency = $raw['currency'] ?? '';
            $unit = $raw['unit'] ?? '';
            if ($id === '' || strlen($id) > 180 || $name === '' || mb_strlen($name) > 180
                || (!is_int($price) && !is_float($price)) || !is_finite((float)$price) || $price < 0
                || (!is_int($taxRate) && !is_float($taxRate)) || !is_finite((float)$taxRate) || $taxRate < 0
                || !is_string($currency) || preg_match('/^[A-Z]{3}$/', $currency) !== 1
                || !in_array($unit, ['piece', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'meter', 'other'], true)
                || ($raw['availability'] ?? '') !== 'available' || isset($products[$id])) {
                throw new InvalidArgumentException('invalid_online_product');
            }
            $imageUrl = is_string($raw['image_url'] ?? null) ? $raw['image_url'] : '';
            $image = parse_url($imageUrl);
            if (!is_array($image) || ($image['scheme'] ?? '') !== 'https'
                || isset($image['user']) || isset($image['pass']) || isset($image['query']) || isset($image['fragment'])
                || !str_contains($image['host'] ?? '', '.')
                || preg_match('/^[\d.:\[\]]+$/', $image['host'] ?? '') === 1
                || preg_match('/\.(local|localhost|internal|test)$/', $image['host'] ?? '') === 1) $imageUrl = '';
            $products[$id] = [
                'product_id' => $id, 'name' => $name,
                'description' => mb_substr(is_string($raw['description'] ?? null) ? $raw['description'] : '', 0, 2000),
                'sku' => mb_substr(is_string($raw['sku'] ?? null) ? $raw['sku'] : '', 0, 80),
                'unit' => $unit, 'price' => $price, 'currency' => $currency, 'tax_rate' => $taxRate,
                'image_url' => mb_substr($imageUrl, 0, 2048), 'availability' => 'available',
                'sort_order' => max(0, (int)($raw['sort_order'] ?? 0))
            ];
        }
    }
    $products = array_values($products);
    usort($products, static fn (array $a, array $b): int =>
        ($a['sort_order'] <=> $b['sort_order']) ?: strcmp($a['name'], $b['name']) ?: strcmp($a['product_id'], $b['product_id']));
    return [
        'version' => 1, 'enabled' => $enabled,
        'updated_at' => mb_substr(is_string($candidate['updated_at'] ?? null) ? $candidate['updated_at'] : '', 0, 64),
        'products' => $products
    ];
}
