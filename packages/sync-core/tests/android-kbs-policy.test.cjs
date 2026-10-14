const test = require("node:test");
const assert = require("node:assert/strict");
const { BUSINESS_CAPABILITIES: C } = require("../../shared/dist");
const { ANDROID_PERMISSIONS, ANDROID_PERMISSION_GROUP_PERMISSIONS, ANDROID_ACTION_TYPES,
  androidEffectivePermissionsForRole, androidActionAllowedByCapabilities, resolveAndroidActionPermission } = require("../dist");

test("KBS has independent admin permissions with accommodation and Android gates", () => {
  const caps = [C.ANDROID,C.ACCOMMODATION_ROOMS,C.ACCOMMODATION_STAYS];
  const entries = [["kbs_send_request","kbs.send"],["kbs_retry_prepare","kbs.retry"],["kbs_mark_sent_externally","kbs.reconcile_external"]];
  for (const permission of ["kbs.view",...entries.map(([,p])=>p)]) {
    assert.ok(ANDROID_PERMISSIONS.includes(permission));
    assert.ok(androidEffectivePermissionsForRole("admin", [], caps).includes(permission));
    assert.equal(androidEffectivePermissionsForRole("staff", ANDROID_PERMISSIONS, caps).includes(permission), false);
    for (const group of Object.values(ANDROID_PERMISSION_GROUP_PERMISSIONS)) assert.equal(group.includes(permission), false);
  }
  for (const [type,permission] of entries) {
    assert.ok(ANDROID_ACTION_TYPES.includes(type));
    assert.equal(resolveAndroidActionPermission(type), permission);
    assert.ok(androidActionAllowedByCapabilities(type,caps));
    for (const cap of caps) assert.equal(androidActionAllowedByCapabilities(type,caps.filter(value=>value!==cap)), false);
  }
});
