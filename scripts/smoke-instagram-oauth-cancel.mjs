import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash, randomBytes } from "node:crypto";
import ts from "typescript";

const file = new URL("../apps/desktop-app/electron/marketing/instagram-oauth-service.ts", import.meta.url);
const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const moduleExports = {};
const sessionId = "a".repeat(64);
let releaseClaim, enteredClaim, awaitClaim = false;
let holdStart = false, releaseStart, enteredStart;
let starts = 0, opens = 0, saved = 0, verified = 0, disconnected = 0, profiles = 0;
const database = {
  saveInstagramOAuthConnection: () => { saved++; },
  recordServiceSettingsVerification: () => { verified++; },
  disconnectInstagramOAuthConnection: () => { disconnected++; },
  getInstagramConfiguration: () => ({ hasSecret: true, accountId: "99001", username: "existing_account" })
};
const mock = {
  electron: {
    safeStorage: { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "gnome_libsecret",
      encryptString: value => Buffer.from(value) },
    shell: { openExternal: async () => { opens++; } }
  },
  "./instagram-provider": { InstagramPublishingProviderAdapter: class {
    async getAccountProfile() { profiles++; return { username: "new_account" }; }
  } },
  "../business-messaging/secret-service": { decryptMessagingSecret: () => "" },
  "./provider-http": {
    providerObject: value => !!value && typeof value === "object" && !Array.isArray(value),
    providerJson: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.action === "start") {
        starts++;
        if (holdStart) {
          enteredStart();
          await new Promise(resolve => { releaseStart = resolve; });
        }
        return { response: { ok: true }, data: { ok: true, sessionId,
          authorizationUrl: "https://www.instagram.com/oauth/authorize?state=" + sessionId } };
      }
      if (body.action === "claim") {
        if (awaitClaim) {
          enteredClaim();
          await new Promise(resolve => { releaseClaim = resolve; });
        }
        return { response: { ok: true }, data: { ok: true, status: "connected",
          connection: { accountId: "12345", username: "new_account", accessToken: "abc123",
            expiresAt: "2030-12-01T00:00:00Z" } } };
      }
      throw Error("Unexpected OAuth endpoint");
    }
  }
};
runInNewContext(compiled, {
  exports: moduleExports, Buffer, process, Date, Error, URL, Uint8Array, Response, setTimeout, clearTimeout,
  require: name => name === "node:crypto" ? { createHash, randomBytes } : name in mock ? mock[name] : (() => { throw Error(name); })()
});
const service = new moduleExports.InstagramOAuthService(() => database, async () => Response.json({}), () => {});
assert.equal((await service.begin()).ok, true);
assert.equal(opens, 1);
const claimEntered = new Promise(resolve => { enteredClaim = resolve; });
awaitClaim = true;
const staleClaim = service.poll();
await claimEntered;
assert.equal(service.cancelPending().ok, true);
assert.equal((await service.poll()).status, "failed", "cancellation removes the pending local session");
releaseClaim();
const staleResult = await staleClaim;
assert.equal(staleResult.status, "failed", "late HTTP claim must not connect");
assert.equal(saved, 0);
assert.equal(verified, 0);
assert.equal(disconnected, 0, "existing connected account must be preserved");
assert.equal(profiles, 0, "late claim must not validate or write a replacement token");

awaitClaim = false;
assert.equal((await service.begin()).ok, true);
assert.equal((await service.poll()).status, "connected", "new explicit OAuth attempt still succeeds");
assert.equal(saved, 1);
assert.equal(verified, 1);
assert.equal(disconnected, 0);

const startEntered = new Promise(resolve => { enteredStart = resolve; });
holdStart = true;
const staleBegin = service.begin();
await startEntered;
service.cancelPending();
releaseStart();
assert.equal((await staleBegin).ok, false, "late start after cancellation cannot open browser or create pending login");
assert.equal(opens, 2);
assert.equal(disconnected, 0);
assert.equal(starts, 3, "only explicit beginnings create sessions");
console.log("instagram-oauth-cancel-ok: in-flight claim/start fenced; linked account preserved; retry works");
