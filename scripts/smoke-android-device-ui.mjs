import assert from "node:assert/strict";
import { publicationEnvelope } from "./test-helpers/publication-protocol.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertBottomNavClearance,
  assertContains,
  assertCounterStripFits,
  assertHeaderActionOrder,
  assertIconOnly,
  assertNodeHeightAtMost,
  assertNotContains,
  assertOrderActionGrid,
  assertSquareTouchTarget,
  centerOf,
  findBoundsByContentDescriptionPrefix,
  findBoundsByResourceId,
  findBoundsByText,
  findBoundsByTextIfPresent,
  findClickableBoundsByDescription,
  findClickableBoundsByText,
  findNotificationClickBounds,
  findNotificationGroupExpandBounds
} from "./lib/android-ui-xml.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = join(repoRoot, "artifacts", "android-device-ui");
const packageName = "com.yardimciasistan.android";
const activityName = ".MainActivity";
const businessConfig = JSON.parse(readFileSync(join(repoRoot, "firm-template", "web-module", "config", "business.json"), "utf8"));
const syncSecret = String(businessConfig.sync_secret ?? "").trim();
const androidSnapshotFixtureFile = join(repoRoot, "scripts", "fixtures", "android-operations-snapshot.json");
const stockGalleryFixture = join(repoRoot, "firm-template", "web-module", "assets", "yardimci-asistan-symbol.png");
const stockGalleryDeviceFile = "/sdcard/Download/yardimci-stock-image-smoke.png";
const generatedConnectionDefaultsFile = join(repoRoot, "apps", "android-app", "build", "generated", "source", "connection", "com", "yardimciasistan", "android", "ConnectionDefaults.java");
const serviceOrderPermissions = [
  "table.view",
  "table.update_status",
  "table_order.view",
  "table_order.open",
  "table_order.add_item",
  "table_order.update_item",
  "table_order.remove_item",
  "table_order.set_preparing",
  "table_order.set_served",
  "table_order.set_payment_waiting",
  "menu.view",
  "menu.stock_view"
];
const roomsTasksPermissions = [
  "room.view",
  "room.update_status",
  "daily_task.view",
  "daily_task.complete",
  "daily_task.reopen"
];
const cashierPermissions = [
  "table.view",
  "table_order.view",
  "table_order.set_payment_waiting",
  "table_order.close_paid",
  "menu.stock_view"
];
const customerReservationPermissions = [
  "customer.view",
  "customer.respond",
  "customer.mark_answered",
  "reservation.view",
  "reservation.approve"
];
const marketPermissions = [
  "market.summary.view",
  "market.product.view",
  "market.stock_count",
  "market.receiving",
  "market.product_create",
  "market.cart_draft",
  "market.scan_to_desktop"
];
const staffPermissions = [...serviceOrderPermissions, ...roomsTasksPermissions];
const adminPermissions = [
  "customer.view",
  "customer.manage",
  "customer.respond",
  "customer.mark_answered",
  "customer.reject",
  "customer.convert_to_reservation",
  "customer.delete",
  "request.delete",
  "reservation.view",
  "reservation.create",
  "reservation.update",
  "reservation.approve",
  "reservation.reject",
  "reservation.cancel",
  "room.view",
  "room.update_status",
  "room.assign_customer",
  "room_folio.view",
  "room_folio.payment",
  "room_folio.checkout",
  "daily_task.view",
  "daily_task.create",
  "daily_task.update",
  "daily_task.delete",
  "daily_task.complete",
  "daily_task.reopen",
  "table.view",
  "table.update_status",
  "table_order.view",
  "table_order.open",
  "table_order.add_item",
  "table_order.update_item",
  "table_order.remove_item",
  "table_order.set_preparing",
  "table_order.set_served",
  "table_order.set_payment_waiting",
  "table_order.close_paid",
  "table_order.cancel",
  "menu.view",
  "menu.edit",
  "menu.delete",
  "menu.stock_view",
  "menu.stock_update",
  "finance.view",
  "finance.create",
  "settings.view",
  "settings.edit",
  "message.delete",
  "android_devices.view",
  "android_devices.manage"
];
let snapshotRevision = 100;
let uiTestBaseUrl = "";
let deviceIdBeforeUiReset = "";
let originalDeviceOrientation = null;

const options = parseArgs(process.argv.slice(2));
let phoneTest = null;
let companionPreferencesBackup = null;

process.once("SIGINT", () => stopAndExit(0));
process.once("SIGTERM", () => stopAndExit(0));

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  cleanup();
  await waitForPhoneTestExit();
  restoreCompanionPreferences();
}

