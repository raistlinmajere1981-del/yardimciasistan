<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/inc/language.php';
// Keep bookmarks and incoming links working; installation now belongs to the home page.
header('Location: /?lang=' . rawurlencode(site_language()) . '#kurulum', true, 301);
exit;
