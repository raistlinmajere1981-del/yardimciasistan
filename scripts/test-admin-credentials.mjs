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