async function main() {
  ensureArtifactDir();
  ensureAdbDevice();
  lockDevicePortrait();
  if (options.companionOnly) backupCompanionPreferences();
  else prepareStockGalleryFixture();

  phoneTest = startPhoneTest();
  await waitForReady(phoneTest, options.readyTimeoutMs);
  const baseUrl = getPhoneTestBaseUrl(phoneTest.output);
  uiTestBaseUrl = baseUrl;
  prepareAppForUi(baseUrl);
  await delay(options.settleMs);
  await waitForUiText("Öncelikli işler", 12000);
  if (options.companionOnly) {
    await runCompanionOnly(baseUrl);
    console.log("android-companion-device-ui-smoke-ok");
    return;
  }
  if (options.marketOnly) {
    await runMarketOnly(baseUrl);
    await restoreEmbeddedConnectionAfterTest();
    console.log("android-market-device-ui-smoke-ok");
    cleanup();
    await waitForPhoneTestExit();
    return;
  }
  if (options.reportsOnly) {
    await runReportsOnly(baseUrl);
    await restoreEmbeddedConnectionAfterTest();
    console.log("android-reports-device-ui-smoke-ok");
    cleanup();
    await waitForPhoneTestExit();
    return;
  }
  if (options.stockImageOnly) {
    await runStockImageOnly(baseUrl);
    await restoreEmbeddedConnectionAfterTest();
    console.log("android-stock-image-device-ui-smoke-ok");
    cleanup();
    await waitForPhoneTestExit();
    return;
  }
  scrollToTop();
  await delay(400);

  let topXml = dumpUi("top.xml");
  for (let index = 0; index < 3 && topXml.includes('content-desc="Gece moduna geç"'); index += 1) {
    adb(["shell", "cmd", "statusbar", "collapse"], { allowFailure: true });
    await delay(300);
    tap(centerOf(findClickableBoundsByDescription(topXml, "Gece moduna geç")));
    await delay(800);
    topXml = dumpUi(`top-theme-normalize-${index}.xml`);
  }
  if (!topXml.includes('content-desc="Gündüz moduna geç"')) {
    throw new Error("UI smoke başlangıç teması geceye alınamadı.");
  }
  captureScreenshot("top.png");
  assertContains(topXml, ["Bugün", "Öncelikli işler", "Pansiyon", "Restoran", 'content-desc="Yenile"', 'content-desc="Gündüz moduna geç"', 'content-desc="Ayarlar"', 'text="İş 2"', 'text="Oda 1"', 'text="Hesap 0"', 'text="Stok yok 1"']);
  assertNotContains(topXml, ["GÜNLÜK OPERASYON", 'content-desc="Bildirimler"', 'text="Müşteri"', 'text="Mesajlar"', "Canlı veri çekiliyor", "Canlı veri alındı", "Veriler zaten güncel", "Son yayın:"]);
  assertCounterStripFits(topXml, ["İş 2", "Oda 1", "Hesap 0", "Stok yok 1"]);
  assertSquareTouchTarget(topXml, "Yenile");
  assertSquareTouchTarget(topXml, "Gündüz moduna geç");
  assertSquareTouchTarget(topXml, "Ayarlar");
  assertIconOnly(topXml, "Gündüz moduna geç");
  assertHeaderActionOrder(topXml, "Gündüz moduna geç");

  tap(centerOf(findClickableBoundsByDescription(topXml, "Gündüz moduna geç")));
  const dayThemeXml = await waitForUiCondition(
    (xml) => xml.includes('content-desc="Gece moduna geç"'),
    5000,
    "Gündüz teması anında uygulanmadı."
  );
  captureScreenshot("today-day-theme.png");
  assert.equal(readPreferenceValue("app_theme_mode"), "day", "Gündüz teması kalıcı tercihe yazılmadı.");
  assertSquareTouchTarget(dayThemeXml, "Gece moduna geç");
  assertIconOnly(dayThemeXml, "Gece moduna geç");
  assertHeaderActionOrder(dayThemeXml, "Gece moduna geç");

  relaunchApp();
  const persistedDayThemeXml = await waitForUiCondition(
    (xml) => xml.includes('content-desc="Gece moduna geç"') && xml.includes('text="Bugün"'),
    12000,
    "Gündüz teması uygulama yeniden açıldığında korunmadı."
  );
  assert.equal(readPreferenceValue("app_theme_mode"), "day", "Yeniden açılışta gündüz tercihi değişti.");
  tap(centerOf(findClickableBoundsByDescription(persistedDayThemeXml, "Gece moduna geç")));
  await waitForUiCondition(
    (xml) => xml.includes('content-desc="Gündüz moduna geç"'),
    5000,
    "Gece teması anında uygulanmadı."
  );
  assert.equal(readPreferenceValue("app_theme_mode"), "night", "Gece teması kalıcı tercihe yazılmadı.");
  relaunchApp();
  topXml = await waitForUiCondition(
    (xml) => xml.includes('content-desc="Gündüz moduna geç"') && xml.includes('text="Bugün"'),
    12000,
    "Gece teması uygulama yeniden açıldığında korunmadı."
  );
  assert.equal(readPreferenceValue("app_theme_mode"), "night", "Yeniden açılışta gece tercihi değişti.");
  scrollToTop();
  await delay(350);

  scrollToBottom();
  await delay(350);
  const todayBottomXml = dumpUi("today-bottom-safe.xml");
  assertBottomNavClearance(todayBottomXml, "Stoku Aç", "Bugün", 160);

  const deviceId = readDeviceId();
  if (deviceIdBeforeUiReset) {
    assert.equal(deviceId, deviceIdBeforeUiReset, "UI testi hazırlanırken telefon kimliği değişti.");
  }
  for (let index = 0; index < 2; index += 1) {
    swipe(360, 1080, 360, 360, 400);
    await delay(300);
  }
  const beforeRefreshXml = dumpUi("before-background-refresh.xml");
  assertNotContains(beforeRefreshXml, ["GÜNLÜK OPERASYON"]);
  await publishDeviceRole(baseUrl, deviceId, "staff");
  const afterRefreshXml = await waitForUiCondition(
    (xml) => xml.includes("Personel ·") && xml.includes('content-desc="Ayarlar"') && xml.includes('content-desc="Yenile"') && xml.includes('content-desc="Gündüz moduna geç"'),
    20000,
    "Personel yetki profili Android arayüzüne uygulanmadı."
  );
  assertNotContains(afterRefreshXml, ["GÜNLÜK OPERASYON", "Canlı veri çekiliyor", "Canlı veri alındı", "Veriler zaten güncel", "Son yayın:"]);
  scrollToTop();
  await delay(400);

  topXml = dumpUi("staff-top.xml");
  captureScreenshot("staff-top.png");
  assertContains(topXml, ["Personel", 'content-desc="Ayarlar"', 'content-desc="Yenile"', 'content-desc="Gündüz moduna geç"', 'text="Oda 1"', 'text="Hesap 0"', "Pansiyon", "Restoran"]);
  assertNotContains(topXml, ['content-desc="Bildirimler"', 'text="Müşteri"', 'text="Mesajlar"', syncSecret]);
  tap(centerOf(findClickableBoundsByDescription(topXml, "Ayarlar")));
  await delay(400);
  const staffSettingsXml = dumpUi("staff-settings.xml");
  assertContains(staffSettingsXml, ["Ayarlar", "Görünüm", "Tema", "Gece Modu", 'content-desc="Gündüz moduna geç"', "Bildirim tercihleri", "Restoran / Sipariş", "Oda / Günlük İş", "İşlem hataları"]);
  assertNotContains(staffSettingsXml, ["Bildirimler", "Sync bağlantısı", "Bağlantı özeti", "Güvenlik anahtarı", "İşletme raporları", "Raporları Aç", syncSecret]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await delay(300);
  adb([
    "shell", "am", "start", "-n", `${packageName}/${activityName}`,
    "--es", "ya_notification_route", "reports"
  ]);
  const deniedReportRouteXml = await waitForUiCondition(
    (xml) => xml.includes("Bu cihazın raporlara erişim yetkisi yok.")
      && xml.includes('text="Bugün"')
      && !xml.includes('text="Raporlar"'),
    8000,
    "Personel rapor deep link denemesi fail-closed reddedilmedi."
  );
  writeFileSync(join(artifactDir, "staff-report-route-denied.xml"), deniedReportRouteXml);

  relaunchAppWithConnectionExtras("https://override.invalid/device-hijack", "override-secret-not-allowed");
  await waitForUiCondition(
    (xml) => xml.includes('text="Bugün"') && xml.includes('content-desc="Yenile"'),
    12000,
    "Bağlantı extra denemesinden sonra uygulama operasyon ekranına dönemedi."
  );
  assert.notEqual(readPreferenceValue("web_module_url"), "https://override.invalid/device-hijack");
  assert.notEqual(readPreferenceValue("sync_secret"), "override-secret-not-allowed");
  await publishDeviceRole(baseUrl, deviceId, "staff");
  relaunchApp();
  await waitForUiCondition(
    (xml) => xml.includes("Personel") && xml.includes('text="Pansiyon"') && xml.includes('content-desc="Ayarlar"'),
    12000,
    "Geçici test bağlantısı yeniden uygulanamadı."
  );
  await publishMissingDeviceProfile(baseUrl);
  relaunchApp();
  await waitForUiCondition(
    (xml) => xml.includes("Cihaz Pasif") && xml.includes("Bu cihaz pasifleştirildi"),
    12000,
    "Eksik cihaz profili eski personel yetkilerini fail-closed kapatmadı."
  );
  assert.equal(readPreferenceValue("device_id"), deviceId);

  await publishDeviceRole(baseUrl, deviceId, "staff");
  relaunchApp();
  await waitForUiCondition(
    (xml) => xml.includes("Personel") && xml.includes('text="Pansiyon"') && xml.includes('content-desc="Ayarlar"'),
    12000,
    "Personel profili eksik profil testinden sonra yeniden uygulanamadı."
  );

  topXml = dumpUi("staff-after-profile-gap.xml");
  tap(centerOf(findClickableBoundsByText(topXml, "Pansiyon")));
  await delay(400);
  const staffPensionRoomsXml = dumpUi("staff-pension-rooms.xml");
  assertContains(staffPensionRoomsXml, ["Odalar", "İşler", "Balkonlu Oda", "Temizlik", "Durumu Değiştir"]);
  assertNotContains(staffPensionRoomsXml, ["Oda 101 giriş hazırlığı", "Tamamla", "Rezervasyonlar"]);
  tap(centerOf(findClickableBoundsByText(staffPensionRoomsXml, "İşler")));
  const staffPensionTasksXml = await waitForUiCondition(
    (xml) => xml.includes("Oda 101 giriş hazırlığı") && !xml.includes("Bahçe servis kontrolü"),
    5000,
    "Personel günlük iş modu açılmadı."
  );
  writeFileSync(join(artifactDir, "staff-pension-tasks.xml"), staffPensionTasksXml);
  assertContains(staffPensionTasksXml, ["Oda 101 giriş hazırlığı", "Tamamla"]);
  assertNotContains(staffPensionTasksXml, ["Bahçe servis kontrolü", "Balkonlu Oda", "Aile Odası"]);

  tap(centerOf(findClickableBoundsByText(staffPensionTasksXml, "Restoran")));
  await delay(500);

  let staffRestaurantXml = dumpUi("staff-restaurant.xml");
  assertContains(staffRestaurantXml, ["Masalar", "Açık Adisyon", "İşler", "Stok", "Salon Masası 1", "Siparişi Aç"]);
  assertNotContains(staffRestaurantXml, ["Ev Limonatası", "Aktif adisyonlar"]);
  tap(centerOf(findClickableBoundsByText(staffRestaurantXml, "İşler")));
  const staffRestaurantTasksXml = await waitForUiCondition(
    (xml) => xml.includes("Bahçe servis kontrolü") && !xml.includes("Oda 101 giriş hazırlığı"),
    5000,
    "Personel restoran iş modu açılmadı."
  );
  assertNotContains(staffRestaurantTasksXml, ["Oda 101 giriş hazırlığı", "Salon Masası 1"]);
  tap(centerOf(findClickableBoundsByText(staffRestaurantTasksXml, "Masalar")));
  staffRestaurantXml = await waitForUiCondition(
    (xml) => xml.includes("Salon Masası 1") && xml.includes("Siparişi Aç"),
    5000,
    "Personel restoran masa moduna dönemedi."
  );
  tap(centerOf(findBoundsByText(staffRestaurantXml, "Siparişi Aç")));
  await delay(500);
  const staffOrderXml = dumpUi("staff-table-order.xml");
  captureScreenshot("staff-table-order.png");
  assertContains(staffOrderXml, ["MASA SİPARİŞİ", 'content-desc="Gündüz moduna geç"', "Açık · 2 ürün · ₺900,00", "Ürün ara", "Hazırlanıyor", "Servis Edildi", "Hesap Bekliyor"]);
  assertSquareTouchTarget(staffOrderXml, "Gündüz moduna geç");
  assertIconOnly(staffOrderXml, "Gündüz moduna geç");
  assertNotContains(staffOrderXml, ["Ödendi / Kapat"]);
  assertOrderActionGrid(staffOrderXml, false);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await delay(300);
  const staffRestaurantAfterOrderXml = dumpUi("staff-restaurant-after-order.xml");
  tap(centerOf(findClickableBoundsByText(staffRestaurantAfterOrderXml, "Stok")));
  await delay(400);
  let staffStockXml = "";
  for (let index = 0; index < 8; index += 1) {
    const currentXml = dumpUi(`staff-stock-${index}.xml`);
    staffStockXml += currentXml;
    if (staffStockXml.includes("Stokta yok")
        && staffStockXml.includes("Az stok")
        && staffStockXml.includes("Tüm takip edilen ürünler")
        && staffStockXml.includes("Ev Limonatası")) {
      break;
    }
    swipe(360, 900, 360, 300, 420);
    await delay(300);
  }
  assertContains(staffStockXml, ["Stokta yok", "Az stok", "Tüm takip edilen ürünler", "Ev Limonatası", "Serpme Kahvaltı"]);
  assertNotContains(staffStockXml, ["AI DESTEKLİ STOK GİRİŞİ", "Kamera ile çek", "Galeriden seç", "Stok Güncelle", "+1 adet Ekle", "Miktarı Ayarla", "Fark Gir"]);

  await publishDeviceRole(baseUrl, deviceId, "staff", { permissions: serviceOrderPermissions });
  relaunchApp();
  const serviceOnlyXml = await waitForUiCondition(
    (xml) => xml.includes("Personel") && xml.includes('text="Restoran"') && !xml.includes('text="Pansiyon"'),
    12000,
    "Oda / Günlük İşler kapatıldığında pansiyon aksiyonları gizlenmedi."
  );
  assertNotContains(serviceOnlyXml, ['text="Pansiyon"', 'text="Müşteri"', 'text="Mesajlar"', "Boş odalar"]);

  const notificationRequestId = "request_android_notification_smoke_001";
  const notificationCustomerName = "Bildirim Smoke Misafiri";
  await publishNotificationRequest(baseUrl, deviceId, serviceOrderPermissions, notificationRequestId, notificationCustomerName, "new");
  relaunchApp();
  await waitForUiCondition(
    (xml) => xml.includes("Personel") && xml.includes('text="Restoran"') && !xml.includes('text="Müşteri"'),
    12000,
    "Yetkisiz bildirim snapshot'ı servis profiliyle alınmadı."
  );
  await delay(700);
  assert.equal(notificationDump().includes(notificationCustomerName), false, "customer.view olmayan cihaz müşteri bildirimi aldı.");

  await publishNotificationRequest(baseUrl, deviceId, customerReservationPermissions, notificationRequestId, notificationCustomerName, "new");
  relaunchApp();
  await waitForUiCondition(
    (xml) => xml.includes("Personel") && xml.includes('text="Müşteri"'),
    12000,
    "Müşteri yetkisi bildirim snapshot'ıyla uygulanmadı."
  );
  await waitForNotificationText(notificationCustomerName, 12000);
  const notificationEventKey = `request:${notificationRequestId}:new`;
  assert.equal(countOccurrences(readPreferenceValue("notification_event_ledger_v1"), notificationEventKey), 1, "Bildirim event key ledger'da tekil değil.");

  const repeatedNotificationSnapshotAt = await publishNotificationRequest(
    baseUrl,
    deviceId,
    customerReservationPermissions,
    notificationRequestId,
    notificationCustomerName,
    "new"
  );
  await waitForCachedSnapshotText(repeatedNotificationSnapshotAt, 45000);
  await waitForNotificationText(notificationCustomerName, 12000);
  assert.equal(countOccurrences(readPreferenceValue("notification_event_ledger_v1"), notificationEventKey), 1, "Aynı snapshot bildirimi ledger'da çoğalttı.");

  await publishNotificationRequest(baseUrl, deviceId, customerReservationPermissions, notificationRequestId, notificationCustomerName, "answered");
  await waitForNotificationAbsence(notificationCustomerName, 45000);

  const notificationClickRequestId = "request_android_notification_click_smoke_001";
  const notificationClickCustomer = "Tıklama Smoke Misafiri";
  const notificationClickSnapshotAt = await publishNotificationRequest(
    baseUrl,
    deviceId,
    customerReservationPermissions,
    notificationClickRequestId,
    notificationClickCustomer,
    "new"
  );
  await waitForCachedSnapshotText(notificationClickSnapshotAt, 45000);
  await waitForNotificationText(notificationClickCustomer, 12000);
  const notificationClickMessage = `${notificationClickCustomer} · Yerel bildirim izin ve spam testi.`;
  let notificationShadeXml = await waitForNotificationShadeMessage(notificationClickMessage, 15000);
  const notificationGroupExpandBounds = findNotificationGroupExpandBounds(
    notificationShadeXml,
    notificationClickMessage,
    notificationClickCustomer
  );
  if (notificationGroupExpandBounds) {
    tap(centerOf(notificationGroupExpandBounds));
    await delay(600);
    notificationShadeXml = await waitForNotificationShadeMessage(notificationClickMessage, 10000);
    writeFileSync(join(artifactDir, "notification-shade-expanded.xml"), notificationShadeXml);
  }
  await tapNotificationAndWaitForCustomerRequests(
    notificationShadeXml,
    notificationClickMessage,
    notificationClickCustomer
  );

  await publishDeviceRole(baseUrl, deviceId, "staff", {
    permissions: [...new Set([...serviceOrderPermissions, ...cashierPermissions])]
  });
  relaunchApp();
  await waitForUiCondition(
    (xml) => xml.includes("Personel") && xml.includes('text="Restoran"'),
    12000,
    "Kasa / Hesap profili Android arayüzüne uygulanmadı."
  );
  scrollToTop();
  const cashierTopXml = dumpUi("cashier-top.xml");
  tap(centerOf(findClickableBoundsByText(cashierTopXml, "Restoran")));
  await delay(500);
  const cashierRestaurantXml = dumpUi("cashier-restaurant.xml");
  assertContains(cashierRestaurantXml, ["Masalar", "Salon Masası 1", "Siparişi Aç"]);
  tap(centerOf(findBoundsByText(cashierRestaurantXml, "Siparişi Aç")));
  await delay(500);
  const cashierOrderXml = dumpUi("cashier-table-order.xml");
  assertContains(cashierOrderXml, ["Açık · 2 ürün · ₺900,00", "Hazırlanıyor", "Servis Edildi", "Hesap Bekliyor", "Ödendi / Kapat"]);
  assertOrderActionGrid(cashierOrderXml, true);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);

  await publishDeviceRole(baseUrl, deviceId, "staff", { permissions: customerReservationPermissions });
  relaunchApp();
  const customerPackageTopXml = await waitForUiCondition(
    (xml) => xml.includes("Personel")
      && xml.includes('text="Müşteri"')
      && xml.includes('text="Pansiyon"')
      && xml.includes('text="Mesajlar"')
      && !xml.includes('text="Restoran"'),
    12000,
    "Müşteri / Rezervasyon profili Android arayüzüne uygulanmadı."
  );
  assertNotContains(customerPackageTopXml, ['text="Restoran"', "Boş oda", "Boş masa"]);
  tap(centerOf(findClickableBoundsByText(customerPackageTopXml, "Müşteri")));
  await delay(500);
  const customerPackageListXml = dumpUi("customer-package-list.xml");
  assertContains(customerPackageListXml, ["Müşteri", "Yeni Talepler", "Cevap Bekleyenler", "Demo Aile"]);
  assertNotContains(customerPackageListXml, ["MÜŞTERİ İŞLERİ"]);
  tap(centerOf(findBoundsByText(customerPackageListXml, "Demo Aile")));
  await delay(500);
  let customerPackageDetailXml = dumpUi("customer-package-detail.xml");
  for (let index = 0; index < 4 && !customerPackageDetailXml.includes("Cevaplandı"); index += 1) {
    swipe(360, 1080, 360, 330, 420);
    await delay(350);
    customerPackageDetailXml = dumpUi("customer-package-detail-scrolled.xml");
  }
  assertContains(customerPackageDetailXml, ["Ara", "WhatsApp", "Onayla", "Cevaplandı"]);
  assertNotContains(customerPackageDetailXml, ["Reddet", "Rezervasyona Çevir"]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await delay(300);
  const customerPackageAfterDetailXml = dumpUi("customer-package-after-detail.xml");
  tap(centerOf(findClickableBoundsByText(customerPackageAfterDetailXml, "Pansiyon")));
  await delay(500);
  const customerPackagePensionXml = dumpUi("customer-package-pension.xml");
  assertContains(customerPackagePensionXml, ["Rezervasyonlar", "Demo Aile", "Aç"]);
  assertNotContains(customerPackagePensionXml, ["Onayla", "Reddet", "Rezervasyonu İptal Et", "Odalar", 'text="İşler"']);
  tap(centerOf(findBoundsByText(customerPackagePensionXml, "Demo Aile")));
  await delay(400);
  const customerReservationDetailXml = dumpUi("customer-package-reservation-detail.xml");
  assertContains(customerReservationDetailXml, ["REZERVASYON DETAYI", "Onayla", "WhatsApp"]);
  assertNotContains(customerReservationDetailXml, ["Reddet", "Rezervasyonu İptal Et"]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);

  await publishDeviceRole(baseUrl, deviceId, "staff", { isActive: false });
  relaunchApp();
  await waitForUiText("Cihaz Pasif", 12000);
  await publishMissingDeviceProfile(baseUrl);
  relaunchApp();
  await waitForUiCondition(
    (xml) => xml.includes("Cihaz Pasif") && xml.includes("Bu cihaz pasifleştirildi"),
    12000,
    "Pasif cihaz profili eksik snapshot sonrasında fail-closed kalmadı."
  );

  await publishDeviceRole(baseUrl, deviceId, "staff", { permissions: ["settings.view"] });
  relaunchApp();
  await waitForUiCondition(
    (xml) => xml.includes("Personel") && xml.includes('content-desc="Ayarlar"') && xml.includes('content-desc="Yenile"'),
    12000,
    "Salt-okunur ayar profili Android arayüzüne uygulanmadı."
  );
  scrollToTop();
  await delay(300);
  const settingsViewerTopXml = dumpUi("settings-viewer-top.xml");
  assertContains(settingsViewerTopXml, ['content-desc="Ayarlar"', 'content-desc="Yenile"']);
  assertNotContains(settingsViewerTopXml, ["Yeni talepler", "Boş odalar", "Müşteri", "Pansiyon", "Restoran", "Mesajlar", "Demo Aile"]);
  tap(centerOf(findClickableBoundsByDescription(settingsViewerTopXml, "Ayarlar")));
  await delay(400);
  const settingsViewerXml = dumpUi("settings-viewer.xml");
  assertContains(settingsViewerXml, [
    embeddedConnectionIsLocked() ? "Bağlantı bilgileri APK içinde hazır" : "Bağlantı ayarları salt okunur",
    "Bağlantı özeti"
  ]);
  assertNotContains(settingsViewerXml, [syncSecret, baseUrl, "Canlı Veriyi Çek"]);

  await publishDeviceRole(baseUrl, deviceId, "admin");
  relaunchApp();
  await waitForUiCondition(
    (xml) => xml.includes("Yönetici") && xml.includes('content-desc="Ayarlar"') && xml.includes('content-desc="Yenile"'),
    12000,
    "Yönetici yetki profili yeniden kurulum olmadan Android arayüzüne uygulanmadı."
  );
  scrollToTop();
  await delay(300);
  topXml = dumpUi("admin-top.xml");
  captureScreenshot("admin-top.png");
  assertContains(topXml, ["Yönetici", 'content-desc="Ayarlar"', 'content-desc="Yenile"', "Müşteri", "Restoran"]);
  assert.equal(readPreferenceValue("device_id"), deviceId);

  tap(centerOf(findClickableBoundsByDescription(topXml, "Ayarlar")));
  const adminSettingsXml = await waitForUiCondition(
    (xml) => xml.includes("İşletme raporları") && xml.includes("Raporları Aç"),
    5000,
    "Yönetici Ayarlar ekranında Raporlar aksiyonu görünmedi."
  );
  assertContains(adminSettingsXml, ["Yönetici", "İşletme raporları", "Raporları Aç"]);
  tap(centerOf(findClickableBoundsByText(adminSettingsXml, "Raporları Aç")));
  let reportsXml = await waitForUiCondition(
    (xml) => xml.includes('text="Raporlar"')
      && xml.includes("YÖNETİCİ RAPORU")
      && xml.includes("Genel özet")
      && xml.includes("₺6.400,00"),
    8000,
    "Yönetici Raporlar ekranı Son 7 Gün özetiyle açılmadı."
  );
  assertContains(reportsXml, [
    "Bugün", "Dün", "Son 7 Gün", "Son 30 Gün",
    "Restoran cirosu", "Kapanan hesap", "Ortalama hesap",
    "Onaylanan rezervasyon", "Yeni talep", "Dikkat gerektiren"
  ]);
  assertNotContains(reportsXml, ['text="Müşteri"', 'text="Pansiyon"', 'text="Mesajlar"']);
  captureScreenshot("admin-reports-night.png");

  tap(centerOf(findClickableBoundsByText(reportsXml, "Dün")));
  reportsXml = await waitForUiCondition(
    (xml) => xml.includes("₺900,00") && xml.includes('text="Dönem"'),
    5000,
    "Dün rapor filtresi veriyi güncellemedi."
  );
  tap(centerOf(findClickableBoundsByText(reportsXml, "Bugün")));
  reportsXml = await waitForUiCondition(
    (xml) => xml.includes("₺1.600,00"),
    5000,
    "Bugün rapor filtresi veriyi güncellemedi."
  );
  tap(centerOf(findClickableBoundsByText(reportsXml, "Son 30 Gün")));
  reportsXml = await waitForUiCondition(
    (xml) => xml.includes("₺18.200,00"),
    5000,
    "Son 30 Gün rapor filtresi veriyi güncellemedi."
  );
  tap(centerOf(findClickableBoundsByText(reportsXml, "Son 7 Gün")));
  reportsXml = await waitForUiCondition(
    (xml) => xml.includes("₺6.400,00"),
    5000,
    "Son 7 Gün rapor filtresi veriyi güncellemedi."
  );

  tap(centerOf(findClickableBoundsByDescription(reportsXml, "Gündüz moduna geç")));
  reportsXml = await waitForUiCondition(
    (xml) => xml.includes('content-desc="Gece moduna geç"') && xml.includes('text="Raporlar"'),
    5000,
    "Rapor ekranı gündüz temasına geçmedi."
  );
  captureScreenshot("admin-reports-day.png");
  tap(centerOf(findClickableBoundsByDescription(reportsXml, "Gece moduna geç")));
  await waitForUiCondition(
    (xml) => xml.includes('content-desc="Gündüz moduna geç"') && xml.includes('text="Raporlar"'),
    5000,
    "Rapor ekranı gece temasına dönemedi."
  );

  let reportBottomXml = "";
  for (let index = 0; index < 14; index += 1) {
    reportBottomXml = dumpUi(`admin-reports-bottom-${index}.xml`);
    if (reportBottomXml.includes("Bu dönemi özetle")
        && reportBottomXml.includes("Dikkat edilmesi gerekenler")
        && reportBottomXml.includes("Satışları yorumla")
        && reportBottomXml.includes("3 kısa öneri ver")) {
      break;
    }
    swipe(360, 1080, 360, 300, 420);
    await delay(300);
  }
  assertContains(reportBottomXml, [
    "AI yorumu (isteğe bağlı)",
    "Bu dönemi özetle",
    "Dikkat edilmesi gerekenler",
    "Satışları yorumla",
    "3 kısa öneri ver"
  ]);
  tap(centerOf(findClickableBoundsByText(reportBottomXml, "Bu dönemi özetle")));
  const reportAiUnavailableXml = await waitForUiCondition(
    (xml) => xml.includes("Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı."),
    15000,
    "AI kapalıyken rapor ekranı beklenen kullanıcı mesajını göstermedi."
  );
  captureScreenshot("admin-reports-ai-unavailable.png");
  assertContains(reportAiUnavailableXml, ["Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı."]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await waitForUiText("İşletme raporları", 5000);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  topXml = await waitForUiCondition(
    (xml) => xml.includes('text="Bugün"') && xml.includes('text="Müşteri"') && xml.includes("Yönetici"),
    5000,
    "Rapor ekranından operasyon ekranına dönülemedi."
  );

  tap(centerOf(findClickableBoundsByText(topXml, "Müşteri")));
  await delay(500);
  let requestsXml = dumpUi("requests.xml");
  captureScreenshot("requests.png");
  assertContains(requestsXml, ["Müşteri", "Yeni Talepler", "Cevap Bekleyenler", "Demo Aile"]);
  assertNotContains(requestsXml, ["MÜŞTERİ İŞLERİ"]);

  tap(centerOf(findClickableBoundsByText(requestsXml, "Müşteriler")));
  await delay(400);
  const customersXml = dumpUi("customers.xml");
  assertContains(customersXml, ["Demo Aile", "Balkonlu oda tercih ediyor.", "Aç"]);
  assertNodeHeightAtMost(customersXml, "Balkonlu oda tercih ediyor.", 110);
  tap(centerOf(findBoundsByText(customersXml, "Aç")));
  await delay(300);
  const customerDetailXml = dumpUi("customer-detail.xml");
  assertContains(customerDetailXml, ["MÜŞTERİ DETAYI", "Demo Aile", "Balkonlu oda tercih ediyor."]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await delay(300);
  const customersAfterDetailXml = dumpUi("customers-after-detail.xml");
  tap(centerOf(findClickableBoundsByText(customersAfterDetailXml, "Yeni Talepler")));
  await delay(400);
  requestsXml = dumpUi("requests-after-customers.xml");

  tap(centerOf(findBoundsByText(requestsXml, "Demo Aile")));
  await delay(500);
  let detailXml = dumpUi("request-detail.xml");
  captureScreenshot("request-detail.png");
  assertContains(detailXml, ["TALEP DETAYI", "Demo Aile", "Rezervasyona Çevir"]);
  for (let index = 0; index < 3 && !detailXml.includes("Cevaplandı"); index += 1) {
    swipe(360, 1080, 360, 350, 400);
    await delay(400);
    detailXml = dumpUi("request-detail-scrolled.xml");
  }
  assertContains(detailXml, ["Cevaplandı"]);

  tap(centerOf(findBoundsByText(detailXml, "Cevaplandı")));
  await waitForAction(baseUrl, "customer_request_mark_answered", { request_id: "request_demo_web_001" }, 12000);
  await delay(600);
  const queuedXml = dumpUi("queued.xml");
  captureScreenshot("queued.png");
  assertContains(queuedXml, ["Müşteri", "Yeni Talepler"]);
  assertNotContains(queuedXml, ["Canlı veri çekiliyor", "Canlı veri alındı", "Veriler zaten güncel", "Son yayın:"]);

  tap(centerOf(findClickableBoundsByText(queuedXml, "Pansiyon")));
  await delay(500);
  const pensionXml = dumpUi("pension.xml");
  captureScreenshot("pension.png");
  assertContains(pensionXml, ["Pansiyon", "Rezervasyonlar", "Odalar", "Konaklamalar", "Demo Aile", 'text="Bekleyen 1"', 'text="Giriş 0"', 'text="Çıkış 0"']);
  assertNotContains(pensionXml, ["Durumu Değiştir", "Oda 101 giriş hazırlığı", "Konaklama operasyonu"]);
  assertCounterStripFits(pensionXml, ["Bekleyen 1", "Giriş 0", "Çıkış 0"]);
  tap(centerOf(findClickableBoundsByText(pensionXml, "Odalar")));
  const pensionRoomsXml = await waitForUiCondition(
    (xml) => xml.includes("Balkonlu Oda") && xml.includes("Temizlik"),
    5000,
    "Pansiyon oda kartları çizilmedi."
  );
  assertContains(pensionRoomsXml, ["Odalar", "Balkonlu Oda", "Temizlik"]);
  assertNotContains(pensionRoomsXml, ["Demo Aile", "Oda 101 giriş hazırlığı"]);
  let pensionRoomModesXml = pensionRoomsXml;
  for (let index = 0; index < 3 && !pensionRoomModesXml.includes('text="İşler"'); index += 1) {
    swipe(650, 245, 180, 245, 320);
    await delay(300);
    pensionRoomModesXml = dumpUi(`pension-room-modes-${index}.xml`);
  }
  assertContains(pensionRoomModesXml, ['text="İşler"']);
  tap(centerOf(findClickableBoundsByText(pensionRoomModesXml, "İşler")));
  const pensionTasksXml = await waitForUiCondition(
    (xml) => xml.includes("Oda 101 giriş hazırlığı") && !xml.includes("Bahçe servis kontrolü"),
    5000,
    "Yönetici günlük iş modu açılmadı."
  );
  writeFileSync(join(artifactDir, "pension-tasks.xml"), pensionTasksXml);
  assertContains(pensionTasksXml, ["Oda 101 giriş hazırlığı"]);
  assertNotContains(pensionTasksXml, ["Bahçe servis kontrolü", "Balkonlu Oda", "Demo Aile"]);

  tap(centerOf(findClickableBoundsByText(pensionTasksXml, "Restoran")));
  await delay(500);
  const restaurantXml = dumpUi("restaurant.xml");
  assertContains(restaurantXml, ["Restoran", "Masalar", "Rezervasyonlar", "Açık Adisyon", "İşler", "Salon Masası 1", "Siparişi Aç", 'text="Boş 1"', 'text="Dolu 1"', 'text="Hesap 0"', 'text="Açık 1"']);
  assertNotContains(restaurantXml, ["Servis ve masa yönetimi", "Ev Limonatası"]);
  assertCounterStripFits(restaurantXml, ["Boş 1", "Dolu 1", "Hesap 0", "Açık 1"]);
  captureScreenshot("restaurant.png");
  tap(centerOf(findBoundsByText(restaurantXml, "Siparişi Aç")));
  await delay(500);
  let orderXml = dumpUi("table-order.xml");
  captureScreenshot("table-order.png");
  assertContains(orderXml, ["MASA SİPARİŞİ", "Salon Masası 1", "Açık · 2 ürün · ₺900,00", "Ürün ara", "Serpme Kahvaltı", "Hazırlanıyor", "Servis Edildi", "Hesap Bekliyor", "Ödendi / Kapat"]);
  assertOrderActionGrid(orderXml, true);
  for (let index = 0; index < 6 && !orderXml.includes("Aktif adisyon satırları"); index += 1) {
    swipe(360, 1080, 360, 300, 420);
    await delay(350);
    orderXml = dumpUi("admin-table-order-scrolled.xml");
  }
  assertContains(orderXml, ["Aktif adisyon satırları", "Ödendi / Kapat"]);

  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await delay(300);
  let restaurantAfterDialog = dumpUi("restaurant-after-dialog.xml");
  for (let index = 0; index < 3 && !restaurantAfterDialog.includes('text="Stok"'); index += 1) {
    swipe(650, 245, 180, 245, 320);
    await delay(300);
    restaurantAfterDialog = dumpUi(`restaurant-modes-${index}.xml`);
  }
  assertContains(restaurantAfterDialog, ['text="Stok"']);
  tap(centerOf(findClickableBoundsByText(restaurantAfterDialog, "Stok")));
  await delay(400);
  let adminStockXml = "";
  let stockUpdateXml = "";
  for (let index = 0; index < 8; index += 1) {
    const currentXml = dumpUi(`admin-stock-${index}.xml`);
    adminStockXml += currentXml;
    if (!stockUpdateXml && currentXml.includes("Stok Güncelle")) {
      stockUpdateXml = currentXml;
    }
    if (adminStockXml.includes("Stokta yok")
        && adminStockXml.includes("Az stok")
        && adminStockXml.includes("Tüm takip edilen ürünler")
        && adminStockXml.includes("Serpme Kahvaltı")
        && adminStockXml.includes("AI DESTEKLİ STOK GİRİŞİ")
        && stockUpdateXml) {
      break;
    }
    swipe(360, 1080, 360, 760, 360);
    await delay(300);
  }
  assertContains(adminStockXml, ["AI DESTEKLİ STOK GİRİŞİ", "Kamera ile çek", "Galeriden seç", "Stokta yok", "Az stok", "Tüm takip edilen ürünler", "Ev Limonatası", "Serpme Kahvaltı", "Stok Güncelle"]);
  scrollToTop();
  await delay(300);
  const adminStockTopXml = dumpUi("admin-stock-top.xml");
  assertContains(adminStockTopXml, ["AI DESTEKLİ STOK GİRİŞİ", "Kamera ile çek", "Galeriden seç", "Stoklar siz onaylamadan değişmez"]);
  captureScreenshot("admin-stock-image-import.png");
  await exerciseStockImageSources(adminStockTopXml);
  lockDevicePortrait();
  await delay(800);
  let stockUpdateAfterSourcesXml = "";
  for (let index = 0; index < 8; index += 1) {
    const currentXml = dumpUi(`admin-stock-update-after-sources-${index}.xml`);
    if (currentXml.includes("Stok Güncelle")) {
      stockUpdateAfterSourcesXml = currentXml;
      break;
    }
    swipe(360, 900, 360, 300, 420);
    await delay(300);
  }
  assertContains(stockUpdateAfterSourcesXml, ["Stok Güncelle"]);
  tap(centerOf(findBoundsByText(stockUpdateAfterSourcesXml, "Stok Güncelle")));
  await delay(300);
  const stockActionsXml = dumpUi("admin-stock-actions.xml");
  assertContains(stockActionsXml, ["STOK GÜNCELLE", "+1 adet Ekle", "Miktarı Ayarla", "Fark Gir"]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await delay(300);
  const restaurantAfterStockXml = dumpUi("restaurant-after-stock.xml");
  tap(centerOf(findClickableBoundsByText(restaurantAfterStockXml, "Mesajlar")));
  await delay(500);
  const messagesXml = dumpUi("messages.xml");
  captureScreenshot("messages.png");
  assertContains(messagesXml, ["Mesajlar", "Hazır Mesajlar", "Cevap Bekleyenler", "Demo Aile", "Aç"]);
  assertNotContains(messagesXml, ["MESAJLAR", "Hazır cevaplar", "Hazır mesaj"]);
  assertNodeHeightAtMost(
    messagesXml,
    "Merhaba, talebinizi aldık. Oda uygunluğunu kontrol edip kısa süre içinde size dönüş yapacağız.",
    110
  );
  tap(centerOf(findBoundsByText(messagesXml, "Aç")));
  await delay(300);
  const messageDetailXml = dumpUi("message-detail.xml");
  assertContains(messageDetailXml, ["MESAJ DETAYI", "Demo Aile", "WhatsApp'ta Aç"]);

  await restoreEmbeddedConnectionAfterTest();
  console.log("android-device-ui-smoke-ok");
  cleanup();
  await waitForPhoneTestExit();
}

function parseArgs(args) {
  const parsed = {
    holdMs: 600000,
    readyTimeoutMs: 45000,
    settleMs: 1800,
    noBuild: false,
    stockImageOnly: false,
    reportsOnly: false,
    companionOnly: false,
    marketOnly: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-build") {
      parsed.noBuild = true;
    } else if (arg === "--stock-image-only") {
      parsed.stockImageOnly = true;
    } else if (arg === "--reports-only") {
      parsed.reportsOnly = true;
    } else if (arg === "--market-only") {
      parsed.marketOnly = true;
    } else if (arg === "--companion-only") {
      parsed.companionOnly = true;
    } else if (arg.startsWith("--hold-ms=")) {
      parsed.holdMs = Number(arg.slice("--hold-ms=".length));
    } else if (arg === "--hold-ms") {
      parsed.holdMs = Number(args[index + 1]);
      index += 1;
    } else if (arg.startsWith("--settle-ms=")) {
      parsed.settleMs = Number(arg.slice("--settle-ms=".length));
    } else if (arg === "--settle-ms") {
      parsed.settleMs = Number(args[index + 1]);
      index += 1;
    } else {
      throw new Error(`Bilinmeyen seçenek: ${arg}`);
    }
  }

  for (const [name, value] of Object.entries({
    holdMs: parsed.holdMs,
    readyTimeoutMs: parsed.readyTimeoutMs,
    settleMs: parsed.settleMs
  })) {
    if (!Number.isInteger(value) || value < 0 || value > 900000) {
      throw new Error(`${name} 0-900000 ms arasında sayısal olmalı.`);
    }
  }

  if (parsed.holdMs < 8000) {
    throw new Error("--hold-ms Android UI smoke için en az 8000 olmalı.");
  }
  if ([parsed.stockImageOnly, parsed.reportsOnly, parsed.marketOnly, parsed.companionOnly].filter(Boolean).length > 1) {
    throw new Error("Tek bir --*-only Android UI smoke seçeneği kullanılmalı.");
  }

  return parsed;
}

function backupCompanionPreferences() {
  // Keep the original directory untouched inside the app sandbox, also on interruption.
  // Never write credentials/cache/outbox into host artifacts.
  adb(["shell", "am", "force-stop", packageName]);
  const backupPath = "files/companion-ui-original-preferences";
  const priorBackup = adb(["shell", "run-as", packageName, "test", "-d", backupPath], { allowFailure: true });
  assert.notEqual(priorBackup.status, 0, "Önceki cihaz testi yedeği mevcut; test başlatılmadı. Bu klasörü shared_prefs olarak geri yükleyin.");
  const existing = adb(["shell", "run-as", packageName, "test", "-d", "shared_prefs"], { allowFailure: true });
  assert.equal(existing.status, 0, "Önce kurulu debug uygulamasını bir kez başlatın; mevcut tercihleri olmayan cihazda test başlatılmadı.");
  const paths = adb(["shell", "run-as", packageName, "find", "shared_prefs", "-type", "f"]).stdout.trim().split(/\r?\n/);
  const files = new Map();
  for (const path of paths) {
    assert.match(path, /^shared_prefs\/[A-Za-z0-9_.-]+$/);
    files.set(path, adb(["exec-out", "run-as", packageName, "cat", path], { binary: true }).stdout);
  }
  // Keep only the existing device identity in the working test directory so the
  // phone fixture can approve it before launch. Original credentials/outbox stay protected.
  const original = files.get("shared_prefs/yardimci_asistan_android.xml")?.toString("utf8") ?? "";
  const identity = original.match(/<string name="device_id">([^<]+)<\/string>/)?.[1] ?? "";
  assert.match(identity, /^[A-Za-z0-9._:-]+$/);
  adb(["shell", "run-as", packageName, "mv", "shared_prefs", backupPath]);
  companionPreferencesBackup = { backupPath, files };
  adb(["shell", "run-as", packageName, "mkdir", "shared_prefs"]);
  adb(["shell", "-T", "run-as", packageName, "tee", "shared_prefs/yardimci_asistan_android.xml"], {
    input: '<?xml version="1.0" encoding="utf-8" standalone="yes" ?><map><string name="device_id">' + identity + '</string></map>'
  });
  assert.equal(readDeviceId(), identity);
}

function restoreCompanionPreferences() {
  if (!companionPreferencesBackup) return;
  assert.ok(!phoneTest || phoneTest.exitCode !== null, "Telefon test süreci kapanmadan cihaz ayarları geri yüklenemez.");
  adb(["shell", "am", "force-stop", packageName]);
  const testPath = "files/companion-ui-test-preferences";
  const working = adb(["shell", "run-as", packageName, "test", "-d", "shared_prefs"], { allowFailure: true });
  if (working.status === 0) adb(["shell", "run-as", packageName, "mv", "shared_prefs", testPath]);
  adb(["shell", "run-as", packageName, "mv", companionPreferencesBackup.backupPath, "shared_prefs"]);
  for (const [path, content] of companionPreferencesBackup.files) {
    const restored = adb(["exec-out", "run-as", packageName, "cat", path], { binary: true });
    assert.ok(restored.stdout.equals(content), "Test sonrasında cihaz ayar dosyası birebir geri yüklenemedi.");
  }
  companionPreferencesBackup = null;
  adb(["shell", "run-as", packageName, "rm", "-rf", testPath]);
  console.log("Companion cihaz ayarları, kimlik ve mevcut kuyruk geri yüklendi.");
}

async function runCompanionOnly(baseUrl) {
  const deviceId = readDeviceId();
  const time = "2026-10-13T10:00:00.000Z";
  const rights = ["commerce_order.view", "commerce_order.confirm", "commerce_order.cancel",
    "shipment.view", "online_sales.view", "marketing.status.view"];
  function snapshot({ role = "staff", permissions = rights, capabilities, legacy = false, empty = false, active = true } = {}) {
    const value = JSON.parse(readFileSync(androidSnapshotFixtureFile, "utf8"));
    value.business_capabilities = capabilities ?? ["service.android", "commerce.orders", "commerce.wholesale",
      "channel.online_sales", "marketing.studio", "messaging.campaigns", "core.customers"];
    value.androidPermissions = { [deviceId]: { role, permissions, is_active: active } };
    if (legacy) return value;
    value.commerce = {
      orders: empty ? [] : ["desktop", "web-online-sales", "web-dealer"].map((source, index) => ({
        id: ["desktop-order", "online-order", "dealer-order"][index], source, status: "placed",
        total: 123.45, currency: "EUR", delivery_method: "shipping", placed_at: time, updated_at: time,
        address: "PRIVATE_ADDRESS", phone: "PRIVATE_PHONE", items: ["PRIVATE_ITEM"]
      })),
      shipments: empty ? [] : [{ id: "shipment-1", order_id: "dealer-order", status: "dispatched",
        tracking_available: true, updated_at: time, tracking_number: "PRIVATE_NUMBER", tracking_url: "https://private.invalid/" }],
      order_counts: empty ? [] : [{ source: "desktop", status: "placed", count: 123 }],
      shipment_counts: empty ? [] : [{ source: "web-dealer", pending: 12 }],
      online_catalog: { desired_product_count: 4, pending: true, updated_at: time }
    };
    value.marketing = {
      publications: empty ? [] : [{ id: "publication-1", channel: "website", status: "failed",
        revision: 2, published_revision: 1, desired_published: true, updated_at: time }],
      schedules: empty ? [] : [{ id: "schedule-1", channel: "sms", target_type: "audience_campaign",
        status: "active", last_execution_status: "failed", next_run_at: time, updated_at: time }],
      campaigns: empty ? [] : [{ id: "campaign-1", channel: "sms", status: "completed",
        pending_count: 0, failed_count: 2, updated_at: time }]
    };
    return value;
  }
  async function publish(value, label) {
    const at = await publishSnapshot(baseUrl, value, label);
    const xml = dumpUi("companion-before-refresh.xml");
    tap(centerOf(findClickableBoundsByDescription(xml, "Yenile")));
    await waitForCachedSnapshotText(at, 20000);
    await delay(400);
    scrollToTop();
    return dumpUi("companion-" + label + ".xml");
  }
  async function clickText(text) {
    const xml = dumpUi("companion-before-click.xml");
    tap(centerOf(findClickableBoundsByText(xml, text)));
    await delay(400);
  }
  async function readPage(label) {
    let xml = "";
    for (let index = 0; index < 5; index += 1) {
      xml += dumpUi("companion-" + label + "-" + index + ".xml");
      swipe(360, 1020, 360, 400, 300);
      await delay(200);
    }
    assertNotContains(xml, ["PRIVATE_", "https://private.invalid/", 'text="Onayla"', 'text="İptal Et"',
      'text="İptal"', 'text="Tahsilat"', 'text="Satışa Dönüştür"']);
    scrollToTop();
    return xml;
  }
  let top = await publish(snapshot(), "staff");
  assertContains(top, ["Ticari sipariş 123", "Gönderi 12", "Pazarlama hatası 3",
    "Ticari siparişler", "Gönderiler", "Pazarlama durumu"]);
  assertNotContains(top, ['text="Market"', 'text="Restoran"', 'text="Pansiyon"']);
  await clickText("Ticari siparişler");
  await waitForUiText("Tümü", 8000);
  await clickText("Bayi siparişleri");
  const dealer = await readPage("dealer");
  assertContains(dealer, ["Sipariş dealer-order", "Onay bekliyor", "Kaynak: Bayi siparişi", "EUR", "Teslimat: Kargo",
    "Gönderildi", "Takip kaydı: Var"]);
  assertNotContains(dealer, ["Sipariş online-order", "Sipariş desktop-order"]);
  await clickText("Online satış");
  const online = await readPage("online");
  assertContains(online, ["Sipariş online-order", "Kaynak: Online satış", "Online katalog", "Yayın güncellemesi bekliyor"]);
  assertNotContains(online, ["Sipariş dealer-order"]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await waitForUiText("Öncelikli işler", 8000);
  await clickText("Gönderiler");
  assertContains(await readPage("shipments"), ["Sipariş dealer-order", "Takip kaydı: Var"]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await clickText("Pazarlama durumu");
  assertContains(await readPage("marketing"), ["Yayın publication-1", "Başarısız", "Plan schedule-1",
    "Son çalıştırma: Başarısız", "Kampanya campaign-1", "Bekleyen: 0 · Başarısız: 2"]);
  captureScreenshot("companion-marketing.png");

  top = await publish(snapshot({ permissions: [] }), "revoked");
  assertContains(top, ["Görünüm kapatıldı", "izni kaldırıldı"]);
  assertNotContains(top, ['text="Ticari siparişler"', 'text="Pazarlama durumu"', "publication-1", "dealer-order"]);
  top = await publish(snapshot({ role: "admin" }), "admin");
  assertContains(top, ["Yönetici", "Ticari siparişler"]);
  await clickText("Ticari siparişler");
  await readPage("admin-read-only"); // Decision permissions still produce no buttons.
  await publish(snapshot({ capabilities: ["service.android"] }), "capability-off");
  assertNotContains(await readPage("capability-off"), ['text="Ticari siparişler"', "Sipariş online-order"]);

  await publish(snapshot({ legacy: true }), "legacy");
  await clickText("Ticari siparişler");
  assertContains(await readPage("legacy-orders"), ["Bu özette sipariş yok"]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await clickText("Pazarlama durumu");
  assertContains(await readPage("legacy-marketing"), ["Bu özette yayın yok", "Bu özette plan yok"]);
  await publish(snapshot({ empty: true }), "empty");
  assertContains(await readPage("empty-marketing"), ["Bu özette yayın yok", "Bu özette plan yok", "Bu özette kampanya yok"]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await clickText("Ticari siparişler");
  assertContains(await readPage("empty-orders"), ["Bu özette sipariş yok"]);

  await publish(snapshot({ permissions: ["commerce_order.view"], capabilities: ["service.android", "commerce.orders"] }), "source-rights");
  const restricted = await readPage("source-rights");
  assertContains(restricted, ["Sipariş desktop-order"]);
  assertNotContains(restricted, ['text="Online satış"', 'text="Bayi siparişleri"', "Sipariş online-order", "Sipariş dealer-order"]);
  // Remove only the test's reverse tunnel: cached safe summaries remain usable.
  const port = new URL(baseUrl).port;
  adb(["reverse", "--remove", "tcp:" + port]);
  const beforeOffline = dumpUi("companion-before-offline.xml");
  tap(centerOf(findClickableBoundsByDescription(beforeOffline, "Yenile")));
  await waitForUiText("Bağlantı kurulamadı; son alınan özet", 35000);
  assertContains(await readPage("offline"), ["Sipariş desktop-order", "Son senkron:"]);
  adb(["reverse", "tcp:" + port, "tcp:" + port]);
  const queuedResponse = await fetch(baseUrl + "/api/sync.php", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": syncSecret },
    body: JSON.stringify({ action: "pull_android_actions", limit: 100 })
  });
  assert.equal(queuedResponse.ok, true);
  const queued = await queuedResponse.json();
  assert.equal(queued.ok, true);
  assert.equal((queued.actions ?? []).some((action) => action.action_type.startsWith("commerce_order_")), false,
    "Salt-okunur ekranlar ticari sipariş işlemi üretmemeli.");
  await publish(snapshot({ active: false }), "inactive");
  assertContains(dumpUi("companion-inactive.xml"), ["Cihaz Pasif"]);
}

async function runMarketOnly(baseUrl) {
  const deviceId = readDeviceId();
  const snapshot = JSON.parse(readFileSync(androidSnapshotFixtureFile, "utf8"));
  snapshot.business_capabilities = [
    "service.android",
    "commerce.catalog",
    "commerce.inventory",
    "commerce.sales",
    "retail.barcode",
    "retail.purchasing",
    "retail.suppliers"
  ];
  snapshot.androidPermissions = {
    [deviceId]: {
      role: "staff",
      is_active: true,
      permissions: marketPermissions
    }
  };
  snapshot.market = {
    summary: {
      today_sale_count: 3,
      today_sales_total: 105,
      currency: "TRY",
      critical_stock_count: 1,
      recent_stock_adjustments: [
        {
          id: "market-adjustment-device-1",
          product_id: "market-product-cola",
          product_name: "Test Kola 330 ml",
          type: "count",
          quantity_delta: -1,
          quantity_after: 7,
          note: "Sabah raf sayımı",
          created_at: new Date().toISOString()
        }
      ],
      recent_receiving_count: 1
    },
    products: [
      {
        id: "market-product-cola",
        name: "Test Kola 330 ml",
        sku: "KOLA-330",
        barcode: "8690000000001",
        unit: "piece",
        sale_price: 35,
        currency: "TRY",
        is_active: true,
        track_inventory: true,
        current_quantity: 7,
        minimum_quantity: 8,
        inventory_updated_at: new Date().toISOString()
      },
      {
        id: "market-product-water",
        name: "Test Su 500 ml",
        sku: "SU-500",
        barcode: "8690000000002",
        unit: "piece",
        sale_price: 10,
        currency: "TRY",
        is_active: true,
        track_inventory: true,
        current_quantity: 24,
        minimum_quantity: 5,
        inventory_updated_at: new Date().toISOString()
      }
    ],
    suppliers: [
      { id: "market-supplier-device-1", name: "Test Tedarikçi", is_active: true }
    ],
    recent_purchases: [
      {
        id: "market-purchase-device-1",
        supplier_id: "market-supplier-device-1",
        supplier_name: "Test Tedarikçi",
        status: "received",
        received_at: new Date().toISOString(),
        total: 120,
        currency: "TRY",
        line_count: 2
      }
    ],
    product_drafts: [],
    cart_drafts: []
  };
  await publishSnapshot(baseUrl, snapshot, "Market cihaz testi");
  relaunchApp();

  let xml = await waitForUiCondition(
    (candidate) => candidate.includes('text="Market"')
      && !candidate.includes('text="Pansiyon"')
      && !candidate.includes('text="Restoran"'),
    12000,
    "Saf Market profili Android navigation'a uygulanmadı."
  );
  assertNotContains(xml, ['text="Pansiyon"', 'text="Restoran"', 'text="Müşteri"']);
  tap(centerOf(findClickableBoundsByText(xml, "Market")));
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Saha işlemleri")
      && candidate.includes("Kasa Barkod Modu")
      && candidate.includes("Barkod Tara")
      && candidate.includes("Stok Say")
      && candidate.includes("Mal Kabul")
      && candidate.includes("Yeni Ürün"),
    8000,
    "Market ana ekranı açılamadı."
  );
  assertContains(xml, [
    "MARKET", "Saha işlemleri", "Kasa Barkod Modu", "Barkod Tara", "Stok Say", "Mal Kabul", "Sepet", "Yeni Ürün"
  ]);
  assertNotContains(xml, ["Bekleyen sipariş", "Satışı Tamamla"]);
  captureScreenshot("market-home.png");

  // Özet metrik kartı ilk viewport'a sığmayabilir (dump yalnızca görünür
  // alanı içerir); metrikleri kaydırarak birikimli dökümde doğrula.
  let marketSummaryXml = xml;
  for (let index = 0; index < 8 && !(marketSummaryXml.includes("Kritik stok") && marketSummaryXml.includes("Mal kabul")); index += 1) {
    swipe(360, 900, 360, 300, 420);
    await delay(300);
    marketSummaryXml += dumpUi(`market-home-summary-metrics-${index}.xml`);
  }
  assertContains(marketSummaryXml, ["Bugün", "Satış", "3 · ₺105,00", "Kritik stok", "Mal kabul"]);
  captureScreenshot("market-home-summary-metrics.png");
  scrollToTop();
  await delay(300);
  xml = dumpUi("market-home-top-after-summary.xml");

  tap(centerOf(findClickableBoundsByText(xml, "▣  Kasa Barkod Modu")));
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Kasa Barkod Okuyucu")
      && candidate.includes("Kamerayı ürün barkoduna doğrultun.")
      && candidate.includes("KAPAT"),
    8000,
    "Kasa Barkod Modu kamera overlay'i açılamadı."
  );
  assertContains(xml, ["Kasa Barkod Okuyucu", "ELLE GIR", "KAPAT"]);
  captureScreenshot("market-cash-barcode-mode.png");
  tap(centerOf(findClickableBoundsByText(xml, "KAPAT")));
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("KASA BARKOD MODU")
      && candidate.includes("Modu Kapat"),
    5000,
    "Kamera overlay'i kapatılınca kasa barkod ekranına dönülemedi."
  );
  assertContains(xml, ["KASA BARKOD MODU", "Son taranan", "Modu Kapat"]);
  tap(centerOf(findClickableBoundsByText(xml, "Modu Kapat")));
  await waitForUiText("Saha işlemleri", 5000);

  scrollToBottom();
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Son stok hareketleri")
      && candidate.includes("Son mal kabuller")
      && candidate.includes("Test Tedarikçi"),
    5000,
    "Market gerçek hareket özetleri kaydırma alanında görünmedi."
  );
  assertContains(xml, ["Son stok hareketleri", "Test Kola 330 ml", "Son mal kabuller", "Test Tedarikçi"]);
  captureScreenshot("market-home-summary.png");
  scrollToTop();
  await delay(300);
  xml = dumpUi("market-home-top.xml");

  tap(centerOf(findClickableBoundsByText(xml, "Stok Say")));
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Fiziksel miktarı olduğu gibi kaydedin")
      && candidate.includes("Ürün seçilmedi"),
    5000,
    "Market stok sayım ekranı açılamadı."
  );
  assertContains(xml, ["Barkod Tara", "Ürün Seç", "Ürün seçilmedi"]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await waitForUiText("Saha işlemleri", 5000);

  xml = dumpUi("market-home-before-receiving.xml");
  tap(centerOf(findClickableBoundsByText(xml, "Mal Kabul")));
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Birden çok ürün satırı hazırlayın")
      && candidate.includes("Tedarikçi seçilmedi")
      && candidate.includes("Ürün satırları"),
    5000,
    "Market mal kabul ekranı açılamadı."
  );
  assertContains(xml, ["Tedarikçi (isteğe bağlı)", "Toplam satır", "Tahmini maliyet"]);
  scrollToBottom();
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Not (isteğe bağlı)") && candidate.includes("Mal Kabulü Gönder"),
    5000,
    "Market mal kabul alt eylemleri görünmedi."
  );
  scrollToTop();
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await waitForUiText("Saha işlemleri", 5000);

  await enterMarketBarcode("8699999999999");
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Barkod kayıtlı değil.")
      && candidate.includes("Yeni Ürün"),
    5000,
    "Bilinmeyen barkod akışı açılamadı."
  );
  tap(centerOf(findClickableBoundsByText(xml, "Yeni Ürün")));
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Ürün bilgileri doğrudan kataloğa kaydedilir.")
      && candidate.includes("Ürün adı")
      && candidate.includes("SKU (isteğe bağlı)"),
    5000,
    "Yeni ürün kayıt ekranı açılamadı."
  );
  assertContains(xml, ["Barkod", "8699999999999", "Ürün adı", "SKU (isteğe bağlı)", "Birim"]);
  captureScreenshot("market-product-create.png");
  let productCreateBottomXml = xml;
  for (let index = 0; index < 8 && !(productCreateBottomXml.includes("Ürünü Kaydet") && productCreateBottomXml.includes("Satış fiyatı (isteğe bağlı)")); index += 1) {
    swipe(360, 900, 360, 300, 420);
    await delay(300);
    productCreateBottomXml += dumpUi(`market-product-create-scrolled-${index}.xml`);
  }
  assertContains(productCreateBottomXml, ["Alış fiyatı (isteğe bağlı)", "Satış fiyatı (isteğe bağlı)", "Kategori (isteğe bağlı)", "Not", "Ürünü Kaydet"]);
  captureScreenshot("market-product-create-bottom.png");
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await waitForUiText("Saha işlemleri", 5000);

  await enterMarketBarcode("8690000000001");
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Test Kola 330 ml")
      && candidate.includes("Sepete Ekle")
      && candidate.includes("Mal Kabule Ekle"),
    5000,
    "Bilinen barkod ürün kartına çözülemedi."
  );
  assertContains(xml, ["Barkod: 8690000000001", "Stok: 7 adet", "Fiyat:", "35", "Sepete Ekle", "Stok Say", "Mal Kabule Ekle"]);
  captureScreenshot("market-known-barcode.png");
  tap(centerOf(findClickableBoundsByText(xml, "Sepete Ekle")));
  await waitForUiText("Sepet satırları", 5000);
  await enterMarketBarcode("8690000000001");
  await waitForUiText("Sepet satırları", 5000);
  scrollToBottom();
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Masaüstüne Gönder") && candidate.includes("70,00"),
    5000,
    "Aynı barkod ikinci okutulduğunda sepet miktarı artırılmadı."
  );
  assertNotContains(xml, ["Ödeme", "Satışı Tamamla"]);

  adb(["shell", "settings", "put", "system", "user_rotation", "1"]);
  adb(["shell", "wm", "set-user-rotation", "lock", "1"], { allowFailure: true });
  await waitForUiCondition(
    (candidate) => candidate.includes("Sepet satırları") && candidate.includes("70,00"),
    8000,
    "Sepet draft state ekran dönüşünde korunmadı."
  );
  captureScreenshot("market-cart-landscape.png");
  adb(["shell", "settings", "put", "system", "user_rotation", "0"]);
  adb(["shell", "wm", "set-user-rotation", "lock", "0"], { allowFailure: true });
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Sepet satırları") && candidate.includes("70,00"),
    8000,
    "Sepet portreye dönüşte korunmadı."
  );
  scrollToBottom();
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Masaüstüne Gönder") && candidate.includes("70,00"),
    5000,
    "Sepet gönderim eylemi kaydırma alanında görünmedi."
  );
  tap(centerOf(findClickableBoundsByText(xml, "Masaüstüne Gönder")));
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Sepet masaüstü için hazırlandı."),
    12000,
    "Sepet taslağı gönderim geri bildirimi alınamadı."
  );
  assertContains(xml, ["Masaüstü uygulaması bekleniyor", "Sepet masaüstü için hazırlandı."]);
  captureScreenshot("market-cart-sent.png");
}

