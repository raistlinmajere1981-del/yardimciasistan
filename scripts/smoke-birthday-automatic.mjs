import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

process.env.TZ = "Europe/Istanbul";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const { BirthdayDeliveryService } = require("../apps/desktop-app/dist-electron/birthday-delivery-service.js");
const { BirthdayScheduler } = require("../apps/desktop-app/dist-electron/birthday-scheduler.js");
const { WhatsAppDeliveryLock } = require("../apps/desktop-app/dist-electron/whatsapp-delivery-adapter.js");

const root = process.cwd();
const fixedDay = "2027-06-18";
const fixedYear = Number(fixedDay.slice(0, 4));
const fixedNow = localDateTime(fixedDay, "11:45");

test("manual mode never auto-sends and manual preparation stays prepared", async () => {
  const fixture = createFixture({ mode: "manual", now: fixedNow });
  try {
    const customerId = saveCustomer(fixture, { birthDate: `1990-${fixedDay.slice(5)}` });
    const adapter = new FakeAdapter();
    const scheduler = createScheduler(fixture, adapter, fixedNow);
    scheduler.start();
    await scheduler.evaluateNow();
    scheduler.stop();
    assert.equal(adapter.calls.length, 0);

    const prepared = fixture.database.prepareBirthdayWhatsApp(customerId, fixedNow);
    assert.equal(prepared.ok, true, prepared.message);
    const delivery = getDelivery(fixture, customerId, fixedYear);
    assert.equal(delivery.status, "prepared");
    assert.equal(delivery.sent_at, "");
  } finally {
    fixture.close();
  }
});

test("automatic mode waits before send time and sends at or after the configured time", async () => {
  const beforeFixture = createFixture({ mode: "automatic", sendTime: "12:00", now: fixedNow });
  try {
    saveCustomer(beforeFixture, { birthDate: `1990-${fixedDay.slice(5)}` });
    const adapter = new FakeAdapter();
    const scheduler = createScheduler(beforeFixture, adapter, fixedNow);
    scheduler.start();
    await scheduler.evaluateNow();
    scheduler.stop();
    assert.equal(adapter.calls.length, 0);
    assert.equal(beforeFixture.database.getAutomaticBirthdayCandidates(fixedNow).length, 0);
  } finally {
    beforeFixture.close();
  }

  const dueFixture = createFixture({ mode: "automatic", sendTime: "10:00", now: fixedNow });
  try {
    saveCustomer(dueFixture, { birthDate: `1990-${fixedDay.slice(5)}` });
    const adapter = new FakeAdapter();
    const scheduler = createScheduler(dueFixture, adapter, fixedNow);
    scheduler.start();
    await scheduler.evaluateNow();
    scheduler.stop();
    assert.equal(adapter.calls.length, 1);
    assert.equal(getDelivery(dueFixture, adapter.calls[0].customerId, fixedYear).status, "sent");
  } finally {
    dueFixture.close();
  }
});

test("same-day catch-up sends after the app opens late, but never carries a birthday into the next day", async () => {
  const fixture = createFixture({ mode: "automatic", sendTime: "10:00", now: localDateTime(fixedDay, "11:45") });
  try {
    const todayCustomer = saveCustomer(fixture, { birthDate: `1990-${fixedDay.slice(5)}` });
    const adapter = new FakeAdapter();
    const scheduler = createScheduler(fixture, adapter, localDateTime(fixedDay, "11:45"));
    scheduler.start();
    await scheduler.evaluateNow();
    scheduler.stop();
    assert.equal(adapter.calls.length, 1);
    assert.equal(adapter.calls[0].customerId, todayCustomer);
  } finally {
    fixture.close();
  }

  const nextDayFixture = createFixture({ mode: "automatic", sendTime: "10:00", now: localDateTime("2027-06-19", "11:45") });
  try {
    saveCustomer(nextDayFixture, { birthDate: `1990-${fixedDay.slice(5)}` });
    const adapter = new FakeAdapter();
    const scheduler = createScheduler(nextDayFixture, adapter, localDateTime("2027-06-19", "11:45"));
    scheduler.start();
    await scheduler.evaluateNow();
    scheduler.stop();
    assert.equal(adapter.calls.length, 0);
  } finally {
    nextDayFixture.close();
  }
});

