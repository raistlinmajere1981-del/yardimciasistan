<?php
declare(strict_types=1);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
?>
<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bayi paneli</title><link rel="stylesheet" href="../magaza/storefront.css"><link rel="stylesheet" href="portal.css"><script src="portal.js" defer></script></head>
<body><main class="shell dealer-shell"><section class="state" aria-labelledby="portal-title">
<p class="eyebrow">Bayi erişimi</p><h1 id="portal-title">Bayi erişimi gerekli</h1>
<p id="dealer-name" hidden></p><p id="portal-message" role="status" aria-live="polite">Erişim durumunuz kontrol ediliyor…</p>
<button id="claim" type="button" hidden>Daveti kullan</button><button id="logout" class="secondary" type="button" hidden>Oturumu kapat</button>
</section></main></body></html>
