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
  "ya_sync_android_menu_for_permissions", "ya_sync_sanitize_android_room_folios", "ya_sync_string", "ya_sync_bool", "ya_sync_int"];
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