test("sent status is a hard customer/year duplicate guard across repeated evaluation and restart", async () => {
  const fixture = createFixture({ mode: "automatic", now: fixedNow });
  try {
    const customerId = saveCustomer(fixture, { birthDate: `1990-${fixedDay.slice(5)}` });
    const firstAdapter = new FakeAdapter();
    const firstScheduler = createScheduler(fixture, firstAdapter, fixedNow);
    firstScheduler.start();
    await firstScheduler.evaluateNow();
    await firstScheduler.evaluateNow();
    firstScheduler.stop();
    assert.equal(firstAdapter.calls.length, 1);
    assert.equal(getDelivery(fixture, customerId, fixedYear).status, "sent");
    assert.equal(Number(fixture.raw.prepare("SELECT COUNT(*) AS count FROM birthday_message_deliveries WHERE customer_id = ? AND birthday_year = ?").get(customerId, fixedYear).count), 1);

    const restartAdapter = new FakeAdapter();
    const restartedScheduler = createScheduler(fixture, restartAdapter, fixedNow);
    restartedScheduler.start();
    await restartedScheduler.evaluateNow();
    restartedScheduler.stop();
    assert.equal(restartAdapter.calls.length, 0);
  } finally {
    fixture.close();
  }
});

test("multiple automatic birthdays are delivered sequentially", async () => {
  const fixture = createFixture({ mode: "automatic", now: fixedNow });
  try {
    const firstId = saveCustomer(fixture, { fullName: "Ahmet Bir", phone: "05321234561", birthDate: `1990-${fixedDay.slice(5)}` });
    const secondId = saveCustomer(fixture, { fullName: "Ayşe İki", phone: "05321234562", birthDate: `1991-${fixedDay.slice(5)}` });
    const adapter = new FakeAdapter({ delayMs: 5 });
    const scheduler = createScheduler(fixture, adapter, fixedNow);
    scheduler.start();
    await scheduler.evaluateNow();
    scheduler.stop();
    assert.deepEqual(adapter.calls.map((call) => call.customerId), [firstId, secondId]);
    assert.equal(adapter.maxActive, 1);
    assert.equal(getDelivery(fixture, firstId, fixedYear).status, "sent");
    assert.equal(getDelivery(fixture, secondId, fixedYear).status, "sent");
  } finally {
    fixture.close();
  }
});

test("opt-out is excluded both before queueing and after a queued snapshot becomes stale", async () => {
  const excludedFixture = createFixture({ mode: "automatic", now: fixedNow });
  try {
    saveCustomer(excludedFixture, { birthdayMessageEnabled: false, birthDate: `1990-${fixedDay.slice(5)}` });
    assert.equal(excludedFixture.database.getAutomaticBirthdayCandidates(fixedNow).length, 0);
  } finally {
    excludedFixture.close();
  }

  const staleFixture = createFixture({ mode: "automatic", now: fixedNow });
  try {
    const customerId = saveCustomer(staleFixture, { birthDate: `1990-${fixedDay.slice(5)}` });
    const adapter = new FakeAdapter({ beforeSend: () => {
      staleFixture.raw.prepare("UPDATE customers SET birthday_message_enabled = 0 WHERE id = ?").run(customerId);
    } });
    const candidate = staleFixture.database.getAutomaticBirthdayCandidates(fixedNow).find((item) => item.customerId === customerId);
    assert.ok(candidate);
    const service = new BirthdayDeliveryService(staleFixture.database, adapter);
    const result = await service.deliver(customerId, candidate, fixedNow);
    assert.equal(result.status, "skipped");
    assert.equal(getDelivery(staleFixture, customerId, fixedYear).status, "skipped");
    assert.equal(getDelivery(staleFixture, customerId, fixedYear).sent_at, "");
  } finally {
    staleFixture.close();
  }
});

