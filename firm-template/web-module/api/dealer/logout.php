<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/customer-account.php';
try { ya_account_require_post(); ya_account_logout(); ya_account_response(200, ['ok' => true]); }
catch (YaAccountError $error) { ya_account_response($error->status, ['ok' => false, 'code' => $error->reason]); }
catch (Throwable) { ya_account_response(503, ['ok' => false]); }
