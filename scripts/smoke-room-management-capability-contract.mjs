import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const section = (text, start, end) => {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return text.slice(startIndex, endIndex);
};

const roomManagementSource = source("apps/desktop-app/src/components/settings/RoomManagementSection.tsx");
const roomFolioIpcSource = source("apps/desktop-app/electron/room-folio-ipc.ts");
const roomProfileSource = source("apps/desktop-app/electron/room-profile.ts");

assert.match(
  roomManagementSource,
  /runtimeHasCapability\([\s\S]{0,180}BUSINESS_CAPABILITIES\.ACCOMMODATION_ROOMS/,
  "room settings must use the persisted accommodation.rooms capability"
);
const roomLoadEffect = section(roomManagementSource, "useEffect(() => {", "const invalidMessage");
assert.match(
  roomLoadEffect,
  /if \(!roomsEnabled\) \{[\s\S]*return \(\) => \{ active = false; \};\s*\}/,
  "room settings must exit before bridge reads while accommodation.rooms is disabled"
);
assert.ok(
  roomLoadEffect.indexOf("if (!roomsEnabled)") < roomLoadEffect.indexOf("getRoomFolioData"),
  "the rooms capability gate must run before the historical bridge read"
);
assert.match(
  roomManagementSource,
  /if \(!roomsEnabled\) \{\s*return null;\s*\}/,
  "room settings must disappear when accommodation.rooms is disabled"
);

const getDataHandler = section(
  roomFolioIpcSource,
  'ipcMain.handle("roomFolio:getData"',
  'ipcMain.handle("roomFolio:setRoomNightlyPrice"'
);
assert.match(getDataHandler, /if \(!hasFolioCapability\(\)\)/);
assert.match(getDataHandler, /assertRoomAccess\(\)/);
assert.match(getDataHandler, /return roomProfileData\(\)/);

const roomPriceHandler = section(
  roomFolioIpcSource,
  'ipcMain.handle("roomFolio:setRoomNightlyPrice"',
  'ipcMain.handle("roomFolio:open"'
);
assert.match(
  roomPriceHandler,
  /assertRoomAccess\(\)/,
  "room profile writes must require accommodation.rooms instead of accommodation.folio"
);

const roomProjection = section(roomFolioIpcSource, "const roomProfileData", "const folioData");
for (const emptyDomain of ["activeStays: []", "folios: []", "menuCategories: []", "menuItems: []"]) {
  assert.ok(roomProjection.includes(emptyDomain), `room-only projection leaked domain data: ${emptyDomain}`);
}
assert.match(
  roomProfileSource,
  /export function listRoomProfiles[\s\S]{0,700}FROM rooms[\s\S]{0,220}deleted_at = '' AND is_active = 1/,
  "room profile reads must come directly from active room records"
);

console.log("room-management-capability-contract-smoke-ok");
