import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const shared = require("@yardimci-asistan/shared");
const { BUSINESS_CAPABILITIES: C, getLocalIsoDate } = shared;
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { setBusinessCapability } = require("../apps/desktop-app/dist-electron/business-capability-store.js");

const root = process.cwd();
const dataDir = mkdtempSync(join(tmpdir(), "yardimci-birthday-foundation-"));
const database = new DesktopDatabase({
  appPath: join(root, "apps", "desktop-app"),
  userDataPath: dataDir,
  demoProfile: "pension-restaurant"
});

try {
  database.initialize();
  const raw = new DatabaseSync(database.databasePath);
  raw.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

  try {
    const customerColumns = raw.prepare("PRAGMA table_info(customers)").all().map((row) => row.name);
    assert.ok(customerColumns.includes("birth_date"));
    assert.ok(customerColumns.includes("birthday_message_enabled"));
    assert.equal(customerColumns.filter((column) => column === "birth_date").length, 1);
    assert.ok(!customerColumns.includes("birthday_date"));

    const settingsColumns = raw.prepare("PRAGMA table_info(settings)").all().map((row) => row.name);
    for (const column of ["birthday_enabled", "birthday_mode", "birthday_send_time", "birthday_message_template"]) {
      assert.ok(settingsColumns.includes(column), `missing settings column: ${column}`);
    }
    const deliveryColumns = raw.prepare("PRAGMA table_info(birthday_message_deliveries)").all().map((row) => row.name);
    for (const column of ["customer_id", "birthday_year", "birthday_date", "mode", "message", "status", "attempt_count", "last_attempted_at", "next_attempt_at", "prepared_at", "sent_at", "failed_at", "error"]) {
      assert.ok(deliveryColumns.includes(column), `missing delivery column: ${column}`);
    }
    assert.equal(String(raw.prepare("PRAGMA integrity_check").get().integrity_check), "ok");

    const today = getLocalIsoDate(new Date());
    const otherDate = today.slice(5) === "01-01" ? "1990-01-02" : "1990-01-01";
    const todayCustomer = saveCustomer({
      fullName: "Bugün Doğan Müşteri",
      phone: "+905321234567",
      birthDate: `1990-${today.slice(5)}`
    });
    const defaultRow = raw.prepare("SELECT birthday_message_enabled FROM customers WHERE id = ?").get(todayCustomer);
    assert.equal(Number(defaultRow.birthday_message_enabled), 1);
    assert.equal(database.getDashboardData().customers.find((customer) => customer.id === todayCustomer).birthdayMessageEnabled, true);

    const optedOutCustomer = saveCustomer({
      fullName: "Mesaj İstemeyen Müşteri",
      phone: "+905321234568",
      birthDate: `1990-${today.slice(5)}`,
      birthdayMessageEnabled: false
    });
    assert.equal(database.getDashboardData().customers.find((customer) => customer.id === optedOutCustomer).birthdayMessageEnabled, false);
    assert.equal(Number(raw.prepare("SELECT birthday_message_enabled FROM customers WHERE id = ?").get(optedOutCustomer).birthday_message_enabled), 0);

    saveCustomer({ fullName: "Bugün Değil", phone: "+905321234569", birthDate: otherDate });
    saveCustomer({ fullName: "Doğum Tarihi Eksik", phone: "+905321234570", birthDate: "" });
    const invalidPhoneCustomer = saveCustomer({ fullName: "Telefonu Eksik", phone: "", birthDate: `1990-${today.slice(5)}` });
    raw.prepare("UPDATE customers SET phone = '123' WHERE id = ?").run(invalidPhoneCustomer);
    const deletedCustomer = saveCustomer({ fullName: "Silinmiş Doğum Günü", phone: "+905321234571", birthDate: `1990-${today.slice(5)}` });
    assert.equal(database.deleteCustomer(deletedCustomer).ok, true);

    const initialOverview = database.getBirthdayOverview();
    assert.equal(initialOverview.today, today);
    assert.ok(initialOverview.candidates.some((candidate) => candidate.customerId === todayCustomer));
    assert.ok(initialOverview.candidates.some((candidate) => candidate.customerId === invalidPhoneCustomer && candidate.eligibility === "invalid_phone"));
    assert.ok(!initialOverview.candidates.some((candidate) => candidate.customerId === optedOutCustomer));
    assert.ok(!initialOverview.candidates.some((candidate) => candidate.customerId === deletedCustomer));
    assert.ok(!initialOverview.candidates.some((candidate) => candidate.customerName === "Bugün Değil"));
    assert.ok(!initialOverview.candidates.some((candidate) => candidate.customerName === "Doğum Tarihi Eksik"));

    const initialSettings = database.getSetupData().birthdaySettings;
    assert.equal(initialSettings.enabled, true);
    assert.equal(initialSettings.mode, "manual");
    assert.equal(initialSettings.sendTime, "10:00");

    const savedSetup = database.saveInitialSetup({
      businessName: "Doğum Günü İşletmesi",
      profileId: "pension_restaurant",
      phone: "+905321234567",
      whatsapp: "+905321234567",
      email: "",
      address: "",
      webModuleUrl: "https://example.test/yardimci-asistan",
      syncSecret: "birthday-foundation-secret-123",
      autoSyncEnabled: true,
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
      servicePreferences: { whatsapp: true, android: false },
      initialCounts: { rooms: 0, tables: 0 },
      tableCategories: [],
      birthdaySettings: {
        enabled: true,
        mode: "automatic",
        sendTime: "09:30",
        messageTemplate: "İyi ki doğdun {ad}! {işletme} ekibi"
      }
    });
    assert.equal(savedSetup.ok, true, savedSetup.message);
    assert.deepEqual(database.getSetupData().birthdaySettings, {
      enabled: true,
      mode: "automatic",
      sendTime: "09:30",
      messageTemplate: "İyi ki doğdun {ad}! {işletme} ekibi"
    });

    const firstPrepare = database.prepareBirthdayWhatsApp(todayCustomer);
    assert.equal(firstPrepare.ok, true, firstPrepare.message);
    assert.equal(firstPrepare.action.ok, true);
    assert.equal(firstPrepare.action.mode, "webview");
    assert.match(firstPrepare.candidate.message, /Bugün Doğan Müşteri/);
    assert.match(firstPrepare.candidate.message, /Doğum Günü İşletmesi/);
    const preparedRow = raw.prepare("SELECT status, mode, message, sent_at FROM birthday_message_deliveries WHERE customer_id = ? AND birthday_year = ?").get(todayCustomer, Number(today.slice(0, 4)));
    assert.equal(preparedRow.status, "prepared");
    assert.equal(preparedRow.mode, "automatic");
    assert.equal(preparedRow.sent_at, "");

    const secondPrepare = database.prepareBirthdayWhatsApp(todayCustomer);
    assert.equal(secondPrepare.ok, true, secondPrepare.message);
    const deliveryCount = raw
      .prepare("SELECT COUNT(*) AS count FROM birthday_message_deliveries WHERE customer_id = ? AND birthday_year = ?")
      .get(todayCustomer, Number(today.slice(0, 4))).count;
    assert.equal(Number(deliveryCount), 1);

    raw.prepare("UPDATE birthday_message_deliveries SET status = 'sent', sent_at = '2030-01-01T10:00:00.000Z' WHERE customer_id = ? AND birthday_year = ?").run(todayCustomer, Number(today.slice(0, 4)));
    const sentOverview = database.getBirthdayOverview();
    assert.equal(sentOverview.candidates.find((candidate) => candidate.customerId === todayCustomer)?.eligibility, "already_sent");
    const duplicateAfterSent = database.prepareBirthdayWhatsApp(todayCustomer);
    assert.equal(duplicateAfterSent.ok, false);
    assert.equal(duplicateAfterSent.code, "already_sent");

    setBusinessCapability(database.databasePath, { capability: C.WHATSAPP, enabled: false });
    const whatsappDisabledOverview = database.getDashboardData().birthdayOverview;
    assert.ok(whatsappDisabledOverview.candidates.some((candidate) => candidate.customerId === todayCustomer));
    assert.ok(whatsappDisabledOverview.candidates.some((candidate) => candidate.customerId === invalidPhoneCustomer));
  } finally {
    raw.close();
  }

  console.log("birthday-foundation-smoke-ok: clean schema, customer default/opt-out, local date, phone eligibility, settings persistence, prepared delivery uniqueness, sent guard and WhatsApp capability separation verified");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}

function saveCustomer(overrides) {
  const result = database.saveCustomer({
    fullName: "Birthday Smoke Customer",
    phone: "",
    email: "",
    notes: "",
    tags: [],
    identityType: "",
    identityNumber: "",
    nationality: "",
    birthDate: "",
    gender: "",
    documentSerialNumber: "",
    documentExpiryDate: "",
    birthPlace: "",
    motherName: "",
    fatherName: "",
    issuingAuthority: "",
    address: "",
    ...overrides
  });
  assert.equal(result.ok, true, result.message);
  return result.savedId;
}