async function enterMarketBarcode(barcode) {
  let xml = dumpUi(`market-barcode-before-${barcode}.xml`);
  const barcodeButton = xml.includes('text="▣  Barkod Tara"') ? "▣  Barkod Tara" : "Barkod Tara";
  tap(centerOf(findClickableBoundsByText(xml, barcodeButton)));
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Kamerayı barkoda doğrultun.") && candidate.includes("ELLE GIR"),
    5000,
    "Barkod kamera tarayıcısı açılamadı."
  );
  tap(centerOf(findClickableBoundsByText(xml, "ELLE GIR")));
  await waitForUiCondition(
    (candidate) => candidate.includes("Barkod Gir") && candidate.includes("Barkodu elle girin."),
    5000,
    "Barkod manuel giriş ekranı açılamadı."
  );
  adb(["shell", "input", "text", barcode]);
  xml = dumpUi(`market-barcode-entry-${barcode}.xml`);
  tap(centerOf(findClickableBoundsByText(xml, "BUL")));
}

async function runReportsOnly(baseUrl) {
  const deviceId = readDeviceId();
  await publishDeviceRole(baseUrl, deviceId, "staff");
  relaunchApp();
  let xml = await waitForUiCondition(
    (candidate) => candidate.includes("Personel")
      && candidate.includes('content-desc="Ayarlar"')
      && candidate.includes('text="Bugün"'),
    12000,
    "Odaklı rapor testi için personel profili uygulanmadı."
  );
  tap(centerOf(findClickableBoundsByDescription(xml, "Ayarlar")));
  const staffSettings = await waitForUiCondition(
    (candidate) => candidate.includes('text="Ayarlar"') && candidate.includes("Bildirim tercihleri"),
    5000,
    "Personel Ayarlar ekranı açılmadı."
  );
  assertNotContains(staffSettings, ["İşletme raporları", "Raporları Aç"]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  adb([
    "shell", "am", "start", "-n", `${packageName}/${activityName}`,
    "--es", "ya_notification_route", "reports"
  ]);
  const deniedRoute = await waitForUiCondition(
    (candidate) => candidate.includes("Bu cihazın raporlara erişim yetkisi yok.")
      && candidate.includes('text="Bugün"')
      && !candidate.includes('text="Raporlar"'),
    8000,
    "Personel odaklı rapor deep link testi reddedilmedi."
  );
  writeFileSync(join(artifactDir, "reports-only-staff-denied.xml"), deniedRoute);

  await publishDeviceRole(baseUrl, deviceId, "admin");
  relaunchApp();
  xml = await waitForUiCondition(
    (candidate) => candidate.includes("Yönetici")
      && candidate.includes('content-desc="Ayarlar"')
      && candidate.includes('text="Bugün"'),
    12000,
    "Odaklı rapor testi için yönetici profili uygulanmadı."
  );
  tap(centerOf(findClickableBoundsByDescription(xml, "Ayarlar")));
  const adminSettings = await waitForUiCondition(
    (candidate) => candidate.includes("İşletme raporları") && candidate.includes("Raporları Aç"),
    5000,
    "Odaklı rapor testinde yönetici aksiyonu görünmedi."
  );
  tap(centerOf(findClickableBoundsByText(adminSettings, "Raporları Aç")));
  xml = await waitForUiCondition(
    (candidate) => candidate.includes('text="Raporlar"')
      && candidate.includes("YÖNETİCİ RAPORU")
      && candidate.includes("₺6.400,00"),
    8000,
    "Odaklı rapor ekranı Son 7 Gün özetiyle açılmadı."
  );
  assertContains(xml, [
    "Bugün", "Dün", "Son 7 Gün", "Son 30 Gün",
    "Restoran cirosu", "Kapanan hesap", "Ortalama hesap",
    "Onaylanan rezervasyon", "Yeni talep", "Dikkat gerektiren"
  ]);
  assertNotContains(xml, ['text="Müşteri"', 'text="Pansiyon"', 'text="Mesajlar"']);

  tap(centerOf(findClickableBoundsByText(xml, "Dün")));
  xml = await waitForUiCondition((candidate) => candidate.includes("₺900,00"), 5000, "Dün filtresi çalışmadı.");
  tap(centerOf(findClickableBoundsByText(xml, "Bugün")));
  xml = await waitForUiCondition((candidate) => candidate.includes("₺1.600,00"), 5000, "Bugün filtresi çalışmadı.");
  tap(centerOf(findClickableBoundsByText(xml, "Son 30 Gün")));
  xml = await waitForUiCondition((candidate) => candidate.includes("₺18.200,00"), 5000, "Son 30 Gün filtresi çalışmadı.");
  tap(centerOf(findClickableBoundsByText(xml, "Son 7 Gün")));
  xml = await waitForUiCondition((candidate) => candidate.includes("₺6.400,00"), 5000, "Son 7 Gün filtresi çalışmadı.");

  if (xml.includes('content-desc="Gece moduna geç"')) {
    tap(centerOf(findClickableBoundsByDescription(xml, "Gece moduna geç")));
    xml = await waitForUiCondition(
      (candidate) => candidate.includes('content-desc="Gündüz moduna geç"') && candidate.includes('text="Raporlar"'),
      5000,
      "Odaklı rapor testi gece temasına dönemedi."
    );
  }
  captureScreenshot("reports-only-admin-night.png");
  tap(centerOf(findClickableBoundsByDescription(xml, "Gündüz moduna geç")));
  xml = await waitForUiCondition(
    (candidate) => candidate.includes('content-desc="Gece moduna geç"') && candidate.includes('text="Raporlar"'),
    5000,
    "Odaklı rapor testi gündüz temasına geçmedi."
  );
  captureScreenshot("reports-only-admin-day.png");
  tap(centerOf(findClickableBoundsByDescription(xml, "Gece moduna geç")));
  await waitForUiCondition(
    (candidate) => candidate.includes('content-desc="Gündüz moduna geç"') && candidate.includes('text="Raporlar"'),
    5000,
    "Odaklı rapor testi gece temasına dönemedi."
  );

  let reportBottom = "";
  for (let index = 0; index < 14; index += 1) {
    reportBottom = dumpUi(`reports-only-bottom-${index}.xml`);
    if (reportBottom.includes("Bu dönemi özetle")
        && reportBottom.includes("Dikkat edilmesi gerekenler")
        && reportBottom.includes("Satışları yorumla")
        && reportBottom.includes("3 kısa öneri ver")) {
      break;
    }
    swipe(360, 1080, 360, 300, 420);
    await delay(300);
  }
  assertContains(reportBottom, [
    "AI yorumu (isteğe bağlı)",
    "Bu dönemi özetle",
    "Dikkat edilmesi gerekenler",
    "Satışları yorumla",
    "3 kısa öneri ver"
  ]);
  tap(centerOf(findClickableBoundsByText(reportBottom, "Bu dönemi özetle")));
  const unavailable = await waitForUiCondition(
    (candidate) => candidate.includes("Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı."),
    15000,
    "Odaklı rapor testinde AI kapalı mesajı görünmedi."
  );
  assertContains(unavailable, ["Rapor verileri hazır ancak AI yorumu şu anda oluşturulamadı."]);
  captureScreenshot("reports-only-admin-ai-unavailable.png");
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await waitForUiText("İşletme raporları", 5000);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await waitForUiCondition(
    (candidate) => candidate.includes('text="Bugün"')
      && candidate.includes("Yönetici")
      && candidate.includes('text="Müşteri"'),
    5000,
    "Odaklı rapor testinde AndroidX geri akışı operasyon ekranına dönmedi."
  );
}

async function runStockImageOnly(baseUrl) {
  const deviceId = readDeviceId();
  await publishDeviceRole(baseUrl, deviceId, "admin");
  relaunchApp();
  const topXml = await waitForUiCondition(
    (xml) => xml.includes("Yönetici") && xml.includes('text="Restoran"'),
    12000,
    "Odaklı stok görseli testi için yönetici profili uygulanmadı."
  );
  tap(centerOf(findClickableBoundsByText(topXml, "Restoran")));
  await waitForUiCondition(
    (xml) => xml.includes("Masalar") && xml.includes("Açık Adisyon"),
    8000,
    "Odaklı stok görseli testi restoran ekranını açamadı."
  );
  await delay(300);
  let restaurantModesXml = dumpUi("stock-only-restaurant.xml");
  for (let index = 0; index < 4 && !restaurantModesXml.includes('text="Stok"'); index += 1) {
    swipe(650, 245, 180, 245, 320);
    await delay(300);
    restaurantModesXml = dumpUi("stock-only-restaurant-modes.xml");
  }
  const restaurantXml = await waitForUiCondition(
    (xml) => xml.includes('text="Stok"'),
    8000,
    "Odaklı stok görseli testi restoran ekranını açamadı."
  );
  tap(centerOf(findClickableBoundsByText(restaurantXml, "Stok")));
  const stockXml = await waitForUiCondition(
    (xml) => xml.includes("AI DESTEKLİ STOK GİRİŞİ") && xml.includes("Kamera ile çek") && xml.includes("Galeriden seç"),
    8000,
    "Odaklı stok görseli kartı açılmadı."
  );
  captureScreenshot("admin-stock-image-import.png");
  await exerciseStockImageSources(stockXml);
}

function startPhoneTest() {
  const args = ["scripts/android-phone-test.mjs", "--once", "--hold-ms", String(options.holdMs)];
  if (options.noBuild) {
    args.push("--no-build");
  }

  const child = spawn("node", args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.output = "";
  child.stdout.on("data", (chunk) => collectPhoneOutput(child, chunk));
  child.stderr.on("data", (chunk) => collectPhoneOutput(child, chunk));
  return child;
}

function collectPhoneOutput(child, chunk) {
  const text = chunk.toString();
  child.output += text;
  if (child.output.length > 40000) {
    child.output = child.output.slice(-20000);
  }

  process.stdout.write(prefixLines("android-phone-test", text));
}

function waitForReady(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`android-phone-test hazır olmadı.\n${child.output.trim()}`));
    }, timeoutMs);

    const interval = setInterval(() => {
      if (child.output.includes("android-phone-test-ready")) {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve();
      }
    }, 100);

    child.once("exit", (code) => {
      clearTimeout(timeout);
      clearInterval(interval);
      if (!child.output.includes("android-phone-test-ready")) {
        reject(new Error(`android-phone-test erken kapandı (${code ?? 0}).\n${child.output.trim()}`));
      }
    });
  });
}

