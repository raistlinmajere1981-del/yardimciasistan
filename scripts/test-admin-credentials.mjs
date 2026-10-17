import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  getCredentialForClipboard,
  getInstallationCredentials,
  saveInstallationCredential
} from "../apps/admin-control-center/dist-electron/electron/services/credentials-service.js";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

test("installation credentials are scoped by credentialRef and create the local file on first save", () => {
  const root = mkdtempSync(join(tmpdir(), "admin-credentials-"));
  const config = join(root, "config");
  mkdirSync(config);
  writeFileSync(join(config, "installations.json"), JSON.stringify({
    installations: { blacksea: { credentialRef: "blacksea-natro" }, site: { credentialRef: "local-site" }, noRef: {} }
  }));

  try {
    assert.deepEqual(getInstallationCredentials(root, "blacksea"), { ref: "blacksea-natro", fields: {} });
    assert.equal(saveInstallationCredential(root, "blacksea", "syncSecret", "test-secret-value").ok, true);
    assert.equal(saveInstallationCredential(root, "blacksea", "ftpUser", "deploy-user").ok, false);
    assert.equal(saveInstallationCredential(root, "site", "syncSecret", "not-allowed").ok, false);
    assert.equal(saveInstallationCredential(root, "noRef", "ftpUser", "ignored").ok, false);
    assert.equal(saveInstallationCredential(root, "blacksea", "unexpected", "ignored").ok, false);

    const stored = JSON.parse(readFileSync(join(config, "credentials.local.json"), "utf8"));
    assert.equal(stored.credentials["blacksea-natro"].syncSecret, "test-secret-value");
    assert.equal(stored.credentials["blacksea-natro"].ftpUser, undefined);
    assert.equal(getCredentialForClipboard(root, "blacksea", "syncSecret"), "test-secret-value");
    assert.deepEqual(getInstallationCredentials(root, "blacksea").fields, { syncSecret: "test-secret-value" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("local secret values are absent from overview and system environment contracts", () => {
  const overviewSource = readFileSync(join(repoRoot, "apps/admin-control-center/electron/services/overview-service.ts"), "utf8");
  const environmentSource = readFileSync(join(repoRoot, "apps/admin-control-center/electron/services/system-environment-service.ts"), "utf8");
  assert.match(overviewSource, /credentialStatus/);
  assert.match(environmentSource, /getCredentialSnapshots/);
  assert.doesNotMatch(overviewSource, /syncSecret|ftpPassword|sshIdentityFile/);
  assert.doesNotMatch(environmentSource, /syncSecret|ftpPassword/);
  assert.match(environmentSource, /systemManaged/);
  assert.match(environmentSource, /usedBy: installations\.map/);
});

test("canlı SSH anahtarı doğru tenant kaydına eşitlenir ve anahtar değişiminde yenilenir", async () => {
  const { syncInstallationCredential } = await import("../apps/admin-control-center/dist-electron/electron/services/credentials-service.js");
  const root = mkdtempSync(join(tmpdir(), "admin-secret-tenant-"));
  const config = join(root, "config");
  mkdirSync(config);
  writeFileSync(join(config, "installations.json"), JSON.stringify({
    installations: {
      ya: { id: "ya", credentialRef: "main-ref", webModuleUrl: "https://example.invalid/module" },
      pilot: { id: "pilot", credentialRef: "pilot-ref", webModuleUrl: "https://pilot.invalid/module" }
    }
  }));
  try {
    let value = "live-test-secret-value-00001";
    const reader = async () => ({ value, source: "ssh", verifiedLive: true });
    let result = await syncInstallationCredential(root, "pilot", reader);
    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.equal(result.verifiedLive, true);
    assert.equal(getInstallationCredentials(root, "pilot").fields.syncSecret, value);
    assert.equal(getInstallationCredentials(root, "ya").fields.syncSecret, undefined);
    assert.equal(result.message.includes(value), false);
    assert.equal(result.changed, true);

    result = await syncInstallationCredential(root, "pilot", reader);
    assert.equal(result.ok, true);
    assert.equal(result.changed, false);
    value = "live-test-secret-value-00002";
    result = await syncInstallationCredential(root, "pilot", reader);
    assert.equal(result.changed, true);
    assert.equal(getCredentialForClipboard(root, "pilot", "syncSecret"), value);

    const invalid = await syncInstallationCredential(root, "pilot", async () => ({
      value: "invalid", source: "ssh", verifiedLive: true
    }));
    assert.equal(invalid.ok, false);
    assert.equal(getCredentialForClipboard(root, "pilot", "syncSecret"), value);
    assert.equal((await syncInstallationCredential(root, "unknown", reader)).ok, false);
    assert.equal((await syncInstallationCredential(root, "ya", async () => {
      throw new Error("SSH test failure");
    })).ok, false);
    assert.equal(getInstallationCredentials(root, "ya").fields.syncSecret, undefined);
    assert.equal((await import("node:fs")).statSync(join(config, "credentials.local.json")).mode & 0o777, 0o600);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("BlackSea yerel kaydı mevcut farklı anahtarın üzerine yazılmaz", async () => {
  const { syncInstallationCredential } = await import("../apps/admin-control-center/dist-electron/electron/services/credentials-service.js");
  const root = mkdtempSync(join(tmpdir(), "admin-secret-record-"));
  mkdirSync(join(root, "config"));
  writeFileSync(join(root, "config", "installations.json"), JSON.stringify({
    installations: { blacksea: { credentialRef: "blacksea-natro", webModuleUrl: "https://site.invalid/module" } }
  }));
  try {
    const local = async () => ({ value: "unverified-record-00001", source: "install-record", verifiedLive: false });
    const first = await syncInstallationCredential(root, "blacksea", local);
    assert.equal(first.ok, true);
    assert.equal(first.verifiedLive, false);
    const conflict = await syncInstallationCredential(root, "blacksea", async () => ({
      value: "unverified-record-00002", source: "install-record", verifiedLive: false
    }));
    assert.equal(conflict.ok, false);
    assert.equal(conflict.changed, false);
    assert.equal(getCredentialForClipboard(root, "blacksea", "syncSecret"), "unverified-record-00001");
    const live = await syncInstallationCredential(root, "blacksea", async () => ({
      value: "remote-confirmed-00003", source: "ssh", verifiedLive: true
    }));
    assert.equal(live.ok, true);
    assert.equal(getCredentialForClipboard(root, "blacksea", "syncSecret"), "remote-confirmed-00003");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("BlackSea kurulum dosyasından yalnız yerel anahtar okunur; canlı doğrulandı denmez", async () => {
  const { readInstallRecord } = await import("../apps/admin-control-center/dist-electron/electron/services/installation-secret-sync.js");
  const base = mkdtempSync(join(tmpdir(), "admin-blacksea-record-"));
  const repo = join(base, "YardimciAsistan");
  const deployment = join(base, "blacksea_web", ".deploy");
  mkdirSync(repo);
  mkdirSync(deployment, { recursive: true });
  writeFileSync(join(deployment, "yardimci-asistan-install-info.txt"),
    "Web modül adresi: https://example.invalid/yardimci-asistan\nWeb güvenlik anahtarı: local-install-00001\n");
  try {
    const result = readInstallRecord(repo, { id: "blacksea", externalRepo: { defaultSibling: "blacksea_web" } });
    assert.equal(result.value, "local-install-00001");
    assert.equal(result.verifiedLive, false);
    assert.equal(result.source, "install-record");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
