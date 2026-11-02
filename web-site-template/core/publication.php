<?php
declare(strict_types=1);
namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }


function text(mixed $value): string { return is_string($value) ? trim($value) : ''; }
function records(mixed $value): array { return is_array($value) && array_is_list($value) ? array_values(array_filter($value, 'is_array')) : []; }
function published(array $record): bool
{
    foreach (['published', 'is_active', 'active', 'visible', 'is_available'] as $flag) {
        if (array_key_exists($flag, $record) && $record[$flag] !== true) return false;
    }
    return true;
}

function web_url(mixed $value): string
{
    $value = text($value);
    if ($value === '' || preg_match('/[\x00-\x20\x7f\\\\]/', $value)) return '';
    $parts = parse_url($value);
    return is_array($parts) && ($parts['scheme'] ?? '') === 'https' && !empty($parts['host'])
        && !isset($parts['user']) && !isset($parts['pass']) ? $value : '';
}

function media_url(mixed $value, string $modulePath): string
{
    $value = text($value);
    $decoded = rawurldecode($value);
    if (str_starts_with($value, $modulePath . '/media/') && !str_contains($decoded, '..')
        && !preg_match('/[\x00-\x1f\x7f\\\\]/', $decoded)
        && preg_match('~^/(?:[A-Za-z0-9_./-]|%[0-9a-fA-F]{2})+$~D', $value)) return $value;
    return web_url($value);
}

function translate_record(array $record, array $payload, string $type, string $id, string $language, array $fields): array
{
    foreach ($fields as $field) $record[$field] = localized_field($payload, $type, $id, $field, text($record[$field] ?? ''), $language);
    return $record;
}

/** The About view contains independently published information, not only prose. */
function has_business_details(array $publication): bool
{
    if (text($publication['about'] ?? '') !== '') return true;
    foreach (['policy_note', 'payment_note', 'check_in_time', 'check_out_time', 'breakfast_start_time', 'breakfast_end_time'] as $field) {
        if (text($publication['info'][$field] ?? '') !== '') return true;
    }
    foreach (['feature_ids', 'languages'] as $field) {
        foreach ($publication['info'][$field] ?? [] as $value) if (text($value) !== '') return true;
    }
    return false;
}

function named_records(mixed $value, array $payload, string $type, string $language, string $idKey = 'id'): array
{
    $result = [];
    foreach (records($value) as $item) {
        if (!published($item) || text($item[$idKey] ?? '') === '' || text($item['name'] ?? '') === '') continue;
        $result[] = translate_record($item, $payload, $type, $item[$idKey], $language, ['name', 'description', 'bed_info', 'price_note', 'area']);
    }
    return $result;
}

function public_timestamp(mixed $value): string
{
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/D', $value)) return '';
    try {
        $date = new \DateTimeImmutable($value);
        return $date->format('Y-m-d\TH:i:s') === substr($value, 0, 19) ? $date->format(\DateTimeInterface::ATOM) : '';
    } catch (\Exception) { return ''; }
}

function contact_projection(array $info): array
{
    $phone = text($info['phone'] ?? '');
    $number = preg_replace('/[\s().-]+/', '', $phone);
    $tel = preg_match('/^\+?[0-9]{7,15}$/D', $number) ? 'tel:' . $number : '';
    $email = filter_var(text($info['email'] ?? ''), FILTER_VALIDATE_EMAIL) ?: '';
    $whatsapp = preg_replace('/[\s()+.-]+/', '', text($info['whatsapp'] ?? ''));
    $whatsapp = ($info['whatsapp_enabled'] ?? false) === true && preg_match('/^[0-9]{7,15}$/D', $whatsapp) ? 'https://wa.me/' . $whatsapp : '';
    $address = text($info['address'] ?? '');
    $map = web_url($info['map_url'] ?? '');
    $embed = ''; $mapProvider = '';
    $mode = text($info['mapDisplayMode'] ?? 'manual');
    $lat = $info['latitude'] ?? null; $lon = $info['longitude'] ?? null;
    $hasPoint = $lat !== null && $lon !== null && $lat !== '' && $lon !== ''
        && is_numeric($lat) && is_numeric($lon)
        && is_finite((float) $lat) && is_finite((float) $lon)
        && abs((float) $lat) <= 90 && abs((float) $lon) <= 180;
    if ($mode === 'google_maps_embed') {
        $google = web_url($info['googleMapsEmbedUrl'] ?? '');
        $parts = $google !== '' ? parse_url($google) : false;
        if (is_array($parts) && in_array(strtolower($parts['host'] ?? ''), ['google.com', 'www.google.com'], true)
            && ($parts['path'] ?? '') === '/maps/embed' && strlen($google) <= 4096 && !isset($parts['port']) && !isset($parts['fragment'])) {
            parse_str($parts['query'] ?? '', $query);
            if (is_string($query['pb'] ?? null) && $query['pb'] !== '') {
                $embed = $google; $mapProvider = 'google';
                if ($map === '') $map = $google;
            }
        }
    } elseif ($hasPoint) {
        $latitude = (string) (float) $lat; $longitude = (string) (float) $lon;
        $point = $latitude . ',' . $longitude;
        // Embedded OSM map is presentational; directions are a separate link.
        $bbox = implode(',', [(float) $lon - 0.009, (float) $lat - 0.006, (float) $lon + 0.009, (float) $lat + 0.006]);
        $embed = 'https://www.openstreetmap.org/export/embed.html?bbox=' . rawurlencode($bbox)
            . '&layer=mapnik&marker=' . rawurlencode($point);
        $map = 'https://www.google.com/maps/dir/?api=1&destination=' . rawurlencode($point);
        $mapProvider = 'osm';
    }
    $social = array_values(array_filter(records($info['social_links'] ?? []), static fn (array $item): bool => web_url($item['url'] ?? '') !== '' && published($item)));
    return compact('phone', 'tel', 'email', 'whatsapp', 'address', 'map', 'embed', 'mapProvider', 'social') +
        ['available' => $tel !== '' || $email !== '' || $whatsapp !== '' || $address !== '' || $map !== '' || $embed !== '' || $social !== []];
}

