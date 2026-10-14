import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const php = readFileSync("firm-template/web-module/api/sync.php", "utf8");
const body = name => {
  const start = php.indexOf(`function ${name}(`); assert.ok(start >= 0, name);
  const end = php.indexOf("\nfunction ", start + 1); assert.ok(end > start, name); return php.slice(start, end);
};
const functions = ["ya_sync_enqueue_android_action", "ya_sync_android_action_types", "ya_sync_android_permissions",
  "ya_sync_android_management_action_permission", "ya_sync_android_action_permission", "ya_sync_android_action_capability_allowed",
  "ya_sync_android_capabilities_include", "ya_sync_android_folio_charge_permissions_allowed", "ya_sync_android_market_financial_permissions_allowed",
  "ya_sync_android_financial_intent_matches", "ya_sync_public_android_action", "ya_sync_empty_android_market", "ya_sync_sanitize_android_market",
  "ya_sync_sanitize_android_credit_accounts", "ya_sync_android_market_for_permissions", "ya_sync_sanitize_business_capabilities",
  "ya_sync_commerce_unit", "ya_sync_string", "ya_sync_string_array", "ya_sync_bool", "ya_sync_int", "ya_sync_float"];
const root = mkdtempSync(join(tmpdir(), "yardimci-mobile-hosting-"));
mkdirSync(join(root, "lib"));
for (const file of ["storage.php", "android-device-auth.php"]) copyFileSync(`firm-template/web-module/lib/${file}`, join(root, "lib", file));
try {
  for (const personal of [true, false]) {
    const program = `
require ${JSON.stringify(join(root, "lib", "android-device-auth.php"))};
define('YA_ANDROID_DEVICE_AUTHENTICATED', ${personal ? "true" : "false"});
${functions.map(body).join("\n")}
class FixtureResponse extends Exception { public function __construct(public int $status, public array $body) { parent::__construct('fixture_response'); } }
function ya_sync_response(int $status, array $body): void { throw new FixtureResponse($status, $body); }
function ya_sync_load_android_snapshot(): array { return $GLOBALS['snapshot']; }
function ya_sync_update_state(array $changes): void {}
function check(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
function enqueue(string $id, string $type, array $payload): FixtureResponse {
    try { ya_sync_enqueue_android_action(['action_id' => $id, 'action_type' => $type, 'device_id' => 'mobile-fixture-device', 'payload' => $payload]); }
    catch (FixtureResponse $response) { return $response; }
    throw new RuntimeException('missing_response');
}
$caps = ['service.android','commerce.catalog','commerce.inventory','commerce.sales','retail.barcode','commerce.customer_credit','core.customers','core.finance'];
$permissions = ['market.product.view','market.sale.complete','customer_credit.view','customer_credit.payment','market.cart_draft'];
$GLOBALS['snapshot'] = ['business_capabilities' => $caps, 'androidPermissions' => ['mobile-fixture-device' => ['role'=>'staff','is_active'=>true,'permissions'=>$permissions]]];
check(in_array('commerce.customer_credit', ya_sync_sanitize_business_capabilities($caps), true), 'credit_manifest');
check(in_array('market_sale_complete', ya_sync_android_action_types(), true), 'sale_whitelist');
check(in_array('customer_credit_payment_add', ya_sync_android_action_types(), true), 'payment_whitelist');
check(ya_sync_android_action_permission('unknown', []) === '', 'unknown_permission');
$sale = ['lines'=>[['product_id'=>'product-one','quantity'=>2.5,'expected_unit_price'=>12.5,'expected_currency'=>'TRY','expected_updated_at'=>'version']],
    'settlement'=>'paid','payment_method'=>'cash','customer_id'=>'','location_id'=>'stock-main','external_payment_confirmed'=>false];
$payment = ['customer_id'=>'customer-one','amount_minor'=>1234,'currency'=>'TRY','expected_balance_minor'=>5000,'payment_method'=>'cash'];
foreach (['market_sale_complete','customer_credit_payment_add'] as $type) {
    check(ya_sync_android_action_capability_allowed($type, $type === 'market_sale_complete' ? $sale : $payment, $snapshot), 'cap_allowed');
}
foreach (['service.android','commerce.catalog','commerce.sales','retail.barcode','commerce.customer_credit','core.customers','core.finance'] as $cap) {
    $missing = ['business_capabilities'=>array_values(array_diff($caps, [$cap]))];
    check(!ya_sync_android_action_capability_allowed('customer_credit_payment_add', $payment, $missing), 'missing_payment_cap');
    check(!ya_sync_android_action_capability_allowed('market_sale_complete', [...$sale,'settlement'=>'credit'], $missing), 'missing_credit_cap');
}
$market = ya_sync_sanitize_android_market(['primary_location_id'=>'stock-main','products'=>[['id'=>'product-one','name'=>'Ürün','updated_at'=>'version','sale_price'=>12.5]],
    'customer_credit_accounts'=>[['customer_id'=>'customer-one','full_name'=>'Cari Müşterisi','phone'=>'PRIVATE','identity_number'=>'PRIVATE',
      'balances'=>[['currency'=>'TRY','amount_minor'=>5000],['currency'=>'EUR','amount_minor'=>1200]],
      'entries'=>[['direction'=>'debit','entry_type'=>'credit_sale','amount_minor'=>5000,'currency'=>'TRY','payment_method'=>'','occurred_at'=>'2026-10-14T12:00:00Z','note'=>'PRIVATE','sale_detail'=>['private'=>true]]]]]]);
check(!str_contains(json_encode($market), 'PRIVATE'), 'projection_allowlist');
check($market['products'][0]['updated_at'] === 'version', 'product_version');
$private = ya_sync_android_market_for_permissions($market, $permissions, $caps, true);
check(count($private['customer_credit_accounts']) === 1, 'authorized_credit');
check(count($private['customer_credit_accounts'][0]['balances']) === 2, 'separate_currencies');
foreach ([[[], $caps, true], [$permissions, array_values(array_diff($caps,['commerce.customer_credit'])), true], [$permissions,$caps,false]] as $case) {
    check(ya_sync_android_market_for_permissions($market, ...$case)['customer_credit_accounts'] === [], 'redacted_credit');
}
check(!ya_sync_android_market_financial_permissions_allowed('market_sale_complete', [...$sale,'settlement'=>'credit'], array_diff($permissions,['customer_credit.view'])), 'credit_view_required');
$token = ya_android_auth_issue_token('mobile-fixture-device');
check(ya_android_auth_personal_request_authorized(['HTTP_X_YA_DEVICE_ID'=>'mobile-fixture-device','HTTP_X_YA_DEVICE_TOKEN'=>$token], 'mobile-fixture-device'), 'valid_device_token');
check(!ya_android_auth_personal_request_authorized(['HTTP_X_YA_DEVICE_ID'=>'mobile-fixture-device','HTTP_X_YA_DEVICE_TOKEN'=>'fixture-shared-secret'], 'mobile-fixture-device'), 'shared_secret_denied');
$first = enqueue('mobile_financial_sale_001', 'market_sale_complete', $sale);
if (!YA_ANDROID_DEVICE_AUTHENTICATED) {
    check($first->status === 403, 'personal_sale_required');
    check(enqueue('mobile_financial_pay_001', 'customer_credit_payment_add', $payment)->status === 403, 'personal_payment_required');
} else {
    check($first->status === 201 && $first->body['action']['status'] === 'pending', 'queued_never_applied');
    check(enqueue('mobile_financial_sale_001', 'market_sale_complete', $sale)->body['deduplicated'] === true, 'duplicate_queue');
    check(enqueue('mobile_financial_sale_001', 'market_sale_complete', [...$sale,'payment_method'=>'bank'])->status === 409, 'mismatched_sale');
    check(enqueue('mobile_financial_sale_001', 'market_cart_draft_create', ['lines'=>[['product_id'=>'product-one','quantity'=>1]]])->status === 409, 'old_type_collision');
    check(enqueue('mobile_financial_pay_001', 'customer_credit_payment_add', $payment)->status === 201, 'payment_queued');
    check(enqueue('mobile_financial_pay_001', 'customer_credit_payment_add', [...$payment,'amount_minor'=>1])->status === 409, 'mismatched_payment');
    check(enqueue('mobile_financial_card_001', 'market_sale_complete', [...$sale,'payment_method'=>'card'])->status === 422, 'external_card_confirmation');
    $snapshot['androidPermissions']['mobile-fixture-device']['permissions'] = array_values(array_diff($permissions,['customer_credit.payment']));
    check(enqueue('mobile_financial_pay_002', 'customer_credit_payment_add', $payment)->status === 403, 'read_cannot_collect');
    $snapshot['androidPermissions']['mobile-fixture-device']['permissions'] = array_values(array_diff($permissions,['customer_credit.view']));
    check(enqueue('mobile_financial_credit_001', 'market_sale_complete', [...$sale,'settlement'=>'credit','customer_id'=>'customer-one','payment_method'=>''])->status === 403, 'sale_credit_view_required');
    $snapshot['androidPermissions']['mobile-fixture-device']['permissions'] = $permissions;
    $snapshot['business_capabilities'] = array_values(array_diff($caps,['commerce.customer_credit']));
    check(enqueue('mobile_financial_pay_003', 'customer_credit_payment_add', $payment)->status === 403, 'disabled_capability');
    $snapshot['business_capabilities'] = $caps; $snapshot['androidPermissions']['mobile-fixture-device']['is_active'] = false;
    check(enqueue('mobile_financial_sale_002', 'market_sale_complete', $sale)->status === 403, 'inactive_device');
    check(enqueue('mobile_financial_unknown_001', 'unknown_action', [])->status === 422, 'unknown_action');
    check(ya_storage_open()->query('SELECT COUNT(*) FROM android_actions')->fetchColumn() == 2, 'only_authorized_immutable_queue');
}
echo 'hosting-mobile-fixture-ok';
`;
    const result = spawnSync("php", ["-r", program], { encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, "hosting-mobile-fixture-ok");
  }
  console.log("market-android-sales-hosting-smoke-ok: real PHP/SQLite queue, personal tokens, roles, capabilities, pending results, mismatch rejection and private projections");
} finally { rmSync(root, { recursive: true, force: true }); }
