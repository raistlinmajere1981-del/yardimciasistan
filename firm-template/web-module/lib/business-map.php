<?php
declare(strict_types=1);

/** Website-only embed allowlist; canonical location is independent. */
function ya_business_google_maps_embed_url(mixed $value): string
{
    if (!is_string($value)) return '';
    $raw = trim($value);
    if ($raw === '' || strlen($raw) > 4096 || preg_match('/[<>\\\\\s]/', $raw)) return '';
    $url = parse_url($raw);
    if (!is_array($url) || ($url['scheme'] ?? '') !== 'https'
        || !in_array(strtolower($url['host'] ?? ''), ['google.com', 'www.google.com'], true)
        || ($url['path'] ?? '') !== '/maps/embed'
        || isset($url['user']) || isset($url['pass']) || isset($url['port']) || isset($url['fragment'])) return '';
    parse_str($url['query'] ?? '', $query);
    if (!is_string($query['pb'] ?? null) || $query['pb'] === '') return '';
    return $raw;
}