function getPhoneTestBaseUrl(output) {
  const match = output.match(/Yerel kontrol:\s+(http:\/\/127\.0\.0\.1:\d+)\/api\/sync\.php/);
  if (!match) {
    throw new Error(`android-phone-test yerel kontrol adresi bulunamadı.\n${output.trim()}`);
  }

  return match[1];
}

function ensureAdbDevice() {
  const result = adb(["devices"], { capture: true, allowFailure: true });
  if (result.status !== 0) {
    throw new Error(result.stderr || "adb devices çalışmadı.");
  }

  const devices = result.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\sdevice(\s|$)/.test(line));

  if (devices.length === 0) {
    throw new Error("ADB cihazı bulunamadı. Telefon bağlı, kilitsiz ve USB hata ayıklama açık olmalı.");
  }
}

function lockDevicePortrait() {
  if (!originalDeviceOrientation) {
    const accelerometerRotation = adb(
      ["shell", "settings", "get", "system", "accelerometer_rotation"],
      { capture: true }
    ).stdout.trim();
    const userRotation = adb(
      ["shell", "settings", "get", "system", "user_rotation"],
      { capture: true }
    ).stdout.trim();
    if (!/^[01]$/.test(accelerometerRotation) || !/^[0-3]$/.test(userRotation)) {
      throw new Error("Android ekran yönü test öncesinde güvenli biçimde okunamadı.");
    }
    originalDeviceOrientation = { accelerometerRotation, userRotation };
  }
  adb(["shell", "settings", "put", "system", "accelerometer_rotation", "0"]);
  adb(["shell", "settings", "put", "system", "user_rotation", "0"]);
  adb(["shell", "wm", "set-user-rotation", "lock", "0"], { allowFailure: true });
}

