import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = join(repoRoot, "artifacts", "android-device-ui");
const packageName = "com.yardimciasistan.android";
const activityName = ".MainActivity";
const syncSecret = "change-this-secret";
const demoSnapshotFile = join(repoRoot, "demo-data", "android-operations-snapshot.json");
const generatedConnectionDefaultsFile = join(repoRoot, "apps", "android-app", "build", "generated", "source", "r", "com", "yardimciasistan", "android", "ConnectionDefaults.java");
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
const staffPermissions = [...serviceOrderPermissions, ...roomsTasksPermissions];
const adminPermissions = [
  "customer.view",
  "customer.respond",
  "customer.mark_answered",
  "customer.reject",
  "customer.convert_to_reservation",
  "reservation.view",
  "reservation.approve",
  "reservation.reject",
  "reservation.cancel",
  "room.view",
  "room.update_status",
  "daily_task.view",
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
  "menu.stock_view",
  "menu.stock_update",
  "settings.view",
  "settings.edit",
  "android_devices.view",
  "android_devices.manage"
];
let snapshotRevision = 100;
let uiTestBaseUrl = "";
let deviceIdBeforeUiReset = "";

const options = parseArgs(process.argv.slice(2));
let phoneTest = null;

process.once("SIGINT", () => stopAndExit(0));
process.once("SIGTERM", () => stopAndExit(0));