test("invalid or missing phone numbers never enter the automatic send queue", () => {
  const fixture = createFixture({ mode: "automatic", now: fixedNow });
  try {
    const invalidId = saveCustomer(fixture, { phone: "05321234563", birthDate: `1990-${fixedDay.slice(5)}` });
    const missingId = saveCustomer(fixture, { phone: "", birthDate: `1991-${fixedDay.slice(5)}` });
    fixture.raw.prepare("UPDATE customers SET phone = '123' WHERE id = ?").run(invalidId);
    const overview = fixture.database.getBirthdayOverview(fixedNow);
    assert.equal(overview.candidates.find((item) => item.customerId === invalidId)?.eligibility, "invalid_phone");
    assert.equal(overview.candidates.find((item) => item.customerId === missingId)?.eligibility, "invalid_phone");
    assert.equal(fixture.database.getAutomaticBirthdayCandidates(fixedNow).some((item) => item.customerId === invalidId), false);
    assert.equal(fixture.database.getAutomaticBirthdayCandidates(fixedNow).some((item) => item.customerId === missingId), false);
  } finally {
    fixture.close();
  }
});

test("WhatsApp unavailable or not logged in remains retryable and never becomes sent", async () => {
  const fixture = createFixture({ mode: "automatic", now: fixedNow });
  try {
    const customerId = saveCustomer(fixture, { birthDate: `1990-${fixedDay.slice(5)}` });
    const candidate = fixture.database.getAutomaticBirthdayCandidates(fixedNow).find((item) => item.customerId === customerId);
    assert.ok(candidate);
    const adapter = new FakeAdapter({ available: false });
    const service = new BirthdayDeliveryService(fixture.database, adapter);
    const result = await service.deliver(customerId, candidate, fixedNow);
    assert.equal(result.status, "waiting");
    const waiting = getDelivery(fixture, customerId, fixedYear);
    assert.equal(waiting.status, "pending");
    assert.equal(waiting.sent_at, "");
    assert.ok(waiting.next_attempt_at);

    adapter.available = true;
    adapter.outcomes.push({ kind: "waiting", message: "WhatsApp oturumu açık değil." });
    const loginResult = await service.deliver(customerId, candidate, new Date(fixedNow.getTime() + 61_000));
    assert.equal(loginResult.status, "waiting");
    assert.equal(getDelivery(fixture, customerId, fixedYear).status, "prepared");
    assert.equal(getDelivery(fixture, customerId, fixedYear).error, "WhatsApp oturumu açık değil.");
    assert.equal(getDelivery(fixture, customerId, fixedYear).sent_at, "");
  } finally {
    fixture.close();
  }
});

test("transient driver failures use bounded retry and stop after the third attempt", async () => {
  const fixture = createFixture({ mode: "automatic", now: fixedNow });
  try {
    const customerId = saveCustomer(fixture, { birthDate: `1990-${fixedDay.slice(5)}` });
    const candidate = fixture.database.getAutomaticBirthdayCandidates(fixedNow).find((item) => item.customerId === customerId);
    assert.ok(candidate);
    const adapter = new FakeAdapter({ outcomes: [
      { kind: "failed", retryable: true, message: "driver timeout" },
      { kind: "failed", retryable: true, message: "driver timeout" },
      { kind: "failed", retryable: true, message: "driver timeout" }
    ] });
    const service = new BirthdayDeliveryService(fixture.database, adapter);
    await service.deliver(customerId, candidate, fixedNow);
    await service.deliver(customerId, candidate, new Date(fixedNow.getTime() + 61_000));
    await service.deliver(customerId, candidate, new Date(fixedNow.getTime() + 3 * 61_000));
    const delivery = getDelivery(fixture, customerId, fixedYear);
    assert.equal(adapter.calls.length, 3);
    assert.equal(delivery.status, "failed");
    assert.equal(Number(delivery.attempt_count), 3);
    assert.equal(delivery.next_attempt_at, "");

    const fourth = await service.deliver(customerId, candidate, new Date(fixedNow.getTime() + 10 * 60_000));
    assert.equal(fourth.status, "ignored");
    assert.equal(adapter.calls.length, 3);
  } finally {
    fixture.close();
  }
});

