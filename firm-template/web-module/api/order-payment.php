<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/commerce-order-payment.php';
require_once __DIR__ . '/../lib/public-request-guard.php';
header('Cache-Control: no-store');header('Referrer-Policy: no-referrer');
try {
    ya_public_guard_enforce('order_payment');
    if(ya_account_token()!=='' || ya_account_token('ya_account_refresh')!=='')ya_account_require_post();
    elseif(($_SERVER['HTTP_X_YA_ACCOUNT']??'')!=='1' || in_array($_SERVER['HTTP_SEC_FETCH_SITE']??'', ['cross-site','same-site'],true))throw new YaAccountError(403,'csrf_failed');
    // Guest ownership is the per-order bearer. SMTP/account URL configuration is not required.
    $input=ya_account_input();
    if(!in_array($input['action']??'', ['read','report'],true))throw new YaAccountError(422,'invalid_action');
    $db=ya_storage_open();$db->exec('BEGIN IMMEDIATE');
    try {
        $order=ya_commerce_require_order_owner($db,$input);
        $result=$input['action']==='report'?ya_commerce_report_payment($db,$order):ya_commerce_order_state($order);
        $db->exec('COMMIT');
    }catch(Throwable $error){$db->exec('ROLLBACK');throw $error;}
    ya_account_response(200,['ok'=>true,'order'=>$result]);
}catch(YaAccountError $error){ya_account_response($error->status,['ok'=>false,'code'=>$error->reason]);}
catch(Throwable){ya_account_response(503,['ok'=>false,'code'=>'order_unavailable']);}
