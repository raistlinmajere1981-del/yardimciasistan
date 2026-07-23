import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const {
  createAppPasswordVerifier,
  secureTextEqual,
  validateAppPassword,
  verifyAppPassword
} = require("../apps/desktop-app/dist-electron/app-lock.js");

const dataDir = mkdtempSync(join(tmpdir(), "yardimci-asistan-app-lock-"));
const database = new DesktopDatabase({
  appPath: join(process.cwd(), "apps", "desktop-app"),
  userDataPath: dataDir
});

try {
  database.initialize();
  assert.equal(database.getSetupData().appPasswordConfigured, false);
  assert.equal(database.getAppLockPasswordVerifier(), "");
  assert.equal(Number.isInteger(database.getAppLockNotificationCount()), true);
  assert.equal(database.getAppLockNotificationCount() >= 0, true);

  assert.match(validateAppPassword("123"), /en az 6 karakter/i);
  assert.equal(validateAppPassword("güvenli-şifre"), null);

  const password = "İşletme-Şifresi-42";
  const verifier = await createAppPasswordVerifier(password);
  assert.match(verifier, /^ya-lock:v1:/);
  assert.equal(verifier.includes(password), false, "Plain password must never be stored in its verifier.");
  assert.equal(await verifyAppPassword(password, verifier), true);
  assert.equal(await verifyAppPassword("yanlış-şifre", verifier), false);
  assert.equal(await verifyAppPassword(password, "bozuk-kayıt"), false);

  database.setAppLockPasswordVerifier(verifier);
  assert.equal(database.getSetupData().appPasswordConfigured, true);
  assert.equal(database.getAppLockPasswordVerifier(), verifier);

  assert.equal(secureTextEqual("web-güvenlik-anahtarı", "web-güvenlik-anahtarı"), true);
  assert.equal(secureTextEqual("web-güvenlik-anahtarı", "yanlış-anahtar"), false);
  assert.equal(secureTextEqual("kısa", "daha-uzun"), false);

  database.setAppLockPasswordVerifier("");
  assert.equal(database.getSetupData().appPasswordConfigured, false);
  assert.equal(database.getAppLockPasswordVerifier(), "");

  console.log("app-lock-smoke-ok");
} finally {
  database.close();
  rmSync(dataDir, { recursive: true, force: true });
}