function restoreDeviceOrientation() {
  if (!originalDeviceOrientation) {
    return;
  }
  const { accelerometerRotation, userRotation } = originalDeviceOrientation;
  originalDeviceOrientation = null;
  adb(["shell", "settings", "put", "system", "user_rotation", userRotation], { allowFailure: true });
  adb(["shell", "settings", "put", "system", "accelerometer_rotation", accelerometerRotation], { allowFailure: true });
  adb(
    accelerometerRotation === "1"
      ? ["shell", "wm", "set-user-rotation", "free"]
      : ["shell", "wm", "set-user-rotation", "lock", userRotation],
    { allowFailure: true }
  );
}

function dumpUi(fileName) {
  adb(["shell", "uiautomator", "dump", "/sdcard/window.xml"]);
  const outputPath = join(artifactDir, fileName);
  const result = adb(["exec-out", "cat", "/sdcard/window.xml"], {
    capture: true,
    maxBuffer: 8 * 1024 * 1024
  });
  writeFileSync(outputPath, result.stdout);
  return readFileSync(outputPath, "utf8");
}

function captureScreenshot(fileName) {
  const outputPath = join(artifactDir, fileName);
  const result = adb(["exec-out", "screencap", "-p"], {
    binary: true,
    capture: true,
    maxBuffer: 24 * 1024 * 1024
  });
  writeFileSync(outputPath, result.stdout);
}

