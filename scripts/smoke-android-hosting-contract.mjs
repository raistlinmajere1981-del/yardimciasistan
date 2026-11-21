import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { ANDROID_ACTION_TYPES, ANDROID_PERMISSIONS } = require("../packages/sync-core/dist/index.js");
const php = readFileSync(join(process.cwd(), "firm-template", "web-module", "api", "sync.php"), "utf8");

const actionBody = functionBody("ya_sync_android_action_types");
const permissionBody = functionBody("ya_sync_android_permissions");
const phpActions = quotedValues(actionBody);
const phpPermissions = quotedValues(permissionBody);

assert.deepEqual(
  [...phpActions].sort(),
  [...ANDROID_ACTION_TYPES].sort(),
  "PHP hosting Android action listesi sync-core ile aynı kalmalı"
);
assert.deepEqual(
  [...phpPermissions].sort(),
  [...ANDROID_PERMISSIONS].sort(),
  "PHP hosting Android izin listesi sync-core ile aynı kalmalı"
);

// Execute the production policy/projection functions without opening a HTTP socket.
const pureFunctions = ["ya_sync_android_action_permission", "ya_sync_android_action_capability_allowed",
  "ya_sync_android_capabilities_include", "ya_sync_android_folio_charge_permissions_allowed",
  "ya_sync_android_qr_permissions_allowed", "ya_sync_android_snapshot_record",
  "ya_sync_sanitize_android_request", "ya_sync_sanitize_android_qr_preview",
  "ya_sync_android_customer_commercial_profile", "ya_sync_sanitize_android_customers",
  "ya_sync_sanitize_android_reservations",
  "ya_sync_empty_android_market", "ya_sync_sanitize_android_market",
  "ya_sync_sanitize_android_replenishment", "ya_sync_android_market_for_permissions",
  "ya_sync_sanitize_android_credit_accounts", "ya_sync_commerce_unit", "ya_sync_float",
  "ya_sync_android_menu_for_permissions", "ya_sync_sanitize_android_room_folios",
  "ya_sync_string_array", "ya_sync_customer_identity_type", "ya_sync_customer_gender",
  "ya_sync_iso_date_or_empty", "ya_sync_string", "ya_sync_bool", "ya_sync_int"];
