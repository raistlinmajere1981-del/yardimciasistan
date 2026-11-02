<?php
declare(strict_types=1);

// Site-owned configuration. Public HTTP service only; never a sync secret or DB path.
return [
    // Explicit public HTTPS origin for canonical URLs/sitemap. Never inferred from Host.
    'public_origin' => getenv('YA_SITE_PUBLIC_ORIGIN') ?: '',
    'api_origin' => getenv('YA_SITE_API_ORIGIN') ?: '',
    'api_base_path' => '/yardimci-asistan',
    'base_path' => '',
    // Restrict/reorder existing pages; this cannot grant publication visibility.
    'page_order' => ['home', 'about', 'rooms', 'restaurant', 'menu', 'catalog', 'gallery', 'announcements', 'reviews', 'contact'],
    'hidden_pages' => [],
    // Legacy explicit slot => scene filename under public/assets/site/scenes/.
    // Opt-in static bindings live in public/assets/site/scenes/effects-manifest.json.
    // Empty and no manifest means zero engine requests.
    'effects' => [],
];
