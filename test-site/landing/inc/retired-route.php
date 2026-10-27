<?php
declare(strict_types=1);
function redirect_demo_route(string $page): never
{
    $query = ['page' => $page];
    foreach (['lang', 'id', 'account_error', 'action'] as $key) {
        $value = $_GET[$key] ?? null;
        if (is_string($value) && strlen($value) <= 180) $query[$key] = $value;
    }
    header('Cache-Control: no-cache');
    header('Location: /deneme/?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986), true, 308);
    exit;
}
