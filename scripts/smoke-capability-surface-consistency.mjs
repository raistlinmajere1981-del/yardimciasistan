import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import process from "node:process";

const require = createRequire(import.meta.url);
const {
  BUSINESS_CAPABILITIES: C,
  canConvertRequestToReservation,
  getBusinessProfile,
  isRequestTypeAvailable
} = require("../packages/shared/dist/index.js");
const {
  ANDROID_PERMISSIONS,
  androidActionAllowedByCapabilities,
  androidAvailablePermissionGroupIds,
  androidEffectivePermissionsForGroups,
  androidEffectivePermissionsForRole
} = require("../packages/sync-core/dist/index.js");
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  applyBusinessProfileCapabilities,
  readBusinessCapabilitySnapshot,
  setBusinessCapability
} = require("../apps/desktop-app/dist-electron/business-capability-store.js");
const {
  projectAndroidOperationsSnapshot
} = require("../apps/desktop-app/dist-electron/android-capability-projection.js");

const allGroups = {
  service_orders: true,
  cashier: true,
  rooms_tasks: true,
  customer_reservation: true,
  market_operations: false
};
const androidCore = [C.ANDROID, C.CUSTOMERS, C.TASKS, C.FINANCE, C.REPORTS, C.DEVICES];

const requestsSource = source("apps/desktop-app/src/components/customers/RequestsWorkspace.tsx");
const customersSource = source("apps/desktop-app/src/components/customers/CustomersWorkspace.tsx");
const routerSource = source("apps/desktop-app/src/components/app/DesktopWorkspaceRouter.tsx");
const mainSource = source("apps/desktop-app/electron/main.ts");
const settingsSource = source("apps/desktop-app/src/components/settings/LegacySetupWizard.tsx");
const navigationSource = source("apps/desktop-app/src/app/navigation.ts");
const frameSource = source("apps/desktop-app/src/components/app/DesktopAppFrame.tsx");
const menuManagerSource = source("apps/desktop-app/src/components/menu/MenuManager.tsx");
const menuPreviewSource = source("apps/desktop-app/src/components/menu/MenuPreview.tsx");
const roomFolioSource = source("apps/desktop-app/src/components/pension/RoomFolioWorkspace.tsx");
const tableOrdersSource = source("apps/desktop-app/src/components/restaurant/TableOrdersWorkspace.tsx");
const roomFolioIpcSource = source("apps/desktop-app/electron/room-folio-ipc.ts");
const financeIpcSource = source("apps/desktop-app/electron/finance-ipc.ts");
const financeWorkspaceSource = source("apps/desktop-app/src/components/finance/FinanceWorkspace.tsx");
const restaurantReservationsSource = source("apps/desktop-app/src/components/operations/RestaurantReservationsWorkspace.tsx");
const desktopProjectionSource = source("apps/desktop-app/src/app/capability-projection.ts");
const aiWorkspaceSource = source("apps/desktop-app/src/components/messages/MessageWorkspaces.tsx");
const messagingControllerSource = source("apps/desktop-app/src/app/use-messaging-controller.ts");
const dashboardSource = source("apps/desktop-app/src/pages/DashboardPage.tsx");
const systemHealthSource = source("apps/desktop-app/src/components/dashboard/SystemHealthPanel.tsx");
const androidMainSource = source("apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java");
const androidFinanceSource = source("apps/android-app/src/main/java/com/yardimciasistan/android/FinanceWorkspace.java");
const androidSyncClientSource = source("apps/android-app/src/main/java/com/yardimciasistan/android/HostingSyncClient.java");
const androidActivitySource = source("apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java");
const hostingSyncSource = source("firm-template/web-module/api/sync.php");