/** Only public HTTP responses enter this projection. Profile names never grant a page. */
function project_publication(array $business, array $sources, string $modulePath, string $language): array
{
    $info = ($business['ok'] ?? false) === true && is_array($business['business'] ?? null) ? $business['business'] : [];
    if ($info === []) $sources = [];
    $surfaces = is_array($info['public_surfaces'] ?? null) ? $info['public_surfaces'] : [];
    $data = static fn (string $endpoint): array => $sources[$endpoint]['data'] ?? [];
    $has = static fn (string ...$names): bool => (bool) array_intersect($names, $surfaces);
    $info = translate_record($info, $business, 'business', text($business['localization']['business_id'] ?? $info['id'] ?? ''), $language,
        ['description', 'about_text', 'directions_note', 'policy_note', 'payment_note']);
    $roomsPayload = $data('rooms'); $tablesPayload = $data('tables'); $catalogPayload = $data('catalog'); $menuPayload = $data('menu');
    $rooms = $has('rooms', 'accommodation') && ($roomsPayload['enabled'] ?? false) === true ? named_records($roomsPayload['rooms'] ?? [], $roomsPayload, 'room', $language) : [];
    $tables = $has('restaurant', 'tables', 'food_service') && ($tablesPayload['enabled'] ?? false) === true ? named_records($tablesPayload['tables'] ?? [], $tablesPayload, 'table', $language) : [];
    $products = $has('store', 'catalog', 'online_sales') && ($catalogPayload['enabled'] ?? false) === true ? named_records($catalogPayload['products'] ?? [], $catalogPayload, 'catalog_product', $language, 'product_id') : [];
    $categories = $has('qr_menu', 'menu') && ($menuPayload['ok'] ?? false) === true && ($menuPayload['enabled'] ?? true) === true
        ? named_records($menuPayload['categories'] ?? [], $menuPayload, 'menu_category', $language) : [];
    $categoryIds = array_column($categories, 'id');
    $menu = array_values(array_filter(named_records($menuPayload['items'] ?? [], $menuPayload, 'menu_product', $language),
        static fn (array $item): bool => in_array($item['category_id'] ?? '', $categoryIds, true)));
    $gallery = [];
    foreach (records($info['gallery'] ?? []) as $image) {
        $url = media_url($image['url'] ?? '', $modulePath);
        if ($url === '' || !published($image)) continue;
        $image = translate_record($image, $business, 'gallery', text($image['id'] ?? ''), $language, ['title']);
        $gallery[] = ['url' => $url, 'title' => $image['title'], 'id' => text($image['id'] ?? '')];
    }
    $marketingPayload = $data('marketing'); $announcements = [];
    foreach (records(($marketingPayload['enabled'] ?? true) === false ? [] : ($marketingPayload['publications'] ?? [])) as $item) {
        if (!published($item) || ($item['published'] ?? false) !== true || ($item['channel'] ?? '') !== 'website'
            || text($item['title'] ?? '') === '') continue;
        $announcements[] = translate_record($item, $marketingPayload, 'marketing', text($item['id'] ?? ''), $language, ['title', 'text']);
    }
    $reviewsPayload = $data('google-reviews');
    $reviews = ($info['google_reviews_enabled'] ?? false) === true && ($reviewsPayload['available'] ?? false) === true
        ? array_values(array_filter(records($reviewsPayload['reviews'] ?? []), 'YaSite\\published')) : [];
    $requests = ($info['requests_enabled'] ?? false) === true;
    $requestTypes = $requests && is_array($info['request_types'] ?? null) ? $info['request_types'] : [];
    $rawFields = $business['business_publication']['fields'] ?? [];
    $publishedFields = ($business['business_publication']['enabled'] ?? false) === true && is_array($rawFields)
        ? array_values(array_intersect(array_filter($rawFields, 'is_string'), ['business_name','description','phone','email','address','gallery','social_links'])) : [];
    return ['identity_published' => in_array('business_name', $publishedFields, true) && text($info['display_name'] ?? '') !== '',
        'published_business_fields' => $publishedFields, 'name' => text($info['display_name'] ?? ''), 'description' => $info['description'], 'about' => $info['about_text'],
        'info' => $info, 'contact' => contact_projection($info), 'rooms' => $rooms, 'tables' => $tables, 'products' => $products,
        'menu' => $menu, 'menu_updated_at' => $menu !== [] ? public_timestamp($menuPayload['updated_at'] ?? '') : '', 'categories' => $categories, 'gallery' => $gallery, 'announcements' => $announcements, 'reviews' => $reviews,
        'features' => ['chat' => ($info['ai_enabled'] ?? false) === true, 'requests' => $requests,
            'traffic' => ($info['traffic_enabled'] ?? false) === true,
            'room_requests' => $rooms !== [] && in_array('pension_reservation', $requestTypes, true),
            'table_requests' => $tables !== [] && in_array('restaurant_reservation', $requestTypes, true),
            'dealer_application' => in_array('dealer_application', $requestTypes, true) && ($info['dealer_application_enabled'] ?? false) === true,
            'account' => ($data('account/config')['enabled'] ?? false) === true,
            'orders' => $products !== [] && ($catalogPayload['delivery_methods'] ?? []) !== [],
            'availability' => $rooms !== []]];
}
