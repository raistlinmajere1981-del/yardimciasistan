<?php
declare(strict_types=1);
require_once __DIR__ . '/public-localization.php';

function ya_online_product_image_url(mixed $value): string
{
    if (!is_string($value) || strlen($value) > 2048 || preg_match('/[\x00-\x20\x7f\\\\]/', $value)) return '';
    $image = parse_url($value);
    $host = strtolower($image['host'] ?? '');
    if (!is_array($image) || ($image['scheme'] ?? '') !== 'https'
        || isset($image['user']) || isset($image['pass']) || isset($image['query']) || isset($image['fragment'])
        || !str_contains($host, '.') || str_ends_with($host, '.')
        || preg_match('/^[\d.:\[\]]+$/', $host) === 1
        || preg_match('/\.(local|localhost|internal|test)$/', $host) === 1) return '';
    return $value;
}

function ya_online_product_image_urls(array $raw, string $cover): array
{
    if (!array_key_exists('image_urls', $raw)) return $cover !== '' ? [$cover] : [];
    $urls = $raw['image_urls'];
    if (!is_array($urls) || !array_is_list($urls) || count($urls) > 12) throw new InvalidArgumentException('invalid_online_product_images');
    $result = [];
    foreach ($urls as $url) {
        if (ya_online_product_image_url($url) === '') throw new InvalidArgumentException('invalid_online_product_images');
        if (!in_array($url, $result, true)) $result[] = $url;
    }
    if (($result[0] ?? '') !== $cover) throw new InvalidArgumentException('invalid_online_product_image_cover');
    return $result;
}

/** Transport allowlist only. Desktop owns publication selection and retail pricing. */
function ya_online_catalog_projection(array $candidate): array
{
    $enabled = ($candidate['enabled'] ?? false) === true;
    $methods = [];
    if ($enabled) {
        $methods = $candidate['delivery_methods'] ?? null;
        if (!is_array($methods) || !array_is_list($methods) || count($methods) > 2
            || count(array_unique($methods, SORT_REGULAR)) !== count($methods)) throw new InvalidArgumentException('invalid_delivery_methods');
        foreach ($methods as $method) {
            if (!in_array($method, ['pickup', 'shipping'], true)) throw new InvalidArgumentException('invalid_delivery_methods');
        }
        $methods = array_values(array_intersect(['pickup', 'shipping'], $methods));
    }
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
            // Public storefront placement is independent of the product category and
            // the desktop's cash-register quick-access marker.
            $isFeatured = $raw['is_featured'] ?? false;
            $featuredOrder = $raw['featured_order'] ?? 0;
            if (!is_bool($isFeatured) || !is_int($featuredOrder)
                || $featuredOrder < 0 || $featuredOrder > 1000000) {
                throw new InvalidArgumentException('invalid_featured_product');
            }
            $imageUrl = ya_online_product_image_url($raw['image_url'] ?? '');
            $imageUrls = ya_online_product_image_urls($raw, $imageUrl);
            $products[$id] = [
                'product_id' => $id, 'category_id' => mb_substr(is_string($raw['category_id'] ?? null) ? $raw['category_id'] : '', 0, 180),
                'brand' => mb_substr(is_string($raw['brand'] ?? null) ? $raw['brand'] : '', 0, 160), 'name' => $name,
                'description' => mb_substr(is_string($raw['description'] ?? null) ? $raw['description'] : '', 0, 2000),
                'sku' => mb_substr(is_string($raw['sku'] ?? null) ? $raw['sku'] : '', 0, 80),
                'unit' => $unit, 'price' => $price, 'currency' => $currency, 'tax_rate' => $taxRate,
                'image_url' => $imageUrl, 'image_urls' => $imageUrls, 'availability' => 'available',
                'sort_order' => max(0, (int)($raw['sort_order'] ?? 0)),
                'is_featured' => $isFeatured, 'featured_order' => $featuredOrder
            ];
        }
    }
    $products = array_values($products);
    usort($products, static fn (array $a, array $b): int =>
        ($a['sort_order'] <=> $b['sort_order']) ?: strcmp($a['name'], $b['name']) ?: strcmp($a['product_id'], $b['product_id']));
    $categories = [];
    foreach (($candidate['categories'] ?? []) as $category) {
        if (!$enabled || !is_array($category) || !is_string($category['id'] ?? null) || !is_string($category['name'] ?? null)) continue;
        if (!in_array($category['id'], array_column($products, 'category_id'), true)) continue;
        $categories[] = ['id' => mb_substr($category['id'], 0, 180), 'name' => mb_substr($category['name'], 0, 180)];
    }
    return [
        'categories' => $categories,
        'localization' => ya_public_localization($candidate['localization'] ?? null, [
            'catalog_product' => ya_localization_records($products, 'product_id', ['name','description']),
            'catalog_category' => ya_localization_records($categories, 'id', ['name'])]),
        'version' => 1, 'enabled' => $enabled, 'delivery_methods' => $methods,
        'updated_at' => mb_substr(is_string($candidate['updated_at'] ?? null) ? $candidate['updated_at'] : '', 0, 64),
        'products' => $products
    ];
}

/** Shared publishable picture policy for public and private catalogs. */
function ya_online_catalog_image_url(string $imageUrl): string
{
    $image = parse_url($imageUrl);
    if (!is_array($image) || ($image['scheme'] ?? '') !== 'https'
        || isset($image['user']) || isset($image['pass']) || isset($image['query']) || isset($image['fragment'])
        || !str_contains($image['host'] ?? '', '.')
        || preg_match('/^[\d.:\[\]]+$/', $image['host'] ?? '') === 1
        || preg_match('/\.(local|localhost|internal|test)$/', $image['host'] ?? '') === 1) return '';
    return $imageUrl;
}