function tap(point) {
  adb(["shell", "input", "tap", String(point.x), String(point.y)]);
}

function swipe(x1, y1, x2, y2, durationMs) {
  adb(["shell", "input", "swipe", String(x1), String(y1), String(x2), String(y2), String(durationMs)]);
}

function prepareAppForUi(baseUrl) {
  deviceIdBeforeUiReset = readPreferenceValueIfPresent("device_id");
  adb(["shell", "input", "keyevent", "KEYCODE_WAKEUP"], { allowFailure: true });
  adb(["shell", "wm", "dismiss-keyguard"], { allowFailure: true });
  adb(["shell", "am", "force-stop", "com.android.documentsui"], { allowFailure: true });
  if (!options.companionOnly) prepareSystemCameraForUiTest();
  adb(["shell", "cmd", "statusbar", "collapse"], { allowFailure: true });
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"], { allowFailure: true });
  adb(["shell", "am", "force-stop", packageName], { allowFailure: true });
  adb([
    "shell",
    "am",
    "start",
    "-n",
    `${packageName}/${activityName}`,
    "--es",
    "ya_web_module_url",
    baseUrl,
    "--es",
    "ya_sync_secret",
    syncSecret,
    "--ez",
    "ya_allow_debug_connection_override",
    "true",
    "--ez",
    "ya_reset_debug_app_state",
    "true"
  ]);
}