const policy = spawnSync("php", ["-r", `
${pureFunctions.map(functionBody).join("\n")}
$caps = ['service.android', 'accommodation.folio', 'accommodation.stays', 'food_service.menu'];
$permissions = ['room_folio.view', 'room_folio.add_menu_item', 'room_folio.add_manual_charge', 'menu.view'];
$results = [];
foreach (['room_folio_menu_item_add', 'room_folio_manual_charge_add'] as $type) {
    $results[$type] = ['permission' => ya_sync_android_action_permission($type, []),
        'allowed' => ya_sync_android_action_capability_allowed($type, [], ['business_capabilities' => $caps]),
        'visible' => ya_sync_android_folio_charge_permissions_allowed($type, $permissions), 'missing' => []];
    foreach (['accommodation.folio', 'accommodation.stays', ...($type === 'room_folio_menu_item_add' ? ['food_service.menu'] : [])] as $cap) {
        $results[$type]['missing'][] = ya_sync_android_action_capability_allowed($type, [],
            ['business_capabilities' => array_values(array_diff($caps, [$cap]))]);
    }
    $results[$type]['no_view'] = ya_sync_android_folio_charge_permissions_allowed($type, array_diff($permissions, ['room_folio.view']));
    $results[$type]['no_menu'] = ya_sync_android_folio_charge_permissions_allowed($type, array_diff($permissions, ['menu.view']));
}
$menu = ['categories' => [['id' => 'category']], 'items' => [['id' => 'entry', 'product_id' => 'product',
    'price' => 9.87, 'currency' => 'TRY', 'stock_quantity' => 5, 'stock_consumption_quantity' => 0.125]], 'updated_at' => 'version'];
$qrItems = [['name'=>'Çay','menu_entry_id'=>'private-menu','quantity'=>2,
    'note'=>'Az şeker','unit_price'=>19.50,'currency'=>'TRY']];
$qrTable = ['id'=>'qr-c-table','request_type'=>'table_order','status'=>'new',
    'customer_name'=>'Test','table_id'=>'table-1','created_at'=>'2026-11-20T10:00:00Z',
    'updated_at'=>'2026-11-20T10:00:00Z','order_token_hash'=>'never-leak',
    'order_items'=>$qrItems];
$qrRoom = ['id'=>'qr-c-room','request_type'=>'room_order','status'=>'new',
    'customer_name'=>'Misafir','room_id'=>'room-1','updated_at'=>'2026-11-20T10:01:00Z',
    'order_items'=>$qrItems,'order_token_hash'=>'secret-room-token'];
$results['qr_table']=ya_sync_sanitize_android_request($qrTable);
$results['qr_room']=ya_sync_sanitize_android_request($qrRoom);
$qrCaps=['service.android','core.customers','customer.requests','channel.qr_menu',
    'food_service.menu','food_service.orders','food_service.tables',
    'accommodation.rooms','accommodation.stays','accommodation.folio'];
$qrSnapshot=['business_capabilities'=>$qrCaps,'requests'=>[$results['qr_table'],$results['qr_room']]];
$qrPermissions=['table_order.add_item','table_order.view','room_folio.add_menu_item',
    'room_folio.view','customer.reject','menu.view'];
$qrTableAction=['request_id'=>'qr-c-table','expected_updated_at'=>'2026-11-20T10:00:00Z'];
$qrRoomAction=['request_id'=>'qr-c-room','expected_updated_at'=>'2026-11-20T10:01:00Z'];
$qrPolicy=[
  'table_accept'=>ya_sync_android_action_capability_allowed('qr_table_order_accept',$qrTableAction,$qrSnapshot),
  'room_accept'=>ya_sync_android_action_capability_allowed('qr_room_order_accept',$qrRoomAction,$qrSnapshot),
  'reject'=>ya_sync_android_action_capability_allowed('qr_order_reject',$qrRoomAction,$qrSnapshot),
  'wrong_kind'=>ya_sync_android_action_capability_allowed('qr_room_order_accept',$qrTableAction,$qrSnapshot),
  'stale'=>ya_sync_android_action_capability_allowed('qr_table_order_accept',
      ['request_id'=>'qr-c-table','expected_updated_at'=>'stale'],$qrSnapshot),
  'extra_field'=>ya_sync_android_action_capability_allowed('qr_order_reject',
      [...$qrRoomAction,'status'=>'approved'],$qrSnapshot),
  'no_qr_capability'=>ya_sync_android_action_capability_allowed('qr_table_order_accept',
      $qrTableAction,['business_capabilities'=>array_values(array_diff($qrCaps,['channel.qr_menu'])),'requests'=>$qrSnapshot['requests']]),
  'table_permissions'=>ya_sync_android_qr_permissions_allowed('qr_table_order_accept',$qrTableAction,$qrPermissions,$qrSnapshot),
  'room_permissions'=>ya_sync_android_qr_permissions_allowed('qr_room_order_accept',$qrRoomAction,$qrPermissions,$qrSnapshot),
  'no_view'=>ya_sync_android_qr_permissions_allowed('qr_table_order_accept',$qrTableAction,array_diff($qrPermissions,['table_order.view']),$qrSnapshot),
  'no_menu'=>ya_sync_android_qr_permissions_allowed('qr_room_order_accept',$qrRoomAction,array_diff($qrPermissions,['menu.view']),$qrSnapshot)
];
$results['qr_policy']=$qrPolicy;
$results['commercial_customers']=ya_sync_sanitize_android_customers([[
    'id'=>'retail-commercial','full_name'=>'Test Firma','phone'=>'','updated_at'=>'now',
    'commercial_profile'=>['company_name'=>'Ticari Firma','tax_office'=>'Çankaya',
        'tax_number'=>'1234567890','authorized_person'=>'Veli',
        'dealer_status'=>'active','price_group'=>'dealer_b','payment_term_days'=>45,
        'secret_token'=>'do-not-copy','private_extra'=>'never']
],[
    'id'=>'ordinary','full_name'=>'Gerçek Kişi','updated_at'=>'now',
    'commercial_profile'=>null
]]);
$rawMarket=[
  'categories'=>[['id'=>'cat-1','name'=>'İçecekler','default_tax_rate'=>10,'secret'=>'hide']],
  'replenishment'=>['truncated'=>false,'rows'=>[
    ['product_id'=>'product-1','name'=>'Çay','sku'=>'SKU-1',
     'category_id'=>'cat-1','category_name'=>'İçecekler','unit'=>'piece',
     'quantity'=>15,'minimum_quantity'=>10,'ideal_quantity'=>25,'suggested_quantity'=>10,
     'private_location_balance'=>9999],
    ['product_id'=>'product-bad','name'=>'Bad','category_id'=>'cat-1','unit'=>'piece',
     'quantity'=>20,'minimum_quantity'=>5,'ideal_quantity'=>10,'suggested_quantity'=>-10]
  ]]
];
$marketPublic=ya_sync_sanitize_android_market($rawMarket);
$marketCapabilities=['service.android','commerce.catalog','commerce.inventory'];
$results['market_full']=ya_sync_android_market_for_permissions($marketPublic,
    ['market.product.view','market.product_create'],$marketCapabilities);
$results['market_no_inventory']=ya_sync_android_market_for_permissions($marketPublic,
    ['market.product.view','market.product_create'],['service.android','commerce.catalog']);
$results['market_no_product_view']=ya_sync_android_market_for_permissions($marketPublic,
    ['market.product_create'],$marketCapabilities);
$results['market_no_product_create']=ya_sync_android_market_for_permissions($marketPublic,
    ['market.product.view'],$marketCapabilities);
$rawMarket['replenishment']['truncated']=true;
$results['market_truncated']=ya_sync_sanitize_android_market($rawMarket)['replenishment'];
$results['reservation_durations']=ya_sync_sanitize_android_reservations([
    ['id'=>'t30','reservation_type'=>'table','time'=>'19:00',
        'duration_minutes'=>30,'private_calendar_token'=>'SECRET',
        'start_date'=>'2036-05-20','table_ids'=>['table-a']],
    ['id'=>'t480','reservation_type'=>'breakfast','time'=>'09:00',
        'duration_minutes'=>480],
    ['id'=>'legacy','reservation_type'=>'table','time'=>'20:00'],
    ['id'=>'invalid','reservation_type'=>'table','duration_minutes'=>900],
    ['id'=>'room','reservation_type'=>'room','duration_minutes'=>360]
]);
$results['hidden_menu'] = ya_sync_android_menu_for_permissions($menu, false, false);
$results['no_stock'] = ya_sync_android_menu_for_permissions($menu, true, false);
$results['stock'] = ya_sync_android_menu_for_permissions($menu, true, true);
$results['folio'] = ya_sync_sanitize_android_room_folios([['id' => 'folio', 'stay_id' => 'stay', 'room_id' => 'room',
    'version' => str_repeat('a', 64), 'can_add_items' => true, 'currency' => 'USD', 'remaining_minor' => 12345]]);
echo json_encode($results, JSON_THROW_ON_ERROR);
`], { encoding: "utf8", timeout: 10000 });
assert.equal(policy.status, 0, policy.stderr);
const projected = JSON.parse(policy.stdout);
for (const [type, permission] of [["room_folio_menu_item_add", "room_folio.add_menu_item"], ["room_folio_manual_charge_add", "room_folio.add_manual_charge"]]) {
  assert.equal(projected[type].permission, permission);
  assert.equal(projected[type].allowed, true);
  assert.equal(projected[type].visible, true);
  assert.equal(projected[type].no_view, false);
  assert.ok(projected[type].missing.every(value => value === false));
}
assert.equal(projected.room_folio_menu_item_add.no_menu, false);
assert.equal(projected.room_folio_manual_charge_add.no_menu, true);
assert.deepEqual(projected.hidden_menu.items, []);
assert.equal(projected.no_stock.items[0].stock_quantity, null);
assert.equal(projected.no_stock.items[0].price, 9.87);
assert.equal(projected.no_stock.items[0].currency, "TRY");
assert.equal(projected.stock.items[0].stock_quantity, 5);
assert.equal(projected.folio[0].version, "a".repeat(64));
assert.equal(projected.folio[0].can_add_items, true);
assert.equal(projected.folio[0].currency, "USD");
assert.equal(projected.folio[0].remaining_minor, 12345);
assert.equal(projected.reservation_durations.length,5);
assert.deepEqual(projected.reservation_durations.map(row=>row.duration_minutes ?? null),
  [30,480,120,120,null]);
