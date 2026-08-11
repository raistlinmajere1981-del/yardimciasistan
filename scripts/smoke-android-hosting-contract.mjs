import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { ANDROID_ACTION_TYPES, ANDROID_PERMISSIONS } = require("../packages/sync-core/dist/index.js");
const php = readFileSync(join(process.cwd(), "firm-template", "web-module", "api", "sync.php"), "utf8");

const actionBody = functionBody("ya_sync_android_action_types");
const permissionBody = functionBody("ya_sync_android_permissions");
const phpActions = quotedValues(actionBody);
const phpPermissions = quotedValues(permissionBody);

assert.deepEqual(
  [...phpActions].sort(),
  [...ANDROID_ACTION_TYPES].sort(),
  "PHP hosting Android action listesi sync-core ile aynı kalmalı"
);
assert.deepEqual(
  [...phpPermissions].sort(),
  [...ANDROID_PERMISSIONS].sort(),
  "PHP hosting Android izin listesi sync-core ile aynı kalmalı"
);

console.log(`android-hosting-contract-smoke-ok: ${phpActions.size} action ve ${phpPermissions.size} izin eşleşiyor`);

function functionBody(name) {
  const startToken = `function ${name}(`;
  const start = php.indexOf(startToken);
  assert.notEqual(start, -1, `${name} PHP dosyasında bulunamadı`);
  const next = php.indexOf("\nfunction ", start + startToken.length);
  assert.notEqual(next, -1, `${name} fonksiyon sınırı bulunamadı`);
  return php.slice(start, next);
}

function quotedValues(source) {
  const values = new Set();
  for (const match of source.matchAll(/'([^']+)'/g)) {
    values.add(match[1]);
  }
  return values;
}