test("successful automatic send stores the rendered current message and sent receipt time", async () => {
  const fixture = createFixture({ mode: "automatic", now: fixedNow, businessName: "Deniz Çiçeği" });
  try {
    const customerId = saveCustomer(fixture, { fullName: "Ayşe Yılmaz", birthDate: `1990-${fixedDay.slice(5)}` });
    const adapter = new FakeAdapter();
    const scheduler = createScheduler(fixture, adapter, fixedNow);
    scheduler.start();
    await scheduler.evaluateNow();
    scheduler.stop();
    assert.equal(adapter.calls[0].message, "Doğum günün kutlu olsun Ayşe Yılmaz! Deniz Çiçeği");
    const delivery = getDelivery(fixture, customerId, fixedYear);
    assert.equal(delivery.status, "sent");
    assert.equal(delivery.message, adapter.calls[0].message);
    assert.ok(delivery.sent_at);
  } finally {
    fixture.close();
  }
});

test("29 February remains 29 February in leap years, 28 February otherwise, never 1 March", () => {
  const fixture = createFixture({ mode: "automatic", sendTime: "00:00", now: localDateTime("2028-02-29", "10:00") });
  try {
    const customerId = saveCustomer(fixture, { birthDate: "2000-02-29" });
    assert.equal(fixture.database.getAutomaticBirthdayCandidates(localDateTime("2028-02-29", "10:00")).some((item) => item.customerId === customerId), true);
    assert.equal(fixture.database.getAutomaticBirthdayCandidates(localDateTime("2027-02-28", "10:00")).some((item) => item.customerId === customerId), true);
    assert.equal(fixture.database.getAutomaticBirthdayCandidates(localDateTime("2027-03-01", "10:00")).some((item) => item.customerId === customerId), false);
  } finally {
    fixture.close();
  }
});

test("scheduler in-flight guard and webview lock prevent automatic/user collisions", async () => {
  const fixture = createFixture({ mode: "automatic", now: fixedNow });
  try {
    saveCustomer(fixture, { birthDate: `1990-${fixedDay.slice(5)}` });
    const adapter = new FakeAdapter({ delayMs: 15 });
    const scheduler = createScheduler(fixture, adapter, fixedNow);
    scheduler.start();
    await Promise.all([scheduler.evaluateNow(), scheduler.evaluateNow(), scheduler.evaluateNow()]);
    scheduler.stop();
    assert.equal(adapter.calls.length, 1);

    const lock = new WhatsAppDeliveryLock();
    lock.setUserBusy(true);
    assert.equal(lock.tryAcquireAutomatic(), null);
    lock.setUserBusy(false);
    const owner = lock.tryAcquireAutomatic();
    assert.ok(owner);
    lock.setUserBusy(true);
    assert.equal(lock.canContinue(owner), false);
    lock.release(owner);
  } finally {
    fixture.close();
  }
});

test("automatic disabled state keeps birthday information without producing candidates", () => {
  const fixture = createFixture({ enabled: false, mode: "automatic", now: fixedNow });
  try {
    saveCustomer(fixture, { birthDate: `1990-${fixedDay.slice(5)}` });
    assert.equal(fixture.database.getAutomaticBirthdayCandidates(fixedNow).length, 0);
    assert.equal(fixture.database.getBirthdayOverview(fixedNow).enabled, false);
  } finally {
    fixture.close();
  }
});

