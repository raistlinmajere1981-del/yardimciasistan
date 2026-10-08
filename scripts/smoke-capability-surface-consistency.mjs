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

const androidCore = [C.ANDROID, C.CUSTOMERS, C.REQUESTS, C.TASKS, C.FINANCE, C.REPORTS, C.DEVICES];

const requestsSource = source("apps/desktop-app/src/components/customers/RequestsWorkspace.tsx");
const customerWorkspaceSource = source("apps/desktop-app/src/components/customers/CustomerWorkspace.tsx");
const routerSource = source("apps/desktop-app/src/components/app/DesktopWorkspaceRouter.tsx");
const customerWorkRouteSource = source("apps/desktop-app/src/components/app/routes/CustomerWorkRoute.tsx");
const mainSource = source("apps/desktop-app/electron/main.ts");
const appIpcSource = source("apps/desktop-app/electron/ipc/app-ipc.ts");
const settingsSource = source("apps/desktop-app/src/components/settings/AndroidDevicesSection.tsx");
const navigationSource = source("apps/desktop-app/src/app/navigation.ts");
const frameSource = source("apps/desktop-app/src/components/app/DesktopAppFrame.tsx");
const menuManagerSource = source("apps/desktop-app/src/components/menu/MenuManager.tsx");
const qrMenuPanelSource = source("apps/desktop-app/src/components/menu/QrMenuPanel.tsx");
const menuIpcSource = source("apps/desktop-app/electron/ipc/menu-ipc.ts");
const menuProductEntryFieldsSource = source("apps/desktop-app/src/components/menu/MenuProductEntryFields.tsx");
const menuPreviewSource = source("apps/desktop-app/src/components/menu/MenuPreview.tsx");
const roomAccountSource = source("apps/desktop-app/src/components/pension/RoomAccount.tsx");
const roomAccountAdjustmentsSource = source("apps/desktop-app/src/components/pension/RoomAccountAdjustments.tsx");
const tableOrdersSource = source("apps/desktop-app/src/components/restaurant/TableOrderEditor.tsx");
const tableOrderIpcSource = source("apps/desktop-app/electron/ipc/table-order-ipc.ts");
const roomFolioIpcSource = source("apps/desktop-app/electron/room-folio-ipc.ts");
const financeIpcSource = source("apps/desktop-app/electron/finance-ipc.ts");
const customerIpcSource = source("apps/desktop-app/electron/ipc/customer-ipc.ts");
const whatsappIpcSource = source("apps/desktop-app/electron/ipc/whatsapp-ipc.ts");
const dailyTaskIpcSource = source("apps/desktop-app/electron/ipc/daily-task-ipc.ts");
const financeWorkspaceSource = source("apps/desktop-app/src/components/finance/FinanceWorkspace.tsx");
const restaurantReservationsSource = source("apps/desktop-app/src/components/operations/RestaurantReservationsWorkspace.tsx");
const desktopProjectionSource = source("apps/desktop-app/src/app/capability-projection.ts");
const messageWorkspaceSource = source("apps/desktop-app/src/components/messages/MessageWorkspaces.tsx");
const messagingControllerSource = source("apps/desktop-app/src/app/use-messaging-controller.ts");
const dashboardSource = source("apps/desktop-app/src/pages/DashboardPage.tsx");
const systemHealthSource = source("apps/desktop-app/src/components/dashboard/SystemHealthPanel.tsx");
const businessAiServiceSource = source("apps/desktop-app/electron/business-ai-service.ts");
const androidMainSource = source("apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java");
const androidUiRulesSource = source("apps/android-app/src/main/java/com/yardimciasistan/android/AndroidUiRules.java");
const androidSyncControllerSource = source("apps/android-app/src/main/java/com/yardimciasistan/android/AndroidOperationsSyncController.java");
const androidFinanceSource = source("apps/android-app/src/main/java/com/yardimciasistan/android/FinanceWorkspace.java");
const androidSyncClientSource = source("apps/android-app/src/main/java/com/yardimciasistan/android/HostingSyncClient.java");
const androidActivitySource = source("apps/android-app/src/main/java/com/yardimciasistan/android/MainActivity.java");
const hostingSyncSource = source("firm-template/web-module/api/sync.php");
const webChatSource = source("firm-template/web-module/api/chat.php");
const menuCssSource = source("apps/desktop-app/src/styles/pages/menu.css");
const testSiteHeaderSource = source("test-site/landing/inc/site.php");
const testSiteQrMenuSource = source("test-site/landing/assets/js/qr-menu.js");