// A — service.whatsapp controls both renderer affordances and hard boundaries.
assert.match(requestsSource, /whatsappEnabled\s*&&[\s\S]{0,500}WhatsApp'tan Yaz/);
assert.match(customersSource, /whatsappEnabled\s*&&[\s\S]{0,500}WhatsApp'tan Yaz/);
assertHandlerGuard(mainSource, "whatsapp:markMessageSent", "C.WHATSAPP");
assertHandlerGuard(mainSource, "whatsapp:deleteMessage", "C.WHATSAPP");
assert.match(
  handlerSource(mainSource, "customer:assignRoom"),
  /assertDesktopCapability\(C\.CUSTOMERS[\s\S]*assertDesktopCapability\(C\.ACCOMMODATION_STAYS/,
  "direct room assignment must require both customer and stay capabilities"
);
assert.match(
  handlerSource(mainSource, "customer:updateRoomStayStatus"),
  /assertDesktopCapability\(C\.CUSTOMERS[\s\S]*assertDesktopCapability\(C\.ACCOMMODATION_STAYS/,
  "direct stay mutations must require both customer and stay capabilities"
);
assert.match(mainSource, /if \(isWhatsAppUrl\(url\)\)[\s\S]{0,180}assertDesktopCapability\(C\.WHATSAPP/);
assert.equal(androidActionAllowedByCapabilities("message_delete", androidCore), false);
assert.match(
  desktopProjectionSource,
  /androidActionFailures:\s*enabled\.has\(C\.ANDROID\)\s*\?\s*source\.androidActionFailures\s*:\s*\[\]/,
  "Android action failures must not reach renderer surfaces after service.android is disabled"
);

const fullSnapshot = fixtureSnapshot();
const withoutWhatsApp = fullSnapshot.business_capabilities.filter((capability) => capability !== C.WHATSAPP);
const whatsappProjection = projectAndroidOperationsSnapshot(fullSnapshot, withoutWhatsApp, "2026-07-17");
assert.deepEqual(whatsappProjection.messages, []);
assert.equal(whatsappProjection.summary.prepared_whatsapp_messages, 0);
assert.equal(whatsappProjection.requests.every((request) => request.whatsapp_message === ""), true);
const withoutCustomers = fullSnapshot.business_capabilities.filter((capability) => capability !== C.CUSTOMERS);
const customerProjection = projectAndroidOperationsSnapshot(fullSnapshot, withoutCustomers, "2026-07-17");
assert.deepEqual(customerProjection.requests, []);
assert.deepEqual(customerProjection.customers, []);
assert.deepEqual(customerProjection.messages, []);
assert.equal(customerProjection.summary.prepared_whatsapp_messages, 0);
assert.equal(androidActionAllowedByCapabilities("message_delete", withoutCustomers), false);
assert.match(frameSource, /qrMenuEnabled\s*&&[\s\S]{0,300}Web'e Yayınla/);
assert.match(menuManagerSource, /stockImageImportEnabled\s*&&[\s\S]{0,180}<StockImageImportWorkspace/);
assert.match(menuManagerSource, /inventoryEnabled\s*&&\s*<details className="menu-stock-editor"/);
assert.match(menuPreviewSource, /whatsappEnabled\s*&&\s*setupData\.whatsapp/);
assert.match(roomFolioSource, /menuEnabled\s*&&\s*<section className="room-folio-menu-panel"/);
assert.match(tableOrdersSource, /menuEnabled\s*&&\s*<section className="table-order-menu-pane"/);
assert.match(roomFolioIpcSource, /options\.assertMenuCapability\?\.\(\)/);
assert.match(financeIpcSource, /finance:setReservationTotal[\s\S]{0,300}assertAccommodationReservationCapability/);
assert.match(financeIpcSource, /finance:addPensionPayment[\s\S]{0,300}assertAccommodationFolioCapability/);
assert.match(financeWorkspaceSource, /accommodationFolioEnabled\s*&&\s*<MetricCard[^>]*title="Bekleyen Alacak"/);
assert.match(financeWorkspaceSource, /if \(accommodationEnabled\) options\.push\(\["pension", "Pansiyon"\]\)/);
assert.match(financeWorkspaceSource, /if \(foodServiceEnabled\) options\.push\(\["restaurant", "Restoran"\]\)/);
assert.match(androidFinanceSource, /hasBusinessCapability\(AndroidUiRules\.CAPABILITY_FOLIO\)[\s\S]{0,180}Bekleyen oda alacağı/);
assert.match(androidMainSource, /data\.hasAnyReservationCapability\(\)[\s\S]{0,120}!data\.permissionsResolved \|\| data\.hasPermission\("reservation\.view"\)/);
assert.match(androidSyncClientSource, /android_capability_disabled[\s\S]{0,300}invalidatesPendingAction/);
assert.match(androidActivitySource, /operationCache\.clear\(\)[\s\S]{0,120}actionOutbox\.clear\(\)/);
assert.match(hostingSyncSource, /ya_sync_android_action_permission\([\s\S]{0,300}android_action_permission_denied/);
assert.match(
  hostingSyncSource,
  /ya_sync_get_visible_android_actions\([\s\S]{0,900}ya_sync_android_action_capability_allowed/,
  "hosted Android action history must be filtered by current permissions and capabilities"
);
assert.match(
  handlerSource(mainSource, "setup:saveInitial", 3_500),
  /applyBusinessProfileCapabilities\([\s\S]*setBusinessCapability\([\s\S]*queueSyncJob\("android_snapshot"\)/,
  "setup save must persist the selected profile and publish its capability manifest"
);
assert.match(
  handlerSource(mainSource, "dailyTask:save"),
  /existingTask[\s\S]*assertDesktopTaskScope\(\s*existingTask\.taskType[\s\S]*assertDesktopTaskScope\(String\(input\?\.taskType/,
  "daily task edits must authorize both the stored and requested domains"
);

// B/C — rooms/tables remain usable without implicitly granting reservations.
const roomsWithoutReservations = [...androidCore, C.ACCOMMODATION_ROOMS];
assert.equal(isRequestTypeAvailable(roomsWithoutReservations, "pension_reservation"), false);
assert.equal(canConvertRequestToReservation(roomsWithoutReservations, "pension_reservation"), false);
assert.equal(androidActionAllowedByCapabilities("room_status_update", roomsWithoutReservations), true);
assert.equal(androidActionAllowedByCapabilities("reservation_room_create", roomsWithoutReservations), false);
const roomProjection = projectAndroidOperationsSnapshot(fullSnapshot, roomsWithoutReservations, "2026-07-17");
assert.equal(roomProjection.rooms.length > 0, true);
assert.equal(roomProjection.reservations.some((reservation) => reservation.reservation_type === "room"), false);
assert.equal(roomProjection.rooms.every((room) => room.active_reservation_title === ""), true);
assert.equal(roomProjection.reports.today.summary.approved_reservations, 0);

const accommodationReservationProjection = projectAndroidOperationsSnapshot(
  fullSnapshot,
  [...roomsWithoutReservations, C.ACCOMMODATION_RESERVATIONS],
  "2026-07-17"
);
assert.equal(accommodationReservationProjection.reports.today.summary.approved_reservations, 1);
assert.equal(accommodationReservationProjection.reports.today.summary.approved_food_reservations, 0);

const tablesWithoutReservations = [...androidCore, C.FOOD_TABLES];
assert.equal(isRequestTypeAvailable(tablesWithoutReservations, "restaurant_reservation"), false);
assert.equal(canConvertRequestToReservation(tablesWithoutReservations, "restaurant_reservation"), false);
assert.equal(androidActionAllowedByCapabilities("table_status_update", tablesWithoutReservations), true);
assert.equal(androidActionAllowedByCapabilities("table_status_update", tablesWithoutReservations, { payload: { status: "reserved" } }), false);
assert.equal(androidActionAllowedByCapabilities("table_status_update", tablesWithoutReservations, { payload: { status: "bill_waiting" } }), false);
assert.equal(androidActionAllowedByCapabilities("reservation_table_create", tablesWithoutReservations), false);
const tableProjection = projectAndroidOperationsSnapshot(fullSnapshot, tablesWithoutReservations, "2026-07-17");
assert.equal(tableProjection.tables.length > 0, true);
assert.equal(tableProjection.reservations.some((reservation) => reservation.reservation_type === "table"), false);
assert.equal(tableProjection.tables.every((table) => table.active_reservation_title === ""), true);
assert.equal(tableProjection.tables.every((table) => !["reserved", "bill_waiting", "payment"].includes(table.status)), true);
assert.equal(tableProjection.reports.today.summary.approved_reservations, 0);
const foodReservationProjection = projectAndroidOperationsSnapshot(
  fullSnapshot,
  [...tablesWithoutReservations, C.FOOD_RESERVATIONS],
  "2026-07-17"
);
assert.equal(foodReservationProjection.reports.today.summary.approved_reservations, 1);
assert.equal(foodReservationProjection.reports.today.summary.approved_accommodation_reservations, 0);
const linkedTableTask = {
  ...fullSnapshot.daily_tasks[0],
  id: "task-linked-to-hidden-table-reservation",
  task_type: "reservation",
  related_type: "reservation",
  related_id: "reservation_android_demo_table"
};
const linkedTaskProjection = projectAndroidOperationsSnapshot(
  { ...fullSnapshot, daily_tasks: [...fullSnapshot.daily_tasks, linkedTableTask] },
  tablesWithoutReservations,
  "2026-07-17"
);
assert.equal(
  linkedTaskProjection.daily_tasks.find((task) => task.id === linkedTableTask.id)?.related_reservation_type,
  "table"
);

assert.match(requestsSource, /isRequestTypeAvailable\(enabledCapabilities/);
assert.match(requestsSource, /canConvertRequestToReservation\(enabledCapabilities/);
assert.match(routerSource, /accommodationReservationsEnabled/);
assert.match(routerSource, /foodReservationsEnabled/);
assert.match(routerSource, /pensionReservations[\s\S]{0,300}domain === "accommodation"[\s\S]{0,160}domain === "mixed"/);
assert.match(
  restaurantReservationsSource,
  /domain === "generic"\s*&&\s*!accommodationReservationsEnabled/,
  "food-only profiles must retain generic reservations in the restaurant workspace"
);

const genericRoomReservation = {
  ...fullSnapshot.reservations[0],
  id: "generic-room-reservation",
  reservation_type: "event",
  room_ids: ["room_101"],
  table_ids: []
};
const genericTableReservation = {
  ...fullSnapshot.reservations[0],
  id: "generic-table-reservation",
  reservation_type: "other",
  room_ids: [],
  table_ids: ["table_001"]
};
const contextualSnapshot = {
  ...fullSnapshot,
  reservations: [...fullSnapshot.reservations, genericRoomReservation, genericTableReservation]
};
const contextualAccommodationProjection = projectAndroidOperationsSnapshot(
  contextualSnapshot,
  [...roomsWithoutReservations, C.ACCOMMODATION_RESERVATIONS],
  "2026-07-17"
);
assert.equal(contextualAccommodationProjection.reservations.some((item) => item.id === genericRoomReservation.id), true);
assert.equal(contextualAccommodationProjection.reservations.some((item) => item.id === genericTableReservation.id), false);
const contextualFoodProjection = projectAndroidOperationsSnapshot(
  contextualSnapshot,
  [...tablesWithoutReservations, C.FOOD_RESERVATIONS],
  "2026-07-17"
);
assert.equal(contextualFoodProjection.reservations.some((item) => item.id === genericRoomReservation.id), false);
assert.equal(contextualFoodProjection.reservations.some((item) => item.id === genericTableReservation.id), true);

// D — Market keeps retail capabilities while old Android groups lose domain permissions.
const marketCapabilities = getBusinessProfile("market").defaultCapabilities;
assert.equal(marketCapabilities.includes(C.RETAIL_BARCODE), true);
assert.equal(marketCapabilities.includes(C.RETAIL_PURCHASING), true);
assert.equal(marketCapabilities.includes(C.ACCOMMODATION_ROOMS), false);
assert.equal(marketCapabilities.includes(C.FOOD_TABLES), false);
assert.deepEqual(
  androidAvailablePermissionGroupIds(marketCapabilities),
  ["market_operations"]
);
const marketPermissions = androidEffectivePermissionsForGroups({
  service_orders: false,
  cashier: false,
  rooms_tasks: false,
  customer_reservation: false,
  market_operations: true
}, marketCapabilities);
for (const permission of ["room.view", "room_folio.view", "table.view", "table_order.view", "reservation.view"]) {
  assert.equal(marketPermissions.includes(permission), false, `${permission} leaked into Market`);
}
for (const permission of [
  "market.summary.view",
  "market.product.view",
  "market.stock_count",
  "market.receiving",
  "market.product_draft",
  "market.cart_draft"
]) {
  assert.equal(marketPermissions.includes(permission), true, `${permission} missing from Market group`);
}
const marketProjection = projectAndroidOperationsSnapshot(fullSnapshot, marketCapabilities, "2026-07-17");
assert.deepEqual(marketProjection.rooms, []);
assert.deepEqual(marketProjection.customer_room_stays, []);
assert.deepEqual(marketProjection.room_folios, []);
assert.deepEqual(marketProjection.tables, []);
assert.deepEqual(marketProjection.table_orders, []);
assert.deepEqual(marketProjection.reservations, []);
assert.deepEqual(marketProjection.menu.items, []);
assert.equal(marketProjection.reports.today.attention.overdue_tasks, 0);
assert.equal(marketProjection.reports.today.attention.incomplete_tasks, 0);
assert.match(settingsSource, /androidAvailablePermissionGroupIds\(enabledCapabilities\)/);
assert.match(settingsSource, /label: "Market \/ El Terminali"/);

const menuWithoutInventory = projectAndroidOperationsSnapshot(
  { ...fullSnapshot, appliedStockImageHashes: ["sha256-capability-smoke"] },
  [...androidCore, C.FOOD_MENU, C.QR_MENU],
  "2026-07-17"
);
assert.equal(menuWithoutInventory.menu.items[0].stock_quantity, null);
assert.equal(menuWithoutInventory.menu.items[0].stock_min_quantity, null);
assert.equal(menuWithoutInventory.menu.items[0].hide_when_out_of_stock, false);
assert.equal(menuWithoutInventory.menu.items[0].stock_note, null);
assert.deepEqual(menuWithoutInventory.trackedStockItems, []);
assert.deepEqual(menuWithoutInventory.appliedStockImageHashes, []);

const inventoryWithoutQr = projectAndroidOperationsSnapshot(
  fullSnapshot,
  [...androidCore, C.FOOD_MENU, C.CATALOG, C.INVENTORY],
  "2026-07-17"
);
assert.equal(inventoryWithoutQr.menu.items[0].stock_quantity, fullSnapshot.menu.items[0].stock_quantity);
assert.equal(inventoryWithoutQr.menu.items[0].hide_when_out_of_stock, false);

const inventoryAiWithoutMenu = projectAndroidOperationsSnapshot(
  { ...fullSnapshot, appliedStockImageHashes: ["sha256-menu-required"] },
  [...androidCore, C.CATALOG, C.INVENTORY, C.AI],
  "2026-07-17"
);
assert.deepEqual(inventoryAiWithoutMenu.appliedStockImageHashes, []);

const androidDisabledProjection = projectAndroidOperationsSnapshot(
  fullSnapshot,
  fullSnapshot.business_capabilities.filter((capability) => capability !== C.ANDROID),
  "2026-07-17"
);
assert.deepEqual(
  androidDisabledProjection.business_capabilities,
  fullSnapshot.business_capabilities.filter((capability) => capability !== C.ANDROID)
);
assert.deepEqual(androidDisabledProjection.rooms, []);
assert.deepEqual(androidDisabledProjection.tables, []);
assert.deepEqual(androidDisabledProjection.androidPermissions, {});
assert.match(
  desktopProjectionSource,
  /const customers = enabled\.has\(C\.CUSTOMERS\)[\s\S]{0,500}: \[\];/,
  "core.customers=false must redact customer records at the renderer boundary"
);
assert.match(
  desktopProjectionSource,
  /preparedWhatsAppMessages:\s*enabled\.has\(C\.CUSTOMERS\)\s*&&\s*enabled\.has\(C\.WHATSAPP\)/,
  "prepared WhatsApp counts require both customer and WhatsApp capabilities"
);
assert.match(aiWorkspaceSource, /const modes:[\s\S]{0,120}= customersEnabled[\s\S]{0,300}\["daily"/);
assert.match(aiWorkspaceSource, /customersEnabled\s*&&\s*<label className="ai-field"/);
assert.match(
  messagingControllerSource,
  /surfaceAiWorkspaceMode:\s*AiWorkspaceMode\s*=\s*customersEnabled\s*\?\s*aiWorkspaceMode\s*:\s*"daily"/,
  "AI customer modes must collapse to the daily surface when core.customers is disabled"
);
assert.match(desktopProjectionSource, /newRequests: enabled\.has\(C\.CUSTOMERS\)[^\n]+: 0/);
assert.match(desktopProjectionSource, /waitingRequests: enabled\.has\(C\.CUSTOMERS\)[^\n]+: 0/);
assert.match(
  routerSource,
  /<WhatsAppWorkspace[\s\S]{0,180}requests=\{surfaceData\.requests\}/,
  "persistent messaging surfaces must consume the capability-safe request projection"
);
assert.match(
  dashboardSource,
  /<h2>\{hasCapacityMetrics \? "İşletme kapasitesi" : "Günlük değerlendirme"\}<\/h2>/,
  "an AI-only dashboard must not retain the business-capacity heading"
);
assert.doesNotMatch(systemHealthSource, /AI devre dışı olsa|Android modülü bu işletmede kullanılmıyor/);
assert.match(
  navigationSource,
  /aiEnabled && customersEnabled[\s\S]{0,180}AI ile günlük işletme değerlendirmeleri hazırlayın/,
  "AI-only navigation copy must not promise customer messaging"
);

// E — a composed pension + retail set exposes both domains without inventing food service.
const pensionRetail = new Set([
  ...getBusinessProfile("pension").defaultCapabilities,
  C.CATALOG,
  C.INVENTORY,
  C.SALES,
  C.RETAIL_BARCODE,
  C.RETAIL_PURCHASING,
  C.RETAIL_SUPPLIERS,
  C.RETAIL_LABELS
]);
assert.equal(pensionRetail.has(C.ACCOMMODATION_RESERVATIONS), true);
assert.equal(pensionRetail.has(C.RETAIL_BARCODE), true);
assert.equal(pensionRetail.has(C.FOOD_TABLES), false);
const hybridProjection = projectAndroidOperationsSnapshot(fullSnapshot, pensionRetail, "2026-07-17");
assert.equal(hybridProjection.rooms.length > 0, true);
assert.deepEqual(hybridProjection.tables, []);
assert.equal(hybridProjection.reservations.some((reservation) => reservation.reservation_type === "table"), false);
assert.match(navigationSource, /hasRetailWorkspaceCapability/);
assert.doesNotMatch(navigationSource, /businessType|business_type|setupData\.modules/);
assert.match(
  navigationSource,
  /\?\s*\(accommodationFolioEnabled\s*\?\s*"[^"]*bekleyen oda alacaklarını/,
  "room receivable copy must stay inside the accommodation folio capability branch"
);

// F — runtime surfaces may not special-case profile/business type or legacy modules.
for (const file of [
  "apps/desktop-app/src/App.tsx",
  "apps/desktop-app/src/app/navigation.ts",
  "apps/desktop-app/src/app/notifications.ts",
  "apps/desktop-app/src/app/use-messaging-controller.ts",
  "apps/desktop-app/src/components/app/DesktopAppFrame.tsx",
  "apps/desktop-app/src/components/app/DesktopWorkspaceRouter.tsx",
  "apps/desktop-app/src/components/customers/CustomersWorkspace.tsx",
  "apps/desktop-app/src/components/customers/RequestsWorkspace.tsx",
  "apps/desktop-app/src/components/finance/FinanceWorkspace.tsx",
  "apps/desktop-app/src/components/restaurant/RestaurantRoomTransferPanel.tsx",
  "apps/desktop-app/src/pages/DashboardPage.tsx",
  "apps/desktop-app/src/pages/OperationCalendarPage.tsx",
  "apps/desktop-app/src/pages/PensionPage.tsx",
  "apps/desktop-app/src/pages/ReportsPage.tsx",
  "apps/desktop-app/src/pages/RestaurantPage.tsx"
]) {
  const runtimeSource = source(file);
  assert.doesNotMatch(runtimeSource, /business(?:Type|_type)\s*(?:===|!==|==|!=)/, `${file} uses a profile runtime gate`);
  assert.doesNotMatch(runtimeSource, /\b(?:setupData|setup)\.modules/, `${file} uses legacy modules as runtime truth`);
}

// G — admin expands role grants, then intersects them with business capabilities.
const marketAdmin = androidEffectivePermissionsForRole("admin", ANDROID_PERMISSIONS, marketCapabilities);
for (const permission of ["room.update_status", "reservation.create", "table_order.open", "menu.edit"]) {
  assert.equal(marketAdmin.includes(permission), false, `admin bypassed Market for ${permission}`);
}
assert.equal(marketAdmin.includes("finance.create"), true);
assert.equal(androidActionAllowedByCapabilities("reservation_room_create", marketCapabilities), false);
assert.equal(androidActionAllowedByCapabilities("table_order_open", marketCapabilities), false);
assert.equal(
  androidActionAllowedByCapabilities(
    "customer_room_assign",
    [C.ANDROID, C.ACCOMMODATION_ROOMS, C.ACCOMMODATION_STAYS]
  ),
  false,
  "room assignment must not expose customer data when core.customers is disabled"
);
const stockWithoutAi = [...androidCore, C.FOOD_MENU, C.CATALOG, C.INVENTORY];
assert.equal(androidActionAllowedByCapabilities("menu_stock_image_import_apply", stockWithoutAi), false);
assert.equal(androidActionAllowedByCapabilities("menu_stock_image_import_apply", [...stockWithoutAi, C.AI]), true);

verifyPersistedRuntimeSource();
console.log("capability-surface-consistency-smoke-ok: A-G verified");

function verifyPersistedRuntimeSource() {
  const dataDir = mkdtempSync(join(tmpdir(), "yardimci-capability-surface-"));
  const database = new DesktopDatabase({
    appPath: join(process.cwd(), "apps", "desktop-app"),
    userDataPath: dataDir
  });
  try {
    database.initialize();
    const market = applyBusinessProfileCapabilities(database.databasePath, "market", { preserveUserOverrides: false });
    const expected = [...market.enabledCapabilities].sort();

    const raw = new DatabaseSync(database.databasePath);
    try {
      raw.prepare(`
        UPDATE business
        SET modules_json = '{"rooms":true,"tables":true,"qr_menu":true,"ai":true,"whatsapp":true,"android":true}'
        WHERE deleted_at = ''
      `).run();
      raw.prepare(`
        UPDATE settings
        SET rooms_enabled = 1, tables_enabled = 1, qr_menu_enabled = 1
        WHERE deleted_at = ''
      `).run();
    } finally {
      raw.close();
    }

    assert.deepEqual(database.getEnabledBusinessCapabilities().sort(), expected);
    assert.equal(database.getSetupData().modules.rooms, false);
    assert.equal(database.getSetupData().modules.tables, false);

    seedContextualReportTasks(database.databasePath);
    applyBusinessProfileCapabilities(database.databasePath, "restaurant", { preserveUserOverrides: false });
    assert.equal(contextualTaskReport(database).summary.pendingTasks, 1);
    assert.equal(contextualTaskReport(database).summary.approvedReservations, 3);
    assert.equal(contextualTaskReport(database).summary.newRequests, 1);
    const currentBusiness = readBusinessCapabilitySnapshot(database.databasePath);
    setCapabilityEnabled(database.databasePath, currentBusiness.businessId, C.CUSTOMERS, false);
    assert.equal(contextualTaskReport(database).summary.newRequests, 0);
    assert.equal(contextualTaskReport(database).attention.pendingRequests, 0);
    setCapabilityEnabled(database.databasePath, currentBusiness.businessId, C.CUSTOMERS, true);
    applyBusinessProfileCapabilities(database.databasePath, "pension", { preserveUserOverrides: false });
    assert.equal(contextualTaskReport(database).summary.pendingTasks, 1);
    assert.equal(contextualTaskReport(database).summary.approvedReservations, 3);
    setBusinessCapability(database.databasePath, { capability: C.FOOD_TABLES, enabled: true });
    assert.equal(contextualTaskReport(database).summary.pendingTasks, 3);

    applyBusinessProfileCapabilities(database.databasePath, "pension_restaurant", { preserveUserOverrides: false });
    assert.equal(contextualTaskReport(database).summary.approvedReservations, 6);

    const pension = applyBusinessProfileCapabilities(database.databasePath, "pension", { preserveUserOverrides: false });
    setCapabilityEnabled(database.databasePath, pension.businessId, C.ACCOMMODATION_RESERVATIONS, false);
    assert.equal(database.getEnabledBusinessCapabilities().includes(C.ACCOMMODATION_ROOMS), true);
    assert.equal(database.getEnabledBusinessCapabilities().includes(C.ACCOMMODATION_RESERVATIONS), false);
    const rejectedPensionRequest = database.createManualRequest(manualRequest("pension_reservation"));
    assert.equal(rejectedPensionRequest.ok, false);

    const restaurant = applyBusinessProfileCapabilities(database.databasePath, "restaurant", { preserveUserOverrides: false });
    setCapabilityEnabled(database.databasePath, restaurant.businessId, C.FOOD_RESERVATIONS, false);
    assert.equal(database.getEnabledBusinessCapabilities().includes(C.FOOD_TABLES), true);
    assert.equal(database.getEnabledBusinessCapabilities().includes(C.FOOD_RESERVATIONS), false);
    const rejectedRestaurantRequest = database.createManualRequest(manualRequest("restaurant_reservation"));
    assert.equal(rejectedRestaurantRequest.ok, false);

    applyBusinessProfileCapabilities(database.databasePath, "market", { preserveUserOverrides: false });
    setBusinessCapability(database.databasePath, { capability: C.ACCOMMODATION_ROOMS, enabled: true });
    setBusinessCapability(database.databasePath, { capability: C.ACCOMMODATION_RESERVATIONS, enabled: true });
    setBusinessCapability(database.databasePath, { capability: C.ACCOMMODATION_STAYS, enabled: true });
    const hybrid = setBusinessCapability(database.databasePath, { capability: C.ACCOMMODATION_FOLIO, enabled: true });
    assert.equal(hybrid.enabledCapabilities.includes(C.RETAIL_BARCODE), true);
    assert.equal(hybrid.enabledCapabilities.includes(C.ACCOMMODATION_RESERVATIONS), true);
    assert.equal(hybrid.enabledCapabilities.includes(C.FOOD_RESERVATIONS), false);
    assert.deepEqual(readBusinessCapabilitySnapshot(database.databasePath).enabledCapabilities.sort(), hybrid.enabledCapabilities.sort());
  } finally {
    database.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

function seedContextualReportTasks(databasePath) {
  const raw = new DatabaseSync(databasePath);
  const now = "2099-02-03T09:00:00.000Z";
  try {
    const insertReservation = raw.prepare(`
      INSERT INTO reservations (
        id, reservation_type, status, title, start_date, room_ids_json, table_ids_json,
        created_at, updated_at
      ) VALUES (?, ?, 'approved', ?, '2099-02-03', ?, ?, ?, ?)
    `);
    insertReservation.run("cap-room-reservation", "room", "Room context", '["room-cap"]', "[]", now, now);
    insertReservation.run("cap-table-reservation", "table", "Table context", "[]", '["table-cap"]', now, now);
    insertReservation.run("cap-mixed-reservation", "room_and_table", "Mixed context", '["room-cap"]', '["table-cap"]', now, now);
    insertReservation.run("cap-generic-room-reservation", "event", "Generic room context", '["room-cap"]', "[]", now, now);
    insertReservation.run("cap-generic-table-reservation", "other", "Generic table context", "[]", '["table-cap"]', now, now);
    insertReservation.run("cap-generic-reservation", "event", "Generic context", "[]", "[]", now, now);

    const insertTask = raw.prepare(`
      INSERT INTO daily_tasks (
        id, title, task_type, status, due_date, related_type, related_id,
        created_at, updated_at
      ) VALUES (?, ?, 'reservation', 'pending', '2099-02-03', 'reservation', ?, ?, ?)
    `);
    insertTask.run("cap-room-task", "Room task", "cap-room-reservation", now, now);
    insertTask.run("cap-table-task", "Table task", "cap-table-reservation", now, now);
    insertTask.run("cap-mixed-task", "Mixed task", "cap-mixed-reservation", now, now);
    raw.prepare(`
      INSERT INTO requests (
        id, request_type, status, customer_name, customer_phone, created_at, updated_at
      ) VALUES ('cap-report-request', 'general_info', 'new', 'Report request', '+905550000001', ?, ?)
    `).run(now, now);
  } finally {
    raw.close();
  }
}

function contextualTaskReport(database) {
  return database.getReportData({
    preset: "custom",
    label: "Contextual tasks",
    startDate: "2099-02-03",
    endDate: "2099-02-03"
  });
}

function setCapabilityEnabled(databasePath, businessId, capability, enabled) {
  const raw = new DatabaseSync(databasePath);
  try {
    raw.prepare(`
      UPDATE business_capabilities
      SET is_enabled = ?, source = 'user', updated_at = ?
      WHERE business_id = ? AND capability_id = ?
    `).run(enabled ? 1 : 0, new Date().toISOString(), businessId, capability);
  } finally {
    raw.close();
  }
}

function manualRequest(requestType) {
  return {
    requestType,
    customerName: "Capability Smoke",
    customerPhone: "+905550001122",
    dateText: "",
    startDate: "2026-10-10",
    endDate: "2026-10-11",
    time: "19:00",
    guestCount: 2,
    adultCount: 2,
    childCount: 0,
    message: "Capability sınırı doğrulaması",
    priority: "normal"
  };
}

function fixtureSnapshot() {
  const fixture = JSON.parse(source("demo-data/android-operations-snapshot.json"));
  fixture.reservations.push({
    ...fixture.reservations[0],
    id: "reservation_android_demo_table",
    request_id: "request_demo_web_002",
    customer_id: "customer_android_demo_002",
    customer_name: "Demo Masa",
    reservation_type: "table",
    title: "Demo Masa - akşam",
    room_ids: [],
    table_ids: ["table_001"]
  });
  fixture.rooms[0].active_reservation_title = "Demo Aile";
  fixture.tables[0].active_reservation_title = "Demo Masa";
  return {
    ...fixture,
    customer_room_stays: [{ id: "stay_demo", customer_id: "customer_android_demo_001" }],
    room_folios: [{ id: "folio_demo" }],
    admin_menu: structuredClone(fixture.menu),
    androidPermissions: {
      "device-admin": { role: "admin", is_active: true, permissions: [...ANDROID_PERMISSIONS] }
    },
    finance: {
      generated_at: fixture.updated_at,
      currency: "TRY",
      today_income_minor: 100,
      today_expense_minor: 25,
      today_net_minor: 75,
      outstanding_pension_minor: 50,
      recent_entries: []
    },
    reports: Object.fromEntries(["today", "yesterday", "last7", "last30"].map((preset) => [preset, reportFixture(preset)]))
  };
}

function reportFixture(preset) {
  return {
    period: {
      key: preset,
      label: preset,
      start: "2026-07-17",
      end: "2026-07-17"
    },
    summary: {
      restaurant_revenue: 100,
      closed_orders: 1,
      average_order: 100,
      approved_reservations: 2,
      approved_accommodation_reservations: 1,
      approved_food_reservations: 1,
      approved_mixed_reservations: 0,
      approved_generic_reservations: 0,
      new_requests: 3,
      attention_count: 7
    },
    restaurant: { sold_item_count: 1, cancelled_orders: 0, top_items: [], daily_revenue: [] },
    attention: {
      pending_requests: 1,
      pending_reservations: 2,
      payment_waiting_tables: 1,
      overdue_tasks: 1,
      incomplete_tasks: 2,
      out_of_stock_items: 1,
      low_stock_items: 1,
      items: [
        { kind: "pending_request", title: "Talep", detail: "Müşteri talebi" },
        { kind: "pending_reservation", title: "Rezervasyon", detail: "Bekliyor" },
        { kind: "payment_waiting", title: "Hesap", detail: "Bekliyor" },
        { kind: "overdue_task", title: "İş", detail: "Gecikti" },
        { kind: "out_of_stock", title: "Stok", detail: "Tükendi" }
      ]
    }
  };
}

function assertHandlerGuard(contents, channel, capability) {
  const start = contents.indexOf(`ipcMain.handle("${channel}"`);
  assert.notEqual(start, -1, `${channel} handler missing`);
  assert.equal(contents.slice(start, start + 500).includes(`assertDesktopCapability(${capability}`), true, `${channel} is not capability guarded`);
}

function handlerSource(contents, channel, length = 1_500) {
  const channelPosition = contents.indexOf(`"${channel}"`);
  const start = channelPosition === -1 ? -1 : contents.lastIndexOf("ipcMain.handle(", channelPosition);
  assert.notEqual(start, -1, `${channel} handler missing`);
  assert.equal(channelPosition - start < 120, true, `${channel} is not an IPC handler`);
  return contents.slice(start, start + length);
}

function source(relativePath) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}
