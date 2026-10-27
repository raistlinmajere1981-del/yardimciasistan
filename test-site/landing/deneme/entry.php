<?php
declare(strict_types=1);
if (basename(__FILE__) !== 'index.php' && !isset($templateRoot)) { http_response_code(404); exit; }
$templateRoot = $templateRoot ?? dirname(__DIR__);
// Source discovery never reads business APIs, runs AI or accepts writes.
if (($_GET['resource'] ?? '') === 'translation-source') {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') { http_response_code(405); header('Allow: GET'); exit; }
    require_once $templateRoot . '/core/i18n.php';
    echo json_encode(\YaSite\source_catalog($templateRoot), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
require_once $templateRoot . '/core/bootstrap.php';
$application = \YaSite\bootstrap($templateRoot);
$site = $application['site']; $view = $application['view'];
if (($_GET['resource'] ?? '') === 'sitemap' || parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) === $site['base_path'] . '/sitemap.xml') {
    header('Content-Type: application/xml; charset=utf-8'); header('Cache-Control: no-cache'); header('X-Content-Type-Options: nosniff');
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') { http_response_code(405); header('Allow: GET'); exit; }
    if ($site['public_origin'] === '' || $view['status'] !== 'ok') http_response_code(503);
    echo \YaSite\sitemap_xml($site, $view); exit;
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
if (isset($_GET['lang'])) setcookie('ya_site_language', $site['language']['code'], [
    'expires' => time() + 31536000, 'path' => $site['language_cookie_path'],
    'secure' => ($_SERVER['HTTPS'] ?? '') === 'on', 'httponly' => true, 'samesite' => 'Lax',
]);
if ($view['page'] === 'missing') http_response_code(404);
\YaSite\render_view('layout', $view, $site);
