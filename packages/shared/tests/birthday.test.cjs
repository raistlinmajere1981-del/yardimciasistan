const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_BIRTHDAY_MESSAGE_TEMPLATE,
  DEFAULT_BIRTHDAY_SETTINGS,
  evaluateBirthdayCustomer,
  getLocalIsoDate,
  isBirthdayOnDate,
  normalizeBirthdaySettings,
  renderBirthdayMessage,
  validateBirthdayMessageTemplate
} = require("../dist/index.js");

function customer(overrides = {}) {
  return {
    id: "customer_birthday_test",
    fullName: "Ayşe Yılmaz",
    phone: "+905321234567",
    birthDate: "1990-06-18",
    birthdayMessageEnabled: true,
    ...overrides
  };
}

test("birthday settings use the requested defaults", () => {
  assert.deepEqual(normalizeBirthdaySettings(), DEFAULT_BIRTHDAY_SETTINGS);
  assert.equal(DEFAULT_BIRTHDAY_SETTINGS.enabled, true);
  assert.equal(DEFAULT_BIRTHDAY_SETTINGS.mode, "manual");
  assert.equal(DEFAULT_BIRTHDAY_SETTINGS.sendTime, "10:00");
  assert.equal(DEFAULT_BIRTHDAY_SETTINGS.messageTemplate, DEFAULT_BIRTHDAY_MESSAGE_TEMPLATE);
});

test("local birthday date does not use UTC conversion", () => {
  const localLateNight = new Date(2026, 5, 18, 23, 59, 0);
  assert.equal(getLocalIsoDate(localLateNight), "2026-06-18");
  assert.equal(isBirthdayOnDate("1990-06-18", "2026-06-18"), true);
  assert.equal(isBirthdayOnDate("1990-06-18", "2026-06-19"), false);
});

test("opt-out and invalid birth dates are excluded", () => {
  assert.equal(evaluateBirthdayCustomer(customer({ birthdayMessageEnabled: false }), "2026-06-18").status, "excluded");
  assert.equal(evaluateBirthdayCustomer(customer({ birthDate: "" }), "2026-06-18").status, "invalid_birth_date");
  assert.equal(evaluateBirthdayCustomer(customer({ birthDate: "1990-02-30" }), "2026-06-18").status, "invalid_birth_date");
});

test("today's birthday is due and another date is not", () => {
  assert.equal(evaluateBirthdayCustomer(customer(), "2026-06-18").status, "due");
  assert.equal(evaluateBirthdayCustomer(customer(), "2026-06-19").status, "not_birthday");
});

test("29 February birthdays move to 28 February only in non-leap years", () => {
  const leapDayCustomer = customer({ birthDate: "2000-02-29" });
  assert.equal(isBirthdayOnDate(leapDayCustomer.birthDate, "2028-02-29"), true);
  assert.equal(isBirthdayOnDate(leapDayCustomer.birthDate, "2027-02-28"), true);
  assert.equal(isBirthdayOnDate(leapDayCustomer.birthDate, "2027-03-01"), false);
  assert.equal(evaluateBirthdayCustomer(leapDayCustomer, "2028-02-29").status, "due");
  assert.equal(evaluateBirthdayCustomer(leapDayCustomer, "2027-02-28").status, "due");
});

test("phone eligibility distinguishes valid and missing phones", () => {
  assert.equal(evaluateBirthdayCustomer(customer(), "2026-06-18").status, "due");
  assert.equal(evaluateBirthdayCustomer(customer({ phone: "" }), "2026-06-18").status, "invalid_phone");
  assert.equal(evaluateBirthdayCustomer(customer({ phone: "02121234567" }), "2026-06-18").status, "invalid_phone");
});

test("sent and prepared delivery statuses stay distinct", () => {
  assert.equal(
    evaluateBirthdayCustomer(customer(), "2026-06-18", { customerId: customer().id, birthdayYear: 2026, status: "prepared" }).status,
    "prepared"
  );
  assert.equal(
    evaluateBirthdayCustomer(customer(), "2026-06-18", { customerId: customer().id, birthdayYear: 2026, status: "sent" }).status,
    "already_sent"
  );
});

test("birthday renderer replaces only supported placeholders", () => {
  assert.equal(
    renderBirthdayMessage("Merhaba {ad}, {işletme} sizinle.", { fullName: " Ayşe Yılmaz " }, " Deniz Çiçeği "),
    "Merhaba Ayşe Yılmaz, Deniz Çiçeği sizinle."
  );
  assert.equal(renderBirthdayMessage("Merhaba {ad}, {işletme}.", {}, ""), "Merhaba Müşterimiz, işletmemiz.");
  assert.equal(validateBirthdayMessageTemplate(""), "Doğum günü mesajı boş bırakılamaz.");
  assert.equal(validateBirthdayMessageTemplate("{soyad}"), "Doğum günü mesajında yalnızca {ad} ve {işletme} kullanılabilir.");
  assert.equal(validateBirthdayMessageTemplate("Merhaba {ad}"), null);
});