function prepareSystemCameraForUiTest() {
  const cameraPackage = "net.sourceforge.opencamera";
  const installed = adb(["shell", "pm", "path", cameraPackage], { capture: true, allowFailure: true });
  if (installed.status !== 0 || !installed.stdout.includes("package:")) {
    return;
  }
  adb(["shell", "am", "start", "-W", "-n", `${cameraPackage}/.MainActivity`], { allowFailure: true });
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"], { allowFailure: true });
}

function prepareStockGalleryFixture() {
  if (!existsSync(stockGalleryFixture)) {
    throw new Error(`Android galeri smoke görseli bulunamadı: ${stockGalleryFixture}`);
  }
  adb(["shell", "mkdir", "-p", "/sdcard/Download"]);
  adb(["push", stockGalleryFixture, stockGalleryDeviceFile]);
  adb([
    "shell", "am", "broadcast",
    "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
    "-d", "file:///sdcard/Download/yardimci-stock-image-smoke.png"
  ], { allowFailure: true });
}

async function exerciseStockImageSources(stockXml) {
  tap(centerOf(findBoundsByText(stockXml, "Galeriden seç")));
  await waitForFocusedPackage("com.android.documentsui", 8000, "Sistem görsel seçicisi açılmadı.");
  let pickerXml = dumpUi("stock-image-gallery-recent.xml");
  if (!pickerXml.includes("yardimci-stock-image-smoke")) {
    tap(centerOf(findClickableBoundsByDescription(pickerXml, "Show roots")));
    const rootsXml = await waitForUiCondition(
      (xml) => xml.includes('text="Downloads"'),
      5000,
      "Sistem dosya seçicisinde Downloads kökü bulunamadı."
    );
    tap(centerOf(findBoundsByText(rootsXml, "Downloads")));
    pickerXml = await waitForUiCondition(
      (xml) => xml.includes("yardimci-stock-image-smoke"),
      8000,
      "Galeri smoke görseli Downloads klasöründe bulunamadı."
    );
  }
  captureScreenshot("stock-image-gallery-picker.png");
  const fixtureBounds = findBoundsByTextIfPresent(pickerXml, "yardimci-stock-image-smoke.png")
      ?? findBoundsByTextIfPresent(pickerXml, "yardimci-stock-image-smoke")
      ?? findBoundsByContentDescriptionPrefix(pickerXml, "yardimci-stock-image-smoke.png");
  if (!fixtureBounds) {
    throw new Error("Galeri smoke görseli tıklanabilir bir dosya olarak bulunamadı.");
  }
  tap(centerOf(fixtureBounds));
  const previewXml = await waitForUiCondition(
    (xml) => xml.includes("Görseli kontrol et") && xml.includes("Görsel hazır") && xml.includes("Analiz Et"),
    15000,
    "Galeriden seçilen görsel güvenli önizlemeye hazırlanamadı."
  );
  assertContains(previewXml, ["AI DESTEKLİ STOK GİRİŞİ", "Görseli kontrol et", "90° döndür", "Yeniden çek", "Başka görsel seç", "Analiz Et", "kalıcı saklanmaz"]);
  captureScreenshot("stock-image-gallery-preview.png");
  tap(centerOf(findBoundsByText(previewXml, "90° döndür")));
  tap(centerOf(findBoundsByText(previewXml, "Analiz Et")));
  const disabledAiXml = await waitForUiCondition(
    (xml) => xml.includes("AI görsel analizi işletme ayarlarında kapalı."),
    20000,
    "Fiziksel cihazdaki görsel analiz hata geri bildirimi alınamadı."
  );
  assertContains(disabledAiXml, ["AI görsel analizi işletme ayarlarında kapalı.", "Analiz Et"]);
  captureScreenshot("stock-image-analysis-disabled-feedback.png");
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  const returnedStockXml = await waitForUiCondition(
    (xml) => xml.includes("AI DESTEKLİ STOK GİRİŞİ") && xml.includes("Kamera ile çek"),
    8000,
    "Görsel önizlemesinden stok ekranına dönülemedi."
  );

  tap(centerOf(findBoundsByText(returnedStockXml, "Kamera ile çek")));
  await waitForFocusedPackage("net.sourceforge.opencamera", 10000, "Sistem kamera uygulaması açılamadı.");
  await delay(1000);
  const cameraXml = dumpUi("stock-image-system-camera.xml");
  assertContains(cameraXml, ["net.sourceforge.opencamera:id/take_photo", 'content-desc="Take Photo"']);
  tap(centerOf(findBoundsByResourceId(cameraXml, "net.sourceforge.opencamera:id/take_photo")));
  const cameraPreviewXml = await waitForUiCondition(
    (xml) => xml.includes("Görseli kontrol et") && xml.includes("Görsel hazır") && xml.includes("Analiz Et"),
    20000,
    "Sistem kamerasıyla çekilen görsel güvenli önizlemeye dönmedi."
  );
  assertContains(cameraPreviewXml, ["Yeniden çek", "Başka görsel seç", "90° döndür", "kalıcı saklanmaz"]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await waitForUiCondition(
    (xml) => xml.includes("AI DESTEKLİ STOK GİRİŞİ") && xml.includes("Galeriden seç"),
    10000,
    "Sistem kamerasından stok ekranına dönülemedi."
  );
  const remainingCameraFiles = adb(
    ["shell", "run-as", packageName, "find", "cache/stock-images", "-type", "f"],
    { capture: true, allowFailure: true }
  );
  assert.equal(
    remainingCameraFiles.stdout.trim(),
    "",
    "İptal edilen kamera çekiminin güvenli geçici dosyası silinmedi."
  );
}

async function waitForFocusedPackage(packageName, timeoutMs, message) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (focusedPackage() === packageName) {
      return;
    }
    await delay(300);
  }
  throw new Error(`${message} Odak: ${focusedPackage() || "bilinmiyor"}`);
}

function focusedPackage() {
  const result = adb(["shell", "dumpsys", "activity", "activities"], { capture: true, allowFailure: true });
  const match = result.stdout?.match(/(?:topResumedActivity|ResumedActivity|mResumedActivity):?[^\n]*\su\d+\s+([^/\s}]+)/);
  return match?.[1] ?? "";
}

function relaunchApp() {
  if (!uiTestBaseUrl) {
    throw new Error("Android UI test bağlantısı hazırlanmadı.");
  }
  adb(["shell", "am", "force-stop", packageName], { allowFailure: true });
  adb([
    "shell",
    "am",
    "start",
    "-n",
    `${packageName}/${activityName}`,
    "--es",
    "ya_web_module_url",
    uiTestBaseUrl,
    "--es",
    "ya_sync_secret",
    syncSecret,
    "--ez",
    "ya_allow_debug_connection_override",
    "true"
  ]);
}

function relaunchAppWithConnectionExtras(webModuleUrl, secret) {
  adb(["shell", "am", "force-stop", packageName], { allowFailure: true });
  adb([
    "shell",
    "am",
    "start",
    "-n",
    `${packageName}/${activityName}`,
    "--es",
    "ya_web_module_url",
    webModuleUrl,
    "--es",
    "ya_sync_secret",
    secret
  ]);
}

function readDeviceId() {
  return readPreferenceValue("device_id");
}