function createFixture({
  enabled = true,
  mode = "automatic",
  sendTime = "10:00",
  template = "Doğum günün kutlu olsun {ad}! {işletme}",
  businessName = "Test İşletmesi",
  now = fixedNow
} = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "yardimci-birthday-automatic-"));
  const database = new DesktopDatabase({
    appPath: join(root, "apps", "desktop-app"),
    userDataPath: dataDir,
    demoProfile: "pension-restaurant"
  });
  database.initialize();
  const raw = new DatabaseSync(database.databasePath);
  raw.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  raw.prepare("UPDATE business SET name = ?, display_name = ?, updated_at = ? WHERE deleted_at = ''").run(businessName, businessName, now.toISOString());
  raw.prepare(`
    UPDATE settings
    SET birthday_enabled = ?, birthday_mode = ?, birthday_send_time = ?, birthday_message_template = ?, updated_at = ?
    WHERE deleted_at = ''
  `).run(enabled ? 1 : 0, mode, sendTime, template, now.toISOString());

  return {
    database,
    raw,
    close() {
      raw.close();
      database.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

function saveCustomer(fixture, overrides = {}) {
  const result = fixture.database.saveCustomer({
    fullName: "Birthday Test Customer",
    phone: "05321234560",
    email: "",
    notes: "",
    tags: [],
    identityType: "",
    identityNumber: "",
    nationality: "",
    birthDate: `1990-${fixedDay.slice(5)}`,
    birthdayMessageEnabled: true,
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

function getDelivery(fixture, customerId, year) {
  return fixture.raw.prepare(`
    SELECT status, message, sent_at, next_attempt_at, attempt_count, error
    FROM birthday_message_deliveries
    WHERE customer_id = ? AND birthday_year = ?
  `).get(customerId, year);
}

function createScheduler(fixture, adapter, now) {
  const service = new BirthdayDeliveryService(fixture.database, adapter);
  return new BirthdayScheduler({
    database: fixture.database,
    deliveryService: service,
    isWhatsAppEnabled: () => true,
    now: () => now,
    intervalMs: 30_000,
    interMessageDelayMs: 0
  });
}

class FakeAdapter {
  calls = [];
  active = 0;
  maxActive = 0;
  available;
  delayMs;
  outcomes;
  beforeSendHook;

  constructor({ available = true, delayMs = 0, outcomes = [], beforeSend } = {}) {
    this.available = available;
    this.delayMs = delayMs;
    this.outcomes = [...outcomes];
    this.beforeSendHook = beforeSend;
  }

  isAvailable() {
    return this.available;
  }

  async send(input, hooks) {
    this.calls.push({ ...input });
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      if (this.delayMs) await delay(this.delayMs);
      hooks.onPrepared();
      this.beforeSendHook?.();
      const approval = hooks.beforeSend();
      if (!approval.ok) {
        return { ok: false, kind: approval.kind, retryable: approval.kind === "waiting", message: approval.message };
      }
      const outcome = this.outcomes.shift() ?? { kind: "sent" };
      if (outcome.kind === "waiting") {
        return { ok: false, kind: "waiting", retryable: true, message: outcome.message };
      }
      if (outcome.kind === "failed") {
        return { ok: false, kind: "failed", retryable: outcome.retryable !== false, message: outcome.message };
      }
      return { ok: true, message: "Fake WhatsApp gönderimi doğrulandı." };
    } finally {
      this.active -= 1;
    }
  }
}

function localDateTime(date, time) {
  return new Date(`${date}T${time}:00+03:00`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test.after(() => {
  console.log("birthday-automatic-smoke: scheduler, catch-up, retry, duplicate, fresh-data, driver boundary and webview lock scenarios executed");
});
