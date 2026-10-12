import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { multichannelFixture } from "./test-helpers/marketing-multichannel-fixtures.mjs";

const f = multichannelFixture();
const raw = new DatabaseSync(f.db.databasePath);
const encrypted = value => "safe-storage:v1:" + Buffer.from([...value].reverse().join("")).toString("base64");
const row = () => raw.prepare("SELECT account_id, sender_id, secret_one_encrypted, secret_two_encrypted FROM marketing_provider_config WHERE provider_id='instagram_api'").get();
const expires = days => new Date(Date.now() + days * 86400_000).toISOString();
const connect = (token, days) => f.db.saveInstagramOAuthConnection({
  accountId: "9001", username: "fixture_account", encryptedToken: encrypted(token), expiresAt: expires(days)
});
try {
  const OAuth = f.load("marketing/instagram-oauth-service").InstagramOAuthService;
  let refreshCalls = 0;
  let response = { access_token: "NEW_TOKEN", expires_in: 5184000 };
  let allowRequest;
  const fetchImpl = async (url) => {
    refreshCalls++;
    assert.equal(new URL(url).origin, "https://graph.instagram.com");
    assert.equal(new URL(url).pathname, "/refresh_access_token");
    if (allowRequest) await allowRequest;
    return Response.json(response);
  };
  const service = new OAuth(() => f.db, fetchImpl, () => {});
  connect("OLD_TOKEN", 46);
  const stable = row();
  await service.refreshIfNeeded();
  assert.equal(refreshCalls, 0, "unexpired token must not trigger refresh before 30-day threshold");
  assert.equal(row().secret_one_encrypted, stable.secret_one_encrypted);

  connect("OLD_TOKEN", 9);
  await service.refreshIfNeeded();
  assert.equal(refreshCalls, 1);
  assert.equal(row().secret_one_encrypted, encrypted("NEW_TOKEN"));
  assert.ok(Date.parse(row().secret_two_encrypted) > Date.now() + 50 * 86400_000);
  assert.equal(row().account_id, "9001");
  assert.equal(row().sender_id, "fixture_account");

  connect("VALID_TOKEN", 5);
  response = { error: { message: "provider temporarily unavailable" } };
  const beforeFailure = row();
  await service.refreshIfNeeded();
  assert.equal(refreshCalls, 2);
  assert.deepEqual(row(), beforeFailure, "refresh error must not delete still-valid credentials");

  connect("VALID_TOKEN", 5);
  response = { access_token: "CONCURRENT_TOKEN", expires_in: 5184000 };
  allowRequest = new Promise(resolve => { f.releaseRefresh = resolve; });
  const a = service.refreshIfNeeded();
  const b = service.refreshIfNeeded();
  await Promise.all([b, new Promise(resolve => setImmediate(resolve))]);
  assert.equal(refreshCalls, 3, "concurrent refresh must be fenced");
  f.releaseRefresh();
  await a;
  assert.equal(row().secret_one_encrypted, encrypted("CONCURRENT_TOKEN"));

  // Disconnect must invalidate an in-flight HTTP refresh. It must never
  // resurrect credentials after the user explicitly disconnected the account.
  connect("TOKEN_BEFORE_DISCONNECT", 5);
  response = { access_token: "STALE_REFRESH", expires_in: 5184000 };
  allowRequest = new Promise(resolve => { f.releaseRefresh = resolve; });
  const stale = service.refreshIfNeeded();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshCalls, 4);
  service.disconnect();
  f.releaseRefresh();
  await stale;
  assert.equal(f.db.getInstagramConfiguration().enabled, false);
  assert.equal(row().secret_one_encrypted, "", "a stale refresh must not reactivate a disconnected account");
  allowRequest = null;
  connect("RECONNECTED_TOKEN", 40);

  // Ordinary Settings saves must not modify the canonical OAuth connection.
  const linked = row();
  const setup = f.db.getSetupData();
  const save = f.db.saveInitialSetup({
    ...f.setup, profileOptions: setup.profileOptions,
    sms: { enabled: setup.sms.enabled, senderId: setup.sms.senderId, iysList: setup.sms.iysList }
  });
  assert.equal(save.ok, true, save.message);
  assert.deepEqual(row(), linked, "Settings save must not overwrite OAuth credentials or expiry");

  // Instagram's service toggle pauses publication but preserves the OAuth grant.
  const tokenBeforePause = row();
  const oauthBeforePause = f.db.getInstagramConfiguration();
  assert.equal(oauthBeforePause.enabled, true);
  service.setEnabled(false);
  assert.equal(f.db.getInstagramConfiguration().enabled, false);
  assert.equal(f.db.getInstagramConfiguration().configured, false);
  assert.deepEqual(row(), tokenBeforePause, "pausing must preserve encrypted token, account and expiry");
  await service.refreshIfNeeded();
  assert.equal(refreshCalls, 4, "a paused channel must not refresh in background");
  service.setEnabled(true);
  assert.equal(f.db.getInstagramConfiguration().enabled, true);
  assert.deepEqual(row(), tokenBeforePause, "resuming must reuse the same OAuth connection");

  connect("EXPIRED_TOKEN", -1);
  service.setEnabled(false);
  assert.throws(() => service.setEnabled(true), /Instagram erişimi geçerli değil/);
  assert.equal(f.db.getInstagramConfiguration().enabled, false, "expired account stays paused");
  assert.notEqual(row().secret_one_encrypted, "", "pause must not delete expired token; reconnect remains possible");

  console.log("instagram-oauth-refresh-ok: threshold, rotation, failure preservation, concurrency, disconnect fencing, settings isolation, pause/resume");
} finally {
  raw.close();
  await f.dispose();
}
