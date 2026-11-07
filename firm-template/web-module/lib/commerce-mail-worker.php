<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/customer-account.php';
require_once __DIR__ . '/commerce-mail.php';
try {
    if (!ya_mail_transport_configured()) throw new RuntimeException('mail_unconfigured');
    echo json_encode(ya_commerce_mail_run(ya_storage_open(), 'ya_mail_send'), JSON_THROW_ON_ERROR) . PHP_EOL;
} catch (Throwable) {
    // No recipients, bodies, credentials or exception text in cron output.
    fwrite(STDERR, "commerce_mail_worker_unavailable\n");
    exit(1);
}