// A — service.whatsapp controls both renderer affordances and hard boundaries.
assert.match(requestsSource, /whatsappEnabled\s*&&[\s\S]{0,500}WhatsApp'tan Yaz/);
assert.match(customerWorkspaceSource, /whatsappEnabled\s*&&[\s\S]{0,500}WhatsApp'tan Yaz/);
assertHandlerGuard(whatsappIpcSource, "whatsapp:markMessageSent", "assertCapability(BUSINESS_CAPABILITIES.WHATSAPP");
assertHandlerGuard(whatsappIpcSource, "whatsapp:deleteMessage", "assertCapability(BUSINESS_CAPABILITIES.WHATSAPP");
assert.match(
  handlerSource(customerIpcSource, "customer:assignRoom"),
  /assertCapability\(BUSINESS_CAPABILITIES\.CUSTOMERS[\s\S]*assertCapability\(BUSINESS_CAPABILITIES\.ACCOMMODATION_STAYS/,
  "direct room assignment must require both customer and stay capabilities"
);
assert.match(
  handlerSource(customerIpcSource, "customer:updateRoomStayStatus"),
  /assertCapability\(BUSINESS_CAPABILITIES\.CUSTOMERS[\s\S]*assertCapability\(BUSINESS_CAPABILITIES\.ACCOMMODATION_STAYS/,
  "direct stay mutations must require both customer and stay capabilities"
);
assert.match(
  appIpcSource,
  /ipcMain\.handle\("shell:openExternal"[\s\S]{0,300}isWhatsAppUrl\(url\)[\s\S]{0,300}assertCapability\(.*WHATSAPP/
);
assert.match(mainSource, /assertCapability: assertDesktopCapability/);
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
const withoutRequests = fullSnapshot.business_capabilities.filter((capability) => capability !== C.REQUESTS);
const requestProjection = projectAndroidOperationsSnapshot(fullSnapshot, withoutRequests, "2026-07-17");
assert.deepEqual(requestProjection.requests, []);
assert.equal(requestProjection.summary.waiting_responses, 0);
assert.deepEqual(requestProjection.deleted_request_ids, []);

const withoutCustomers = fullSnapshot.business_capabilities.filter(
  (capability) => capability !== C.CUSTOMERS && capability !== C.REQUESTS
);
const customerProjection = projectAndroidOperationsSnapshot(fullSnapshot, withoutCustomers, "2026-07-17");
assert.deepEqual(customerProjection.requests, []);
assert.deepEqual(customerProjection.customers, []);
assert.deepEqual(customerProjection.messages, []);
assert.equal(customerProjection.summary.prepared_whatsapp_messages, 0);
assert.equal(androidActionAllowedByCapabilities("message_delete", withoutCustomers), false);
assert.doesNotMatch(frameSource, /Web'e Yayınla/, "manual menu publish action must stay out of the page header");
assert.match(
  navigationSource,
  /pageId:\s*"menu"[\s\S]{0,320}condition:\s*\{\s*allOf:\s*\[C\.FOOD_MENU\]\s*\}/,
  "desktop Menu navigation must remain available independently of the QR menu module"
);
assert.match(qrMenuPanelSource, /getQrMenuWebPublication/);
assert.match(qrMenuPanelSource, /setQrMenuWebPublication/);
assert.match(qrMenuPanelSource, /disabled=\{!moduleEnabled \|\| busy\}/);
assert.match(
  menuManagerSource,
  /qrMenuEnabled\s*&&\s*\([\s\S]{0,180}<QrMenuPanel\s+enabled/,
  "QR menu controls must disappear when the Settings QR module is disabled"
);
assert.match(
  menuManagerSource,
  /menu-drag-handle-hitbox[\s\S]{0,220}draggable=\{!reorderBusy\}[\s\S]{0,220}onDragStart/,
  "menu reordering must start from the drag handle instead of stealing normal row clicks"
);
assert.match(
  menuManagerSource,
  /menu-category-row__main menu-category-row__select[\s\S]{0,220}aria-label=\{category\.name\}[\s\S]{0,260}onSelectCategory\(category\)/,
  "the category content surface must remain directly selectable"
);
assert.doesNotMatch(
  menuProductEntryFieldsSource,
  /form\.(?:name|description|image_url|stock_quantity|stock_unit)/,
  "Menu fields must not own a second canonical product or stock draft"
);
assert.match(
  menuCssSource,
  /\.menu-image-preview-frame > img\s*\{[\s\S]{0,180}object-fit:\s*contain/,
  "product image preview must show the full image instead of cropping it"
);
assertHandlerGuard(menuIpcSource, "menu:setWebPublication", "assertCapability(BUSINESS_CAPABILITIES.QR_MENU");
assert.match(
  menuCssSource,
  /\.menu-page-layout\s*\{[\s\S]{0,200}gap:\s*var\(--space-3\)/,
  "QR service panel must keep a visible gap above the menu management grid"
);
assert.match(testSiteHeaderSource, /'qr_menu'=>site_qr_menu_available\(\)/, "site navigation availability uses the QR publication gate");
assert.match(
  testSiteQrMenuSource,
  /response\.status === 404[\s\S]{0,120}window\.location\.replace\("\/"\)/,
  "an already-open QR menu page must leave the hidden publication instead of showing an error shell"
);
assert.match(menuManagerSource, /stockImageImportEnabled\s*\?[\s\S]{0,220}<StockImageImportWorkspace/);
assert.match(menuProductEntryFieldsSource, /inventoryEnabled && <label/);
assert.match(menuPreviewSource, /whatsappEnabled\s*&&\s*setupData\.whatsapp/);
const normalizedRoomAccountSource = roomAccountSource.replace(/\s+/g, " ");
assert.match(
  normalizedRoomAccountSource,
  /item\.kind === "menu" && menuEnabled/,
  "Room account menu surface must remain gated by the food menu capability"
);
const normalizedRoomAccountAdjustmentsSource = roomAccountAdjustmentsSource.replace(/\s+/g, " ");
assert.match(
  normalizedRoomAccountAdjustmentsSource,
  /<MenuProductPicker[^>]*enabled=\{menuEnabled\}/,
  "Room account menu surface must remain gated by the food menu capability"
);
const normalizedTableOrdersSource = tableOrdersSource.replace(/\s+/g, " ");
assert.match(
  normalizedTableOrdersSource,
  /<MenuProductPicker[^>]*enabled=\{menuEnabled\}/,
  "Restaurant order menu surface must remain gated by the food menu capability"
);
assert.match(roomFolioIpcSource, /if \(!hasRoomCapability\(\)\)[\s\S]{0,120}return unavailableRoomData\(\)/);
assert.match(
  handlerSource(tableOrderIpcSource, "tableOrder:getActive"),
  /if \(!canReadFoodOrders\(\)\) return null/,
  "stale table workspace reads must resolve empty after food orders are disabled"
);
assert.match(
  handlerSource(tableOrderIpcSource, "tableOrder:list"),
  /if \(!canReadFoodOrders\(\)\) return \[\]/,
  "stale table history reads must resolve empty after food orders are disabled"
);
assert.match(
  frameSource,
  /enabledHospitalityPages=\{\{[\s\S]{0,300}ACCOMMODATION_ROOMS[\s\S]{0,300}FOOD_TABLES/,
  "persistent hospitality workspaces must be invalidated when their base sector capability disappears"
);
assert.match(roomFolioIpcSource, /options\.assertMenuCapability\?\.\(\)/);
assert.match(financeIpcSource, /finance:setReservationTotal[\s\S]{0,300}assertAccommodationReservationCapability/);
assert.match(financeIpcSource, /finance:addPensionPayment[\s\S]{0,300}assertAccommodationFolioCapability/);
assert.match(financeWorkspaceSource, /accommodationFolioEnabled\s*&&\s*<MetricCard[^>]*title="Bekleyen Alacak"/);
assert.match(financeWorkspaceSource, /if \(category\.id === "pension"\) return accommodationEnabled/);
assert.match(financeWorkspaceSource, /if \(category\.id === "restaurant"\) return foodServiceEnabled/);
assert.match(androidFinanceSource, /hasBusinessCapability\(AndroidUiRules\.CAPABILITY_FOLIO\)[\s\S]{0,180}Bekleyen oda alacağı/);
assert.match(
  androidUiRulesSource,
  /CAPABILITY_ACCOMMODATION_RESERVATIONS\)[\s\S]{0,120}hasPermission\("reservation\.view"\)/
);
assert.match(androidMainSource, /canOpenTab\(destination\.tab\)/);
assert.match(androidSyncClientSource, /android_capability_disabled[\s\S]{0,300}invalidatesPendingAction/);
assert.match(androidSyncControllerSource, /operationCache\.clear\(\)[\s\S]{0,120}actionOutbox\.clear\(\)/);
assert.match(androidActivitySource, /provisioningController\.bootstrap\(identity\)/);
assert.match(hostingSyncSource, /ya_sync_android_action_permission\([\s\S]{0,300}android_action_permission_denied/);
assert.match(
  hostingSyncSource,
  /ya_sync_get_visible_android_actions\([\s\S]{0,900}ya_sync_android_action_capability_allowed/,
  "hosted Android action history must be filtered by current permissions and capabilities"
);
assert.match(
  functionSource(mainSource, "async function saveInitialSetupFromRenderer"),
  /getDatabase\(\)\.saveInitialSetup\([\s\S]*if \(!localResult\.ok\)/,
  "setup IPC must delegate persistence to DesktopDatabase and propagate failure; smoke-setup-profile-contract verifies capabilities and publication"
);
assert.match(
  handlerSource(dailyTaskIpcSource, "dailyTask:save"),
  /existingTask[\s\S]*assertTaskScope\(\s*existingTask\.taskType[\s\S]*assertTaskScope\(String\(input\?\.taskType/,
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

// D — Market keeps retail capabilities while non-retail Android groups lose domain permissions.
const marketCapabilities = [
  ...getBusinessProfile("market").defaultCapabilities,
  C.ANDROID
];
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
  "market.product_create",
  "market.cart_draft",
  "market.scan_to_desktop"
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
assert.doesNotMatch(
  messageWorkspaceSource,
  /aiEnabled|aiState|onRewrite|ai_suggested_reply|rewrite/i,
  "Hazır Mesajlar outbox must stay a delivery surface without AI controls"
);
assert.match(
  messageWorkspaceSource,
  /Hazır yanıt/,
  "outbox safe view must keep the prepared-response delivery label"
);
assert.match(
  messagingControllerSource,
  /handleCreateOwnerReplySuggestion/,
  "request AI suggestion ownership must live in the messaging controller"
);
assert.match(
  messagingControllerSource,
  /handleRewriteRequestReply/,
  "request AI rewrite ownership must live in the messaging controller"
);
assert.match(
  messagingControllerSource,
  /acquireRequestAiOperation/,
  "request AI mutations must stay request-scoped"
);
assert.match(desktopProjectionSource, /newRequests: requestsEnabled \? source\.summary\.newRequests : 0/);
assert.match(desktopProjectionSource, /waitingRequests: requestsEnabled \? source\.summary\.waitingRequests : 0/);
assert.match(
  customerWorkRouteSource,
  /<WhatsAppWorkspace[\s\S]{0,180}requests=\{readyWhatsAppRequests\}/,
  "outbox surfaces must consume the controller-owned prepared-message queue"
);
assert.doesNotMatch(
  routerSource,
  /surfaceReadyWhatsAppRequests|surfaceSelectedWhatsAppRequest/,
  "router must not re-derive the prepared-message queue beside the controller"
);
assert.match(
  dashboardSource,
  /<h2>\{hasCapacityMetrics \? "İşletme kapasitesi" : "Günlük değerlendirme"\}<\/h2>/,
  "an AI-only dashboard must not retain the business-capacity heading"
);
assert.doesNotMatch(systemHealthSource, /AI devre dışı olsa|Android modülü bu işletmede kullanılmıyor/);
// UX consolidation: navigation presentations are static label+title; capability gating lives in conditions, not copy.
assert.doesNotMatch(navigationSource, /eyebrow/, "navigation copy must not carry eyebrow presentation");
assert.doesNotMatch(
  navigationSource,
  /description:/,
  "navigation copy must not carry description presentation"
);
assert.match(
  navigationSource,
  /presentation:\s*\{\s*label:\s*"Ana Ekran",\s*title:\s*"Bugün ne var\?"\s*\}/,
  "dashboard presentation is a static label+title"
);
assert.match(
  navigationSource,
  /presentation:\s*\{\s*label:\s*"Müşteri İşleri",\s*title:\s*"Müşteri İşleri"\s*\}/,
  "customer-work presentation is a static label+title"
);
assert.match(frameSource, /title=\{pageMeta\.title\}/, "page header consumes the static navigation title");
assert.doesNotMatch(frameSource, /pageMeta\.(eyebrow|description)/, "page header must not read removed navigation copy");

// E — a composed pension + retail set exposes both domains without inventing food service.
const pensionRetail = new Set([
  ...getBusinessProfile("pension").defaultCapabilities,
  C.ANDROID,
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
// Executable retail/manual-sale/wholesale/runtime and persisted navigation cases
// live in sales-correctness and sales-workspace-ui; don't freeze the old tool-only gate.
assert.doesNotMatch(navigationSource, /profileId\s*===|profile\s*===/, "Navigation must not introduce profile-name gates.");
for (const profileId of ["pension_restaurant", "pension", "restaurant"]) {
  const capabilities = getBusinessProfile(profileId).defaultCapabilities;
  assert.equal(capabilities.includes(C.RETAIL_BARCODE), false, `${profileId} must not expose the retail Satış surface`);
}
assert.equal(getBusinessProfile("market").defaultCapabilities.includes(C.RETAIL_BARCODE), true);
assert.match(
  navigationSource,
  /financeEnabled \? "Kasa" : "Raporlar"/,
  "reports presentation keeps the finance-driven Kasa/Raporlar title"
);
assert.doesNotMatch(navigationSource, /bekleyen oda alacaklarını/, "folio copy must not live in navigation presentation");
assert.match(
  businessAiServiceSource,
  /evaluateBusinessAiInput\(capabilities, request\.request_type,/,
  "owner reply AI must hard-guard unsupported sector intent before provider generation"
);
assert.match(
  businessAiServiceSource,
  /return database\.saveRequestAiSuggestion\([\s\S]{0,700}missingFields:\s*\[\]/,
  "unsupported sector intent must save a deterministic local reply instead of calling the provider"
);
assert.match(
  webChatSource,
  /ya_business_ai_evaluate\([\s\S]{0,1200}unsupported_business_domain/,
  "web chat must enforce the same unsupported-domain guard before provider generation"
);
assert.match(webChatSource, /capability_ids/, "web chat must consume published capability ids");
// Cross-language mapping and runtime behavior are protected by business-ai-boundary.

// F — admin expands role grants, then intersects them with business capabilities.
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
console.log("capability-surface-consistency-smoke-ok: A-F verified");

function verifyPersistedRuntimeSource() {
  const dataDir = mkdtempSync(join(tmpdir(), "yardimci-capability-surface-"));
  const database = new DesktopDatabase({
    appPath: join(process.cwd(), "apps", "desktop-app"),
    userDataPath: dataDir
  });
  try {
    database.initialize();
    const setupResult = database.saveInitialSetup({
      businessName: "Capability Test İşletmesi",
      profileId: "market",
      phone: "+905550000600",
      whatsapp: "+905550000600",
      email: "",
      address: "",
      webModuleUrl: "https://example.test/yardimci-asistan",
      syncSecret: "capability-test-secret-123",
      autoSyncEnabled: false,
      aiEnabled: false,
      aiProvider: "openai_compatible",
      aiService: "openai",
      aiProjectName: "",
      aiModel: "",
      aiModelOptions: [],
      aiBaseUrl: "https://api.openai.com/v1",
      aiTimeoutSeconds: 30,
      aiApiKey: "",
      clearAiApiKey: false,
      servicePreferences: { whatsapp: true, android: true },
      initialCounts: { rooms: 0, tables: 0 },
      tableCategories: []
    });
    assert.equal(setupResult.ok, true, setupResult.ok ? "" : setupResult.message);
    const market = applyBusinessProfileCapabilities(database.databasePath, "market", { preserveUserOverrides: false });
    const expected = [...market.enabledCapabilities].sort();

    assert.deepEqual(database.getEnabledBusinessCapabilities().sort(), expected);
    const setup = database.getSetupData();
    assert.equal(setup.profileId, "market");
    assert.deepEqual(setup.servicePreferences, { whatsapp: false, android: false });

    seedContextualReportTasks(database.databasePath);
    applyBusinessProfileCapabilities(database.databasePath, "restaurant", { preserveUserOverrides: false });
    assert.equal(contextualTaskReport(database).summary.pendingTasks, 1);
    assert.equal(contextualTaskReport(database).summary.approvedReservations, 3);
    assert.equal(contextualTaskReport(database).summary.newRequests, 1);
    const currentBusiness = readBusinessCapabilitySnapshot(database.databasePath);
    setCapabilityEnabled(database.databasePath, currentBusiness.businessId, C.REQUESTS, false);
    assert.equal(contextualTaskReport(database).summary.newRequests, 0);
    assert.equal(contextualTaskReport(database).attention.pendingRequests, 0);
    setCapabilityEnabled(database.databasePath, currentBusiness.businessId, C.REQUESTS, true);
    applyBusinessProfileCapabilities(database.databasePath, "pension", { preserveUserOverrides: false });
    assert.equal(contextualTaskReport(database).summary.pendingTasks, 1);
    assert.equal(contextualTaskReport(database).summary.approvedReservations, 3);
    assert.throws(() => setBusinessCapability(database.databasePath, { capability: C.FOOD_TABLES, enabled: true }), /profilinde/);
    applyBusinessProfileCapabilities(database.databasePath, "pension_restaurant", { preserveUserOverrides: false });
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
    for (const capability of [C.ACCOMMODATION_ROOMS, C.ACCOMMODATION_RESERVATIONS, C.ACCOMMODATION_STAYS, C.ACCOMMODATION_FOLIO]) {
      assert.throws(() => setBusinessCapability(database.databasePath, { capability, enabled: true }), /profilinde/);
    }
    const retail = readBusinessCapabilitySnapshot(database.databasePath);
    assert.equal(retail.enabledCapabilities.includes(C.RETAIL_BARCODE), true);
    assert.equal(retail.enabledCapabilities.includes(C.ACCOMMODATION_RESERVATIONS), false);

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
  const fixture = JSON.parse(source("scripts/fixtures/android-operations-snapshot.json"));
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
    business_capabilities: [...new Set([...fixture.business_capabilities, C.REQUESTS])],
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

function assertHandlerGuard(contents, channel, guard) {
  const start = contents.indexOf(`ipcMain.handle("${channel}"`);
  assert.notEqual(start, -1, `${channel} handler missing`);
  assert.equal(contents.slice(start, start + 500).includes(guard), true, `${channel} is not capability guarded`);
}

function handlerSource(contents, channel, length = 1_500) {
  const channelPosition = contents.indexOf(`"${channel}"`);
  const start = channelPosition === -1 ? -1 : contents.lastIndexOf("ipcMain.handle(", channelPosition);
  assert.notEqual(start, -1, `${channel} handler missing`);
  assert.equal(channelPosition - start < 120, true, `${channel} is not an IPC handler`);
  return contents.slice(start, start + length);
}

function functionSource(contents, fnName, length = 3_500) {
  const start = contents.indexOf(fnName);
  assert.notEqual(start, -1, `${fnName} missing`);
  return contents.slice(start, start + length);
}

function source(relativePath) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}
