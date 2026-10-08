<?php
declare(strict_types=1);
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src https:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
?>
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mağaza</title>
  <link rel="stylesheet" href="storefront.css">
  <script src="storefront.js" defer></script>
</head>
<body class="storefront-standalone">
<main><?php require __DIR__ . '/storefront.php'; ?></main>
</body>
</html>
