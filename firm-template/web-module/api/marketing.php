<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/marketing.php';
$config = json_decode((string) @file_get_contents(__DIR__ . '/../config/business.json'), true) ?: [];
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
$allowed = $config['allowed_origins'] ?? [];
if ($origin !== '' && (in_array($origin, $allowed, true) || in_array('*', $allowed, true))) {
    header('Access-Control-Allow-Origin: ' . (in_array('*', $allowed, true) ? '*' : $origin)); header('Vary: Origin');
}
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff'); header('Cache-Control: no-store');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') { http_response_code(405); header('Allow: GET, OPTIONS'); echo '{"ok":false}'; exit; }
try { echo json_encode(['ok' => true, 'publications' => ya_marketing_publications()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
catch (Throwable $error) { http_response_code(503); echo '{"ok":false,"publications":[]}'; }