async function restoreEmbeddedConnectionAfterTest() {
  if (!embeddedConnectionIsLocked()) {
    return;
  }
  adb(["shell", "am", "force-stop", packageName], { allowFailure: true });
  adb([
    "shell",
    "am",
    "start",
    "-n",
    `${packageName}/${activityName}`,
    "--ez",
    "ya_reset_debug_app_state",
    "true"
  ]);
  const startedAt = Date.now();
  let restoredUrl = "";
  while (Date.now() - startedAt < 8000) {
    restoredUrl = readPreferenceValueIfPresent("web_module_url");
    if (restoredUrl && restoredUrl !== uiTestBaseUrl) {
      break;
    }
    await delay(250);
  }
  assert.ok(restoredUrl, "Gömülü Android bağlantısı test sonunda geri yüklenmedi.");
  assert.notEqual(restoredUrl, uiTestBaseUrl);
  assert.equal(new URL(restoredUrl).protocol, "https:");
  adb(["shell", "am", "force-stop", packageName], { allowFailure: true });
}

function embeddedConnectionIsLocked() {
  return existsSync(generatedConnectionDefaultsFile)
      && readFileSync(generatedConnectionDefaultsFile, "utf8").includes("LOCK_EMBEDDED_CONNECTION = true");
}

function readPreferenceValue(name) {
  const result = adb([
    "shell",
    "run-as",
    packageName,
    "cat",
    "shared_prefs/yardimci_asistan_android.xml"
  ], { capture: true });
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = result.stdout.match(new RegExp(`<string name="${escapedName}">([^<]+)<\\/string>`));
  if (!match) {
    throw new Error(`Android tercih değeri okunamadı: ${name}`);
  }
  return match[1].trim();
}

function readPreferenceValueIfPresent(name) {
  const result = adb([
    "shell",
    "run-as",
    packageName,
    "cat",
    "shared_prefs/yardimci_asistan_android.xml"
  ], { capture: true, allowFailure: true });
  if (result.status !== 0) {
    return "";
  }
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = result.stdout.match(new RegExp(`<string name="${escapedName}">([^<]+)<\\/string>`));
  return match ? match[1].trim() : "";
}

async function publishDeviceRole(baseUrl, deviceId, role, options = {}) {
  const permissions = options.permissions ?? (role === "admin" ? adminPermissions : staffPermissions);
  return publishDeviceProfiles(baseUrl, {
    [deviceId]: {
      role,
      is_active: options.isActive ?? true,
      permissions
    }
  }, role);
}

async function publishMissingDeviceProfile(baseUrl) {
  return publishDeviceProfiles(baseUrl, {}, "eksik profil");
}

async function publishNotificationRequest(baseUrl, deviceId, permissions, requestId, customerName, status) {
  const snapshot = JSON.parse(readFileSync(androidSnapshotFixtureFile, "utf8"));
  snapshot.requests = [
    {
      id: requestId,
      customer_id: "customer_android_notification_smoke_001",
      request_type: "general_info",
      status,
      customer_name: customerName,
      customer_phone: "+905550000001",
      date_text: "",
      start_date: "",
      end_date: "",
      time: "",
      guest_count: 1,
      message: "Yerel bildirim izin ve spam testi.",
      ai_summary: "",
      ai_suggested_reply: "",
      whatsapp_message: "",
      priority: "high",
      created_at: "2026-07-18T13:00:00+03:00",
      updated_at: new Date().toISOString()
    },
    ...(snapshot.requests ?? []).filter((request) => request.id !== requestId)
  ];
  snapshot.androidPermissions = {
    [deviceId]: {
      role: "staff",
      is_active: true,
      permissions
    }
  };
  return publishSnapshot(baseUrl, snapshot, "bildirim testi");
}

async function publishDeviceProfiles(baseUrl, profiles, label) {
  const snapshot = JSON.parse(readFileSync(androidSnapshotFixtureFile, "utf8"));
  snapshot.androidPermissions = profiles;
  snapshot.reports = createReportFixtures();
  await publishSnapshot(baseUrl, snapshot, label);
}

function createReportFixtures() {
  const today = localDateKey(new Date());
  const attention = {
    pending_requests: 2,
    pending_reservations: 1,
    payment_waiting_tables: 1,
    overdue_tasks: 1,
    incomplete_tasks: 2,
    out_of_stock_items: 1,
    low_stock_items: 0,
    items: [
      {
        kind: "pending_request",
        title: "2 müşteri talebi cevap bekliyor",
        detail: "Yanıt bekleyen talepleri öncelik sırasıyla sonuçlandırın."
      },
      {
        kind: "out_of_stock",
        title: "Ev Limonatası stokta yok",
        detail: "Satış için gereken stok bulunmuyor."
      }
    ]
  };
  return {
    today: createReportFixture("today", "Bugün", today, today, 1600, 2, 800, 1, 2, attention),
    yesterday: createReportFixture(
      "yesterday",
      "Dün",
      shiftLocalDate(today, -1),
      shiftLocalDate(today, -1),
      900,
      1,
      900,
      0,
      1,
      attention
    ),
    last7: createReportFixture(
      "last7",
      "Son 7 Gün",
      shiftLocalDate(today, -6),
      today,
      6400,
      8,
      800,
      2,
      6,
      attention
    ),
    last30: createReportFixture(
      "last30",
      "Son 30 Gün",
      shiftLocalDate(today, -29),
      today,
      18200,
      28,
      650,
      7,
      18,
      attention
    )
  };
}

function createReportFixture(key, label, start, end, revenue, closedOrders, averageOrder, approvedReservations, newRequests, attention) {
  return {
    period: { key, label, start, end },
    summary: {
      restaurant_revenue: revenue,
      closed_orders: closedOrders,
      average_order: averageOrder,
      approved_reservations: approvedReservations,
      new_requests: newRequests,
      attention_count: 7
    },
    restaurant: {
      sold_item_count: key === "last30" ? 72 : key === "last7" ? 24 : 7,
      cancelled_orders: key === "today" ? 1 : 0,
      top_items: [
        { name: "Türk Kahvesi", quantity: 8, revenue: 720 },
        { name: "Ev Limonatası", quantity: 6, revenue: 720 },
        { name: "Serpme Kahvaltı", quantity: 4, revenue: 1800 }
      ],
      daily_revenue: [{ date: end, revenue, closed_orders: closedOrders }]
    },
    attention
  };
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftLocalDate(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

async function publishSnapshot(baseUrl, snapshot, label) {
  snapshot.updated_at = new Date().toISOString();
  // Üretim varsayılanında açık olan istek yeteneği fixture'da yok; olmadan
  // müşteri çalışma alanı fail-closed kalır ve bildirim hedefi çizilemez.
  snapshot.business_capabilities = [...new Set([...(snapshot.business_capabilities ?? []), "customer.requests"])];
  snapshotRevision += 1;
  const response = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": syncSecret
    },
    body: JSON.stringify(publicationEnvelope({
      action: "publish_android_snapshot",
      client_id: "android-phone-test",
      source_revision: snapshotRevision,
      idempotency_key: `android-ui-permission-smoke-${snapshotRevision}`,
      snapshot
    }))
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.message ?? `${label} Android profili yayınlanamadı.`);
  }
  return snapshot.updated_at;
}

function notificationDump() {
  const result = adb(["shell", "dumpsys", "notification", "--noredact"], { capture: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const listStart = output.indexOf("Notification List:");
  const listEnd = output.indexOf("\n  mUseAttentionLight", listStart);
  return listStart >= 0
    ? output.slice(listStart, listEnd >= 0 ? listEnd : output.length)
    : output;
}

async function waitForNotificationText(text, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (notificationDump().includes(text)) {
      return;
    }
    await delay(500);
  }
  throw new Error(`Android bildirimi beklenirken zaman aşımı: ${text}`);
}

async function waitForNotificationAbsence(text, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!notificationDump().includes(text)) {
      return;
    }
    await delay(500);
  }
  throw new Error(`Çözülen Android bildirimi aktif listeden kalkmadı: ${text}`);
}

async function waitForNotificationShadeMessage(text, timeoutMs) {
  const startedAt = Date.now();
  let xml = "";
  while (Date.now() - startedAt < timeoutMs) {
    adb(["shell", "cmd", "statusbar", "expand-notifications"], { allowFailure: true });
    await delay(800);
    xml = dumpUi("notification-shade.xml");
    if (xml.includes(text)) {
      return xml;
    }
    await delay(500);
  }
  assertContains(xml, [text]);
  return xml;
}

async function tapNotificationAndWaitForCustomerRequests(shadeXml, message, customerName) {
  const isCustomerRequests = (xml) =>
    xml.includes('text="Müşteri"') && xml.includes("Yeni Talepler") && xml.includes(customerName);
  let currentShadeXml = shadeXml;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Perde animasyonu oturmadan alınan sınırlar ıskalar; her denemede taze döküm.
    await delay(1200);
    currentShadeXml = dumpUi("notification-shade-tap.xml");
    if (!currentShadeXml.includes(message)) {
      currentShadeXml = await waitForNotificationShadeMessage(message, 8000);
    }
    tap(centerOf(findNotificationClickBounds(currentShadeXml, message, customerName)));
    const startedAt = Date.now();
    while (Date.now() - startedAt < 8000) {
      const xml = dumpUi("wait-condition.xml");
      if (isCustomerRequests(xml)) {
        return;
      }
      if (xml.includes(message)) {
        break;
      }
      await delay(500);
    }
    const confirmXml = dumpUi("wait-condition.xml");
    if (isCustomerRequests(confirmXml)) {
      return;
    }
    try {
      currentShadeXml = await waitForNotificationShadeMessage(message, 8000);
    } catch {
      break;
    }
  }
  await waitForUiCondition(
    (xml) => xml.includes('text="Müşteri"') && xml.includes("Yeni Talepler") && xml.includes(customerName),
    12000,
    "Müşteri bildirimine dokununca Yeni Talepler modu açılmadı."
  );
}

async function waitForCachedSnapshotText(text, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (readPreferenceValueIfPresent("operations_cache_v2").includes(text)) {
      return;
    }
    await delay(500);
  }
  throw new Error(`Android foreground sync snapshot'ı almadı: ${text}`);
}

function countOccurrences(value, search) {
  return value.split(search).length - 1;
}

function scrollToTop() {
  for (let index = 0; index < 3; index += 1) {
    swipe(360, 300, 360, 1120, 300);
  }
  adb(["shell", "cmd", "statusbar", "collapse"], { allowFailure: true });
}

function scrollToBottom() {
  for (let index = 0; index < 4; index += 1) {
    swipe(360, 1080, 360, 260, 300);
  }
}

async function waitForUiText(text, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const xml = dumpUi("wait.xml");
    if (xml.includes(text)) {
      return;
    }
    await delay(500);
  }

  throw new Error(`Android UI metni beklenirken zaman aşımı: ${text}`);
}

async function waitForUiCondition(predicate, timeoutMs, message) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const xml = dumpUi("wait-condition.xml");
    if (predicate(xml)) {
      return xml;
    }
    await delay(500);
  }
  throw new Error(message);
}

async function waitForAction(baseUrl, actionType, expectedPayload, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${baseUrl}/api/sync.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-YA-Sync-Secret": syncSecret
      },
      body: JSON.stringify({
        action: "pull_android_actions",
        sync_secret: syncSecret,
        limit: 100
      })
    });
    const json = await response.json();
    const action = json.actions?.find((candidate) => candidate.action_type === actionType
      && Object.entries(expectedPayload).every(([key, value]) => candidate.payload?.[key] === value));
    if (action) {
      return;
    }

    await delay(500);
  }

  throw new Error(`Beklenen Android action kuyruğa eklenmedi: ${actionType}`);
}

function adb(args, options = {}) {
  const result = spawnSync("adb", args, {
    cwd: repoRoot,
    encoding: options.binary ? null : "utf8",
    input: options.input,
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024
  });

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`adb ${args.join(" ")} başarısız oldu.\n${formatOutput(result)}`.trim());
  }

  return result;
}

function ensureArtifactDir() {
  if (!existsSync(artifactDir)) {
    mkdirSync(artifactDir, { recursive: true });
  }
}

function prefixLines(name, text) {
  return text
    .split(/(\r?\n)/)
    .map((part) => (part === "\n" || part === "\r\n" || part === "" ? part : `[${name}] ${part}`))
    .join("");
}

function formatOutput(result) {
  return `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`.trim();
}

function cleanup() {
  adb(["shell", "rm", "-f", stockGalleryDeviceFile], { allowFailure: true });
  adb(["shell", "am", "force-stop", "com.android.documentsui"], { allowFailure: true });
  if (focusedPackage() === "net.sourceforge.opencamera") {
    adb(["shell", "input", "keyevent", "KEYCODE_BACK"], { allowFailure: true });
  }
  restoreDeviceOrientation();
  if (phoneTest && phoneTest.exitCode === null) {
    phoneTest.kill();
  }
}

function waitForPhoneTestExit() {
  return new Promise((resolve) => {
    if (!phoneTest || phoneTest.exitCode !== null) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, 10000);
    phoneTest.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function stopAndExit(code) {
  cleanup();
  await waitForPhoneTestExit();
  restoreCompanionPreferences();
  process.exit(code);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
