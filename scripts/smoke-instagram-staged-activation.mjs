import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { multichannelFixture } from "./test-helpers/marketing-multichannel-fixtures.mjs";

const require=createRequire(import.meta.url);
const secretModule=require("../apps/desktop-app/dist-electron/business-messaging/secret-service.js");
const originalDecrypt=secretModule.decryptMessagingSecret;
// This smoke runs directly under Node, rather than Electron's safeStorage.
// Only the fixture secret is decoded; no real keys are accessed.
secretModule.decryptMessagingSecret=value=>
  typeof value==="string"&&value.startsWith("safe-storage:v1:")
    ? [...Buffer.from(value.slice(16),"base64").toString()].reverse().join("")
    : "";
const fixture=multichannelFixture();
try {
  const db=fixture.db, original=db.getSetupData();
  const input=enabled=>({...fixture.setup,profileOptions:original.profileOptions,
    sms:{enabled:original.sms.enabled,senderId:original.sms.senderId,iysList:original.sms.iysList},
    instagram:{enabled}});
  const before=db.getStoredMarketingProvider("instagram_api");
  assert.ok(before.secret_one_encrypted.startsWith("safe-storage:v1:"));
  db.disconnectInstagramOAuthConnection();
  assert.equal(db.getInstagramConfiguration().enabled,false);
  assert.equal(db.saveInitialSetup(input(true)).ok,false,"no account must not activate Instagram");
  const token=before.secret_one_encrypted;
  db.saveInstagramOAuthConnection({accountId:"9001",username:"fixture_account",
    encryptedToken:token,expiresAt:new Date(Date.now()+45*86400_000).toISOString()});
  assert.equal(db.getInstagramConfiguration().enabled,false,"OAuth alone must never enable publishing");
  assert.equal(db.saveInitialSetup(input(true)).ok,false,"untested OAuth connection must not activate");
  db.recordServiceSettingsVerification("instagram",{accountId:"9001",accessToken:"PRIVATE_TOKEN"});
  const saved=db.saveInitialSetup(input(true));
  assert.equal(saved.ok,true,saved.message);
  assert.equal(db.getInstagramConfiguration().enabled,true);
  assert.equal(db.getStoredMarketingProvider("instagram_api").secret_one_encrypted,token);
  const paused=db.saveInitialSetup(input(false));
  assert.equal(paused.ok,true,paused.message);
  assert.equal(db.getInstagramConfiguration().enabled,false);
  assert.equal(db.getStoredMarketingProvider("instagram_api").secret_one_encrypted,token,"pause must keep OAuth token");
  assert.equal(db.saveInitialSetup(input(true)).ok,true,"same successful test should authorize resuming");
  assert.equal(db.getInstagramConfiguration().enabled,true);
  assert.equal(db.saveInitialSetup(input(false)).ok,true);
  db.saveInstagramOAuthConnection({accountId:"9001",username:"fixture_account",
    encryptedToken:"safe-storage:v1:"+Buffer.from([..."NEW_TOKEN"].reverse().join("")).toString("base64"),
    expiresAt:new Date(Date.now()+45*86400_000).toISOString()});
  assert.equal(db.getInstagramConfiguration().enabled,false);
  assert.equal(db.saveInitialSetup(input(true)).ok,false,"rotated token requires matching successful test evidence");
  db.recordServiceSettingsVerification("instagram",{accountId:"9001",accessToken:"NEW_TOKEN"});
  assert.equal(db.saveInitialSetup(input(true)).ok,true);
  assert.equal(db.saveInitialSetup(input(false)).ok,true);
  db.saveInstagramOAuthConnection({accountId:"9001",username:"fixture_account",
    encryptedToken:token,expiresAt:new Date(Date.now()-60_000).toISOString()});
  assert.equal(db.saveInitialSetup(input(true)).ok,false,"expired grant must not activate service");
  assert.equal(db.getInstagramConfiguration().enabled,false);
  console.log("instagram-staged-activation-ok: connection/test gate, Settings commit, pause/undo isolation, rotation and expiry");
} finally {
  secretModule.decryptMessagingSecret=originalDecrypt;
  await fixture.dispose();
}