try {
  await main();
} catch (error) {
  cleanup();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main() {
  ensureArtifactDir();
  ensureAdbDevice();

  phoneTest = startPhoneTest();
  await waitForReady(phoneTest, options.readyTimeoutMs);
  const baseUrl = getPhoneTestBaseUrl(phoneTest.output);
  uiTestBaseUrl = baseUrl;
  prepareAppForUi(baseUrl);
  await delay(options.settleMs);
  await waitForUiText("2 oda içinde", 12000);
  scrollToTop();
  await delay(400);

  let topXml = dumpUi("top.xml");
  captureScreenshot("top.png");
  assertContains(topXml, ["Bugün", "GÜNLÜK OPERASYON", "Pansiyon", "Restoran"]);
  assertNotContains(topXml, ["Yeni talepler", 'text="Müşteri"', 'text="Mesajlar"', "Canlı veri çekiliyor", "Canlı veri alındı", "Veriler zaten güncel", "Son yayın:"]);

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
    (xml) => xml.includes("Personel") && !xml.includes('text="Ayarlar"') && !xml.includes('text="Yenile"'),
    20000,
    "Personel yetki profili Android arayüzüne uygulanmadı."
  );
  assertNotContains(afterRefreshXml, ["GÜNLÜK OPERASYON", "Canlı veri çekiliyor", "Canlı veri alındı", "Veriler zaten güncel", "Son yayın:"]);
  scrollToTop();
  await delay(400);

  topXml = dumpUi("staff-top.xml");
  captureScreenshot("staff-top.png");
  assertContains(topXml, ["Personel", "Bildirimler", "Boş odalar", "Hesap bekleyen", "Pansiyon", "Restoran"]);
  assertNotContains(topXml, ["Ayarlar", "Yenile", 'text="Müşteri"', 'text="Mesajlar"', syncSecret]);
  tap(centerOf(findBoundsByText(topXml, "Bildirimler")));
  await delay(400);
  const staffNotificationsXml = dumpUi("staff-notification-preferences.xml");
  assertContains(staffNotificationsXml, ["Bildirim tercihleri", "Restoran / Masa", "Oda / Günlük İş", "İşlem hataları"]);
  assertNotContains(staffNotificationsXml, ["Sync bağlantısı", "Bağlantı özeti", "Güvenlik anahtarı", syncSecret]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await delay(300);

  relaunchAppWithConnectionExtras("https://override.invalid/device-hijack", "override-secret-not-allowed");
  await waitForUiCondition(
    (xml) => xml.includes("Personel") && !xml.includes('text="Ayarlar"'),
    12000,
    "Personel profili bağlantı extra denemesinden sonra korunmadı."
  );
  assert.notEqual(readPreferenceValue("web_module_url"), "https://override.invalid/device-hijack");
  assert.notEqual(readPreferenceValue("sync_secret"), "override-secret-not-allowed");
  await publishDeviceRole(baseUrl, deviceId, "staff");
  relaunchApp();
  await waitForUiCondition(
    (xml) => xml.includes("Personel") && xml.includes('text="Pansiyon"') && !xml.includes('text="Ayarlar"'),
    12000,
    "Geçici test bağlantısı yeniden uygulanamadı."
  );
  await publishMissingDeviceProfile(baseUrl);
  relaunchApp();
  await waitForUiCondition(
    (xml) => xml.includes("Personel") && xml.includes('text="Pansiyon"') && !xml.includes('text="Ayarlar"'),
    12000,
    "Daha önce çözülmüş personel profili eksik snapshot sonrasında korunmadı."
  );
  assert.equal(readPreferenceValue("device_id"), deviceId);

  topXml = dumpUi("staff-after-profile-gap.xml");
  tap(centerOf(findClickableBoundsByText(topXml, "Pansiyon")));
  await delay(400);
  let staffPensionCombinedXml = dumpUi("staff-pension.xml");
  for (let index = 0; index < 2; index += 1) {
    swipe(360, 1080, 360, 360, 400);
    await delay(350);
    staffPensionCombinedXml += dumpUi(`staff-pension-scrolled-${index}.xml`);
  }
  assertContains(staffPensionCombinedXml, ["Odalar", "Temizlik", "Günlük işler", "Tamamla"]);
  assertNotContains(staffPensionCombinedXml, ["WhatsApp", "Reddet", "Rezervasyonu İptal Et"]);

  const staffPensionCurrentXml = dumpUi("staff-pension-current.xml");
  tap(centerOf(findClickableBoundsByText(staffPensionCurrentXml, "Restoran")));
  await delay(500);

  let staffRestaurantXml = dumpUi("staff-restaurant.xml");
  assertContains(staffRestaurantXml, ["Stok takibi"]);
  for (let index = 0; index < 4; index += 1) {
    const bounds = findBoundsByTextIfPresent(staffRestaurantXml, "Salon Masası 1");
    if (bounds && bounds.top >= 100 && bounds.bottom <= 1160) {
      break;
    }
    swipe(360, 1080, 360, 380, 420);
    await delay(400);
    staffRestaurantXml = dumpUi("staff-restaurant-scrolled.xml");
  }
  tap(centerOf(findBoundsByText(staffRestaurantXml, "Siparişi Aç")));
  await delay(500);
  let staffOrderXml = dumpUi("staff-table-order.xml");
  for (let index = 0; index < 6 && !staffOrderXml.includes("Hesap Bekliyor"); index += 1) {
    swipe(360, 1080, 360, 300, 420);
    await delay(350);
    staffOrderXml = dumpUi("staff-table-order-scrolled.xml");
  }
  captureScreenshot("staff-table-order.png");
  assertContains(staffOrderXml, ["Hesap Bekliyor"]);
  assertNotContains(staffOrderXml, ["Ödendi / Kapat"]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await delay(300);
  let staffStockXml = "";
  for (let index = 0; index < 12; index += 1) {
    const currentXml = dumpUi(`staff-stock-${index}.xml`);
    staffStockXml += currentXml;
    if (staffStockXml.includes("Stokta olmayanlar")
        && staffStockXml.includes("Azalanlar")
        && staffStockXml.includes("Tüm takip edilen ürünler")
        && staffStockXml.includes("Ev Limonatası")) {
      break;
    }
    swipe(360, 1080, 360, 760, 360);
    await delay(300);
  }
  assertContains(staffStockXml, ["Stokta olmayanlar", "Azalanlar", "Tüm takip edilen ürünler", "Ev Limonatası", "Serpme Kahvaltı", "QR menüde"]);
  assertNotContains(staffStockXml, ["+1 Ekle", "Adedi Ayarla", "Fark Gir"]);

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
  await waitForCachedSnapshotText(repeatedNotificationSnapshotAt, 20000);
  await waitForNotificationText(notificationCustomerName, 12000);
  assert.equal(countOccurrences(readPreferenceValue("notification_event_ledger_v1"), notificationEventKey), 1, "Aynı snapshot bildirimi ledger'da çoğalttı.");

  await publishNotificationRequest(baseUrl, deviceId, customerReservationPermissions, notificationRequestId, notificationCustomerName, "answered");
  await waitForNotificationAbsence(notificationCustomerName, 20000);

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
  await waitForCachedSnapshotText(notificationClickSnapshotAt, 20000);
  await waitForNotificationText(notificationClickCustomer, 12000);
  adb(["shell", "cmd", "statusbar", "expand-notifications"]);
  await delay(800);
  let notificationShadeXml = dumpUi("notification-shade.xml");
  const notificationClickMessage = `${notificationClickCustomer} · Yerel bildirim izin ve spam testi.`;
  assertContains(notificationShadeXml, [notificationClickMessage]);
  const notificationGroupExpandBounds = findNotificationGroupExpandBounds(notificationShadeXml, notificationClickMessage);
  if (notificationGroupExpandBounds) {
    tap(centerOf(notificationGroupExpandBounds));
    await delay(600);
    notificationShadeXml = dumpUi("notification-shade-expanded.xml");
    assertContains(notificationShadeXml, [notificationClickMessage]);
  }
  tap(centerOf(findNotificationClickBounds(notificationShadeXml, notificationClickMessage)));
  await waitForUiCondition(
    (xml) => xml.includes("MÜŞTERİ İŞLERİ") && xml.includes(notificationClickCustomer),
    12000,
    "Müşteri bildirimine dokununca Müşteri sekmesi açılmadı."
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
  let cashierTopXml = dumpUi("cashier-top.xml");
  tap(centerOf(findClickableBoundsByText(cashierTopXml, "Restoran")));
  await delay(500);
  let cashierRestaurantXml = dumpUi("cashier-restaurant.xml");
  for (let index = 0; index < 4; index += 1) {
    const bounds = findBoundsByTextIfPresent(cashierRestaurantXml, "Salon Masası 1");
    if (bounds && bounds.top >= 100 && bounds.bottom <= 1160) {
      break;
    }
    swipe(360, 1080, 360, 380, 420);
    await delay(400);
    cashierRestaurantXml = dumpUi("cashier-restaurant-scrolled.xml");
  }
  tap(centerOf(findBoundsByText(cashierRestaurantXml, "Siparişi Aç")));
  await delay(500);
  let cashierOrderXml = dumpUi("cashier-table-order.xml");
  for (let index = 0; index < 6 && !cashierOrderXml.includes("Ödendi / Kapat"); index += 1) {
    swipe(360, 1080, 360, 300, 420);
    await delay(350);
    cashierOrderXml = dumpUi("cashier-table-order-scrolled.xml");
  }
  assertContains(cashierOrderXml, ["Ödendi / Kapat"]);
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
  assertNotContains(customerPackageTopXml, ['text="Restoran"', "Boş odalar", "Boş masalar"]);
  tap(centerOf(findClickableBoundsByText(customerPackageTopXml, "Müşteri")));
  await delay(500);
  const customerPackageListXml = dumpUi("customer-package-list.xml");
  assertContains(customerPackageListXml, ["MÜŞTERİ İŞLERİ", "Yeni Talepler", "Demo Aile"]);
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
  let customerPackagePensionXml = dumpUi("customer-package-pension.xml");
  for (let index = 0; index < 2 && !customerPackagePensionXml.includes("Onayla"); index += 1) {
    swipe(360, 1080, 360, 360, 420);
    await delay(350);
    customerPackagePensionXml += dumpUi(`customer-package-pension-scrolled-${index}.xml`);
  }
  assertContains(customerPackagePensionXml, ["Rezervasyonlar", "Onayla"]);
  assertNotContains(customerPackagePensionXml, ["Reddet", "Rezervasyonu İptal Et", "Odalar", "Günlük işler"]);

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
    (xml) => xml.includes("Personel") && xml.includes('text="Ayarlar"') && xml.includes('text="Yenile"'),
    12000,
    "Salt-okunur ayar profili Android arayüzüne uygulanmadı."
  );
  scrollToTop();
  await delay(300);
  const settingsViewerTopXml = dumpUi("settings-viewer-top.xml");
  assertContains(settingsViewerTopXml, ["Ayarlar", "Yenile"]);
  assertNotContains(settingsViewerTopXml, ["Yeni talepler", "Boş odalar", "Müşteri", "Pansiyon", "Restoran", "Mesajlar", "Demo Aile"]);
  tap(centerOf(findBoundsByText(settingsViewerTopXml, "Ayarlar")));
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
    (xml) => xml.includes("Yönetici") && xml.includes('text="Ayarlar"') && xml.includes('text="Yenile"'),
    12000,
    "Yönetici yetki profili yeniden kurulum olmadan Android arayüzüne uygulanmadı."
  );
  scrollToTop();
  await delay(300);
  topXml = dumpUi("admin-top.xml");
  captureScreenshot("admin-top.png");
  assertContains(topXml, ["Yönetici", "Ayarlar", "Yenile", "Müşteri", "Restoran"]);
  assert.equal(readPreferenceValue("device_id"), deviceId);

  tap(centerOf(findClickableBoundsByText(topXml, "Müşteri")));
  await delay(500);
  const requestsXml = dumpUi("requests.xml");
  captureScreenshot("requests.png");
  assertContains(requestsXml, ["MÜŞTERİ İŞLERİ", "Yeni Talepler", "Cevap Bekleyenler", "Demo Aile"]);

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
  assertContains(queuedXml, ["MÜŞTERİ İŞLERİ", "Müşteri"]);
  assertNotContains(queuedXml, ["Canlı veri çekiliyor", "Canlı veri alındı", "Veriler zaten güncel", "Son yayın:"]);

  tap(centerOf(findClickableBoundsByText(queuedXml, "Pansiyon")));
  await delay(500);
  const pensionXml = dumpUi("pension.xml");
  captureScreenshot("pension.png");
  assertContains(pensionXml, ["PANSİYON", "Konaklama operasyonu", "Rezervasyonlar"]);
  swipe(360, 1080, 360, 350, 420);
  await delay(400);
  const pensionRoomsXml = dumpUi("pension-rooms.xml");
  assertContains(pensionRoomsXml, ["Odalar", "Balkonlu Oda"]);

  tap(centerOf(findClickableBoundsByText(pensionRoomsXml, "Restoran")));
  await delay(500);
  let restaurantXml = dumpUi("restaurant.xml");
  assertContains(restaurantXml, ["RESTORAN", "Servis ve masa yönetimi", "Masalar"]);
  for (let index = 0; index < 4; index += 1) {
    const bounds = findBoundsByTextIfPresent(restaurantXml, "Salon Masası 1");
    if (bounds && bounds.top >= 100 && bounds.bottom <= 1160) {
      break;
    }
    swipe(360, 1080, 360, 380, 420);
    await delay(400);
    restaurantXml = dumpUi("restaurant-scrolled.xml");
  }
  captureScreenshot("restaurant.png");
  assertContains(restaurantXml, ["Salon Masası 1", "Siparişi Aç"]);
  tap(centerOf(findBoundsByText(restaurantXml, "Siparişi Aç")));
  await delay(500);
  let orderXml = dumpUi("table-order.xml");
  captureScreenshot("table-order.png");
  assertContains(orderXml, ["MASA SİPARİŞİ", "Salon Masası 1", "Serpme Kahvaltı", "Aktif adisyon satırları"]);

  for (let index = 0; index < 6 && !orderXml.includes("Ödendi / Kapat"); index += 1) {
    swipe(360, 1080, 360, 300, 420);
    await delay(350);
    orderXml = dumpUi("admin-table-order-scrolled.xml");
  }
  assertContains(orderXml, ["Ödendi / Kapat"]);

  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await delay(300);
  let adminStockXml = "";
  for (let index = 0; index < 12; index += 1) {
    const currentXml = dumpUi(`admin-stock-${index}.xml`);
    adminStockXml += currentXml;
    if (adminStockXml.includes("Stokta olmayanlar")
        && adminStockXml.includes("Azalanlar")
        && adminStockXml.includes("Tüm takip edilen ürünler")
        && adminStockXml.includes("Serpme Kahvaltı")
        && adminStockXml.includes("Fark Gir")) {
      break;
    }
    swipe(360, 1080, 360, 760, 360);
    await delay(300);
  }
  assertContains(adminStockXml, ["Stokta olmayanlar", "Azalanlar", "Tüm takip edilen ürünler", "Ev Limonatası", "Serpme Kahvaltı", "+1 Ekle", "Adedi Ayarla", "Fark Gir"]);
  const restaurantAfterDialog = dumpUi("restaurant-after-dialog.xml");
  tap(centerOf(findClickableBoundsByText(restaurantAfterDialog, "Mesajlar")));
  await delay(500);
  const messagesXml = dumpUi("messages.xml");
  captureScreenshot("messages.png");
  assertContains(messagesXml, ["MESAJLAR", "Hazır cevaplar", "Hazır mesaj"]);

  await restoreEmbeddedConnectionAfterTest();
  console.log("android-device-ui-smoke-ok");
  cleanup();
  await waitForPhoneTestExit();
}

function parseArgs(args) {
  const parsed = {
    holdMs: 300000,
    readyTimeoutMs: 45000,
    settleMs: 1800,
    noBuild: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-build") {
      parsed.noBuild = true;
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
    if (!Number.isInteger(value) || value < 0 || value > 300000) {
      throw new Error(`${name} 0-300000 ms arasında sayısal olmalı.`);
    }
  }

  if (parsed.holdMs < 8000) {
    throw new Error("--hold-ms Android UI smoke için en az 8000 olmalı.");
  }

  return parsed;
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
  adb(["shell", "input", "keyevent", "KEYCODE_MENU"], { allowFailure: true });
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
  adb(["shell", "am", "start", "-n", `${packageName}/${activityName}`]);
  await delay(800);
  const restoredUrl = readPreferenceValue("web_module_url");
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
  const snapshot = JSON.parse(readFileSync(demoSnapshotFile, "utf8"));
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
  const snapshot = JSON.parse(readFileSync(demoSnapshotFile, "utf8"));
  snapshot.androidPermissions = profiles;
  await publishSnapshot(baseUrl, snapshot, label);
}

async function publishSnapshot(baseUrl, snapshot, label) {
  snapshot.updated_at = new Date().toISOString();
  snapshotRevision += 1;
  const response = await fetch(`${baseUrl}/api/sync.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YA-Sync-Secret": syncSecret
    },
    body: JSON.stringify({
      action: "publish_android_snapshot",
      client_id: "android-ui-permission-smoke",
      source_revision: snapshotRevision,
      idempotency_key: `android-ui-permission-smoke-${snapshotRevision}`,
      snapshot
    })
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

async function waitForCachedSnapshotText(text, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (readPreferenceValueIfPresent("operations_cache_v1").includes(text)) {
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

function findBoundsByText(xml, text) {
  const bounds = findBoundsByTextIfPresent(xml, text);
  if (!bounds) {
    throw new Error(`UI node bulunamadı: ${text}`);
  }
  return bounds;
}

function findNotificationGroupExpandBounds(xml, text) {
  const target = findUiNodeByText(xml, text);
  if (!target) {
    return null;
  }
  let ancestor = target.parent;
  while (ancestor) {
    if (ancestor.resourceId === "com.android.systemui:id/expandableNotificationRow") {
      const expandButton = findUiDescendant(
        ancestor,
        (node) => node.resourceId === "android:id/expand_button" && node.clickable
      );
      if (expandButton?.bounds) {
        return expandButton.bounds;
      }
    }
    ancestor = ancestor.parent;
  }
  return null;
}

function findNotificationClickBounds(xml, text) {
  const target = findUiNodeByText(xml, text);
  if (!target) {
    throw new Error(`Bildirim UI node'u bulunamadı: ${text}`);
  }
  let ancestor = target.parent;
  while (ancestor) {
    if (ancestor.resourceId === "com.android.systemui:id/expandableNotificationRow") {
      if (ancestor.clickable && ancestor.bounds) {
        return ancestor.bounds;
      }
      break;
    }
    ancestor = ancestor.parent;
  }
  if (target.bounds) {
    return target.bounds;
  }
  throw new Error(`Bildirim tıklama sınırı bulunamadı: ${text}`);
}

function findUiNodeByText(xml, text) {
  return flattenUiNodes(parseUiNodes(xml)).find((node) => node.text === text) ?? null;
}

function findUiDescendant(node, predicate) {
  for (const child of node.children) {
    if (predicate(child)) {
      return child;
    }
    const nested = findUiDescendant(child, predicate);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function flattenUiNodes(nodes) {
  const flattened = [];
  for (const node of nodes) {
    flattened.push(node, ...flattenUiNodes(node.children));
  }
  return flattened;
}

function parseUiNodes(xml) {
  const roots = [];
  const stack = [];
  const tokens = xml.match(/<node\b[^>]*\/?\s*>|<\/node>/g) ?? [];
  for (const token of tokens) {
    if (token === "</node>") {
      stack.pop();
      continue;
    }
    const node = {
      text: readXmlAttribute(token, "text"),
      resourceId: readXmlAttribute(token, "resource-id"),
      clickable: readXmlAttribute(token, "clickable") === "true",
      bounds: readBounds(token),
      children: [],
      parent: stack.at(-1) ?? null
    };
    if (node.parent) {
      node.parent.children.push(node);
    } else {
      roots.push(node);
    }
    if (!/\/\s*>$/.test(token)) {
      stack.push(node);
    }
  }
  return roots;
}

function readXmlAttribute(node, name) {
  const match = node.match(new RegExp(`${name}="([^"]*)"`));
  return match ? unescapeXmlAttribute(match[1]) : "";
}

function unescapeXmlAttribute(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readBounds(node) {
  const match = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!match) {
    return null;
  }
  return {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4])
  };
}

function findClickableBoundsByText(xml, text) {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  const node = nodes.find((candidate) => candidate.includes(`text="${escapeXmlAttribute(text)}"`)
    && candidate.includes('clickable="true"'));
  const match = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!match) {
    throw new Error(`Tıklanabilir UI node bulunamadı: ${text}`);
  }
  return {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4])
  };
}

