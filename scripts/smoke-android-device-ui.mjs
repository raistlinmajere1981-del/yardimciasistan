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
const stockGalleryFixture = join(repoRoot, "firm-template", "web-module", "assets", "yardimci-asistan-symbol.png");
const stockGalleryDeviceFile = "/sdcard/Download/yardimci-stock-image-smoke.png";
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
  prepareStockGalleryFixture();

  phoneTest = startPhoneTest();
  await waitForReady(phoneTest, options.readyTimeoutMs);
  const baseUrl = getPhoneTestBaseUrl(phoneTest.output);
  uiTestBaseUrl = baseUrl;
  prepareAppForUi(baseUrl);
  await delay(options.settleMs);
  await waitForUiText("Öncelikli işler", 12000);
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
  assertContains(staffSettingsXml, ["Ayarlar", "Görünüm", "Tema", "Gece Modu", 'content-desc="Gündüz moduna geç"', "Bildirim tercihleri", "Restoran / Masa", "Oda / Günlük İş", "İşlem hataları"]);
  assertNotContains(staffSettingsXml, ["Bildirimler", "Sync bağlantısı", "Bağlantı özeti", "Güvenlik anahtarı", syncSecret]);
  adb(["shell", "input", "keyevent", "KEYCODE_BACK"]);
  await delay(300);

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
    (xml) => xml.includes("Personel") && xml.includes('text="Pansiyon"') && xml.includes('content-desc="Ayarlar"'),
    12000,
    "Daha önce çözülmüş personel profili eksik snapshot sonrasında korunmadı."
  );
  assert.equal(readPreferenceValue("device_id"), deviceId);

  topXml = dumpUi("staff-after-profile-gap.xml");
  tap(centerOf(findClickableBoundsByText(topXml, "Pansiyon")));
  await delay(400);
  const staffPensionRoomsXml = dumpUi("staff-pension-rooms.xml");
  assertContains(staffPensionRoomsXml, ["Odalar", "İşler", "Balkonlu Oda", "Temizlik", "Durumu Değiştir"]);
  assertNotContains(staffPensionRoomsXml, ["Oda 101 giriş hazırlığı", "Tamamla", "Rezervasyonlar"]);
  tap(centerOf(findClickableBoundsByText(staffPensionRoomsXml, "İşler")));
  const staffPensionTasksXml = await waitForUiCondition(
    (xml) => xml.includes("Oda 101 giriş hazırlığı") && xml.includes("Bahçe servis kontrolü"),
    5000,
    "Personel günlük iş modu açılmadı."
  );
  writeFileSync(join(artifactDir, "staff-pension-tasks.xml"), staffPensionTasksXml);
  assertContains(staffPensionTasksXml, ["Oda 101 giriş hazırlığı", "Bahçe servis kontrolü", "Tamamla"]);
  assertNotContains(staffPensionTasksXml, ["Balkonlu Oda", "Aile Odası"]);

  tap(centerOf(findClickableBoundsByText(staffPensionTasksXml, "Restoran")));
  await delay(500);

  let staffRestaurantXml = dumpUi("staff-restaurant.xml");
  assertContains(staffRestaurantXml, ["Masalar", "Açık Adisyon", "Stok", "Salon Masası 1", "Siparişi Aç"]);
  assertNotContains(staffRestaurantXml, ["Ev Limonatası", "Aktif adisyonlar"]);
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
    swipe(360, 1080, 360, 760, 360);
    await delay(300);
  }
  assertContains(staffStockXml, ["Stokta yok", "Az stok", "Tüm takip edilen ürünler", "Ev Limonatası", "Serpme Kahvaltı"]);
  assertNotContains(staffStockXml, ["AI DESTEKLİ STOK GİRİŞİ", "Kamera ile çek", "Galeriden seç", "Stok Güncelle", "+1 Ekle", "Adedi Ayarla", "Fark Gir"]);

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
    (xml) => xml.includes('text="Müşteri"') && xml.includes("Yeni Talepler") && xml.includes(notificationClickCustomer),
    12000,
    "Müşteri bildirimine dokununca Yeni Talepler modu açılmadı."
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
  assertContains(pensionXml, ["Pansiyon", "Rezervasyonlar", "Odalar", "İşler", "Demo Aile", 'text="Bekleyen 1"', 'text="Giriş 0"', 'text="Çıkış 0"']);
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
  tap(centerOf(findClickableBoundsByText(pensionRoomsXml, "İşler")));
  const pensionTasksXml = await waitForUiCondition(
    (xml) => xml.includes("Oda 101 giriş hazırlığı") && xml.includes("Bahçe servis kontrolü"),
    5000,
    "Yönetici günlük iş modu açılmadı."
  );
  writeFileSync(join(artifactDir, "pension-tasks.xml"), pensionTasksXml);
  assertContains(pensionTasksXml, ["İşler", "Oda 101 giriş hazırlığı", "Bahçe servis kontrolü"]);
  assertNotContains(pensionTasksXml, ["Balkonlu Oda", "Demo Aile"]);

  tap(centerOf(findClickableBoundsByText(pensionTasksXml, "Restoran")));
  await delay(500);
  const restaurantXml = dumpUi("restaurant.xml");
  assertContains(restaurantXml, ["Restoran", "Masalar", "Açık Adisyon", "Stok", "Salon Masası 1", "Siparişi Aç", 'text="Boş 1"', 'text="Dolu 1"', 'text="Hesap 0"', 'text="Açık 1"']);
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
  const restaurantAfterDialog = dumpUi("restaurant-after-dialog.xml");
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
  let stockUpdateAfterSourcesXml = "";
  for (let index = 0; index < 8; index += 1) {
    const currentXml = dumpUi(`admin-stock-update-after-sources-${index}.xml`);
    if (currentXml.includes("Stok Güncelle")) {
      stockUpdateAfterSourcesXml = currentXml;
      break;
    }
    swipe(360, 1080, 360, 760, 360);
    await delay(300);
  }
  assertContains(stockUpdateAfterSourcesXml, ["Stok Güncelle"]);
  tap(centerOf(findBoundsByText(stockUpdateAfterSourcesXml, "Stok Güncelle")));
  await delay(300);
  const stockActionsXml = dumpUi("admin-stock-actions.xml");
  assertContains(stockActionsXml, ["STOK GÜNCELLE", "+1 Ekle", "Adedi Ayarla", "Fark Gir"]);
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
    stockImageOnly: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-build") {
      parsed.noBuild = true;
    } else if (arg === "--stock-image-only") {
      parsed.stockImageOnly = true;
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

  return parsed;
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
  const restaurantXml = await waitForUiCondition(
    (xml) => xml.includes("Masalar") && xml.includes("Açık Adisyon") && xml.includes('text="Stok"'),
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
  prepareSystemCameraForUiTest();
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
  adb(["shell", "am", "start", "-n", `${packageName}/${activityName}`]);
  const startedAt = Date.now();
  let restoredUrl = readPreferenceValue("web_module_url");
  while (restoredUrl === uiTestBaseUrl && Date.now() - startedAt < 8000) {
    await delay(250);
    restoredUrl = readPreferenceValue("web_module_url");
  }
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

function findBoundsByText(xml, text) {
  const bounds = findBoundsByTextIfPresent(xml, text);
  if (!bounds) {
    throw new Error(`UI node bulunamadı: ${text}`);
  }
  return bounds;
}

function findBoundsByResourceId(xml, resourceId) {
  const node = flattenUiNodes(parseUiNodes(xml)).find((candidate) => candidate.resourceId === resourceId);
  if (!node?.bounds) {
    throw new Error(`UI resource node bulunamadı: ${resourceId}`);
  }
  return node.bounds;
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

function findClickableBoundsByDescription(xml, description) {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  const node = nodes.find((candidate) => candidate.includes(`content-desc="${escapeXmlAttribute(description)}"`)
    && candidate.includes('clickable="true"'));
  const match = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!match) {
    throw new Error(`Tıklanabilir açıklamalı UI node bulunamadı: ${description}`);
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

function findBoundsByContentDescriptionPrefix(xml, prefix) {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  const escapedPrefix = escapeXmlAttribute(prefix);
  const node = nodes.find((candidate) => candidate.includes(`content-desc="${escapedPrefix}`));
  const match = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
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

function assertCounterStripFits(xml, labels) {
  const bounds = labels.map((label) => findBoundsByText(xml, label));
  const firstTop = bounds[0].top;
  assert.ok(bounds.every((item) => Math.abs(item.top - firstTop) <= 2), "Sayaç chip'leri tek satırda değil.");
  assert.ok(bounds.every((item) => item.left >= 20 && item.right <= 680 && item.right > item.left), "Sayaç chip satırı yatay görünüm sınırını aşıyor.");
}

function assertSquareTouchTarget(xml, description) {
  const bounds = findClickableBoundsByDescription(xml, description);
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  assert.ok(width >= 84 && width <= 100, `${description} ikon genişliği 44–48dp aralığında değil: ${width}px`);
  assert.ok(height >= 84 && height <= 100, `${description} ikon yüksekliği 44–48dp aralığında değil: ${height}px`);
  assert.ok(Math.abs(width - height) <= 2, `${description} ikon butonu kare değil: ${width}x${height}px`);
}

function assertIconOnly(xml, description) {
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  const node = nodes.find((candidate) => candidate.includes(`content-desc="${escapeXmlAttribute(description)}"`)
    && candidate.includes('clickable="true"'));
  assert.ok(node, `${description} ikon butonu bulunamadı.`);
  const text = node.match(/\btext="([^"]*)"/)?.[1] ?? "";
  assert.equal(text, "", `${description} tema butonunda görünür metin var: ${text}`);
  assert.ok(node.includes('class="android.widget.ImageButton"'), `${description} vektör ikon butonu değil.`);
}

function assertHeaderActionOrder(xml, themeDescription) {
  const refresh = findClickableBoundsByDescription(xml, "Yenile");
  const theme = findClickableBoundsByDescription(xml, themeDescription);
  const settings = findClickableBoundsByDescription(xml, "Ayarlar");
  assert.ok(refresh.right <= theme.left, "Tema butonu Yenile butonunun sağında değil.");
  assert.ok(theme.right <= settings.left, "Tema butonu Ayarlar butonunun solunda değil.");
}

function assertBottomNavClearance(xml, contentText, navText, minimumPixels) {
  const contentBounds = findBoundsByText(xml, contentText);
  const navBounds = findClickableBoundsByText(xml, navText);
  const clearance = navBounds.top - contentBounds.bottom;
  assert.ok(clearance >= minimumPixels, `Son içerik bottom nav'a fazla yakın: ${clearance}px (${contentText})`);
}

function assertOrderActionGrid(xml, includePaid) {
  const preparing = findBoundsByText(xml, "Hazırlanıyor");
  const served = findBoundsByText(xml, "Servis Edildi");
  const payment = findBoundsByText(xml, "Hesap Bekliyor");
  const actions = [preparing, served, payment];
  let paid = null;
  if (includePaid) {
    paid = findBoundsByText(xml, "Ödendi / Kapat");
    actions.push(paid);
  }
  assert.ok(actions.every((item) => item.left >= 20 && item.right <= 700 && item.right > item.left), "Sipariş alt aksiyonları ekran sınırını aşıyor.");
  assert.ok(Math.abs(preparing.top - served.top) <= 2, "Hazırlanıyor ve Servis Edildi aynı üst satırda değil.");
  assert.ok(payment.top > preparing.bottom, "Hesap Bekliyor alt aksiyon satırına taşınmadı.");
  if (paid) {
    assert.ok(Math.abs(payment.top - paid.top) <= 2, "Hesap Bekliyor ve Ödendi / Kapat aynı alt satırda değil.");
  }
}

function assertNodeHeightAtMost(xml, text, maximumPixels) {
  const bounds = findBoundsByText(xml, text);
  const height = bounds.bottom - bounds.top;
  assert.ok(height <= maximumPixels, `Kart önizlemesi gereğinden yüksek: ${height}px (${text})`);
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
  adb(["shell", "rm", "-f", stockGalleryDeviceFile], { allowFailure: true });
  adb(["shell", "am", "force-stop", "com.android.documentsui"], { allowFailure: true });
  if (focusedPackage() === "net.sourceforge.opencamera") {
    adb(["shell", "input", "keyevent", "KEYCODE_BACK"], { allowFailure: true });
  }
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
