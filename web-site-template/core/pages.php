<?php
declare(strict_types=1);
namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }


/** Host-owned information architecture; API projections own availability. */
function page_registry(): array
{
    return [
        'home' => ['key' => 'page.home', 'data' => null],
        'about' => ['key' => 'page.about', 'data' => 'about'],
        'rooms' => ['key' => 'page.rooms', 'data' => 'rooms'],
        'restaurant' => ['key' => 'page.restaurant', 'data' => 'tables'],
        'menu' => ['key' => 'page.menu', 'data' => 'menu'],
        'catalog' => ['key' => 'page.catalog', 'data' => 'products'],
        'gallery' => ['key' => 'page.gallery', 'data' => 'gallery'],
        'announcements' => ['key' => 'page.announcements', 'data' => 'announcements'],
        'reviews' => ['key' => 'page.reviews', 'data' => 'reviews'],
        'contact' => ['key' => 'page.contact', 'data' => 'contact'],
        'account' => ['key' => 'page.account', 'data' => null],
    ];
}

function available_pages(array $publication, array $config, ?string $root = null): array
{
    $registry = page_registry(); $pages = [];
    // Extensions are explicitly site-owned editorial pages. They cannot replace a
    // publication page or evaluate arbitrary callbacks from public data.
    foreach ($config['extensions'] ?? [] as $id => $definition) {
        if (!is_string($id) || !preg_match('/^[a-z]+(?:-[a-z]+)*$/D', $id) || isset($registry[$id])
            || !is_array($definition) || ($definition['editorial'] ?? false) !== true
            || !is_string($definition['key'] ?? null) || !str_starts_with($definition['key'], 'theme.')
            || $root === null || !is_file($root . '/site/views/pages/' . $id . '.php')) continue;
        $registry[$id] = ['key' => $definition['key'], 'data' => null, 'editorial' => true];
    }
    $order = array_unique(array_merge(['home'], $config['page_order'] ?? [], array_keys($registry)));
    foreach ($order as $id) {
        if (!is_string($id) || !isset($registry[$id])) continue;
        if ($id !== 'home' && in_array($id, $config['hidden_pages'] ?? [], true)) continue;
        $definition = $registry[$id];
        if ($id === 'home' || !empty($definition['editorial'])) {
            $available = true;
        } elseif ($id === 'account') {
            $available = ($publication['features']['account'] ?? false) === true;
        } elseif ($id === 'contact') {
            $available = $publication['contact']['available'];
        } elseif ($id === 'about') {
            $available = has_business_details($publication);
        } else {
            $available = !empty($publication[$definition['data']]);
        }
        if ($available) $pages[$id] = $definition;
    }
    return $pages;
}