assert.equal(projected.reservation_durations[0].table_ids[0],"table-a");
assert.equal(JSON.stringify(projected.reservation_durations).includes("SECRET"),false);
assert.equal(projected.market_full.replenishment.rows.length,1);
assert.equal(projected.market_full.replenishment.rows[0].suggested_quantity,10);
assert.equal(projected.market_full.replenishment.rows[0].quantity,15);
assert.equal(projected.market_full.categories[0].default_tax_rate,10);
assert.equal(JSON.stringify(projected.market_full).includes("private_location_balance"),false);
assert.equal(JSON.stringify(projected.market_full).includes("secret"),false);
assert.deepEqual(projected.market_no_inventory.replenishment,{rows:[],truncated:false});
assert.deepEqual(projected.market_no_product_view.replenishment,{rows:[],truncated:false});
assert.deepEqual(projected.market_no_product_create.categories,[]);
assert.equal(projected.market_truncated.truncated,true);
assert.equal(projected.commercial_customers[0].commercial_profile.company_name,"Ticari Firma");
assert.equal(projected.commercial_customers[0].commercial_profile.tax_office,"Çankaya");
assert.equal(projected.commercial_customers[0].commercial_profile.tax_number,"1234567890");
assert.equal(projected.commercial_customers[0].commercial_profile.dealer_status,"active");
assert.equal(projected.commercial_customers[0].commercial_profile.price_group,"dealer_b");
assert.equal(projected.commercial_customers[0].commercial_profile.payment_term_days,45);
assert.equal(projected.commercial_customers[1].commercial_profile,null);
assert.equal(JSON.stringify(projected.commercial_customers).includes("do-not-copy"),false);
assert.equal(JSON.stringify(projected.commercial_customers).includes("never"),false);
assert.equal(projected.qr_table.qr_order.kind,"table");
assert.equal(projected.qr_table.qr_order.decision_ready,false,"Web-only request not yet imported into desktop");
assert.equal(projected.qr_room.qr_order.decision_ready,false);
assert.equal(projected.qr_table.qr_order.items[0].quantity,2);
assert.equal(projected.qr_table.qr_order.items[0].note,"Az şeker");
assert.equal(projected.qr_table.qr_order.total,39);
assert.equal(projected.qr_room.qr_order.kind,"room");
assert.equal(JSON.stringify(projected.qr_table).includes("never-leak"),false);
assert.equal(JSON.stringify(projected.qr_room).includes("secret-room-token"),false);
assert.equal(JSON.stringify(projected.qr_table).includes("private-menu"),false);
assert.deepEqual(projected.qr_policy,{
  table_accept:true,room_accept:true,reject:true,wrong_kind:false,
  stale:false,extra_field:false,no_qr_capability:false,
  table_permissions:true,room_permissions:true,no_view:false,no_menu:false
});

console.log(`android-hosting-contract-smoke-ok: ${phpActions.size} action ve ${phpPermissions.size} izin eşleşiyor`);

function functionBody(name) {
  const startToken = `function ${name}(`;
  const start = php.indexOf(startToken);
  assert.notEqual(start, -1, `${name} PHP dosyasında bulunamadı`);
  const next = php.indexOf("\nfunction ", start + startToken.length);
  assert.notEqual(next, -1, `${name} fonksiyon sınırı bulunamadı`);
  return php.slice(start, next);
}

function quotedValues(source) {
  const values = new Set();
  for (const match of source.matchAll(/'([^']+)'/g)) {
    values.add(match[1]);
  }
  return values;
}
