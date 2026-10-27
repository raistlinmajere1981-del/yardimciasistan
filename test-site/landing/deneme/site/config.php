<?php
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }


$origin = getenv('YA_SITE_API_ORIGIN') ?: 'https://yardimciasistan.alwaysdata.net';

return [
  'api_origin' => $origin,
  // Only this same-host demonstration uses the existing PHP public endpoints
  // through CLI: Alwaysdata's single CGI worker cannot HTTP-loop to itself.
  'local_api_root' => dirname(__DIR__, 2) . '/yardimci-asistan',
  'php_cli_binary' => '/usr/bin/php',
  'demo_widget_visible' => true,
  'api_base_path' => '/yardimci-asistan',
  'base_path' => '/deneme',
  'language_cookie_path' => '',
  'page_order' => ['home', 'about', 'rooms', 'restaurant', 'menu', 'catalog', 'gallery', 'announcements', 'reviews', 'contact'],
  'hidden_pages' => [],
  'effects' => [],
];