function findBoundsByTextIfPresent(xml, text) {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  const node = nodes.find((candidate) => candidate.includes(`text="${escapeXmlAttribute(text)}"`));
  if (!node) {
    return null;
  }

  const match = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!match) {
    return null;
  }

  return {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4])
  };
}

function centerOf(bounds) {
  return {
    x: Math.trunc((bounds.left + bounds.right) / 2),
    y: Math.trunc((bounds.top + bounds.bottom) / 2)
  };
}

function assertContains(xml, texts) {
  const missing = texts.filter((text) => !xml.includes(text));
  if (missing.length > 0) {
    throw new Error(`Android UI beklenen metinleri içermiyor: ${missing.join(", ")}`);
  }
}

function assertNotContains(xml, texts) {
  const present = texts.filter((text) => xml.includes(text));
  if (present.length > 0) {
    throw new Error(`Android UI beklenmeyen metinleri içeriyor: ${present.join(", ")}`);
  }
}

function adb(args, options = {}) {
  const result = spawnSync("adb", args, {
    cwd: repoRoot,
    encoding: options.binary ? null : "utf8",
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

function escapeXmlAttribute(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatOutput(result) {
  return `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`.trim();
}

function cleanup() {
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

    const timeout = setTimeout(resolve, 3000);
    phoneTest.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function stopAndExit(code) {
  cleanup();
  process.exit(code);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
