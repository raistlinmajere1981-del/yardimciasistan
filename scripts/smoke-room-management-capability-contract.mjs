import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const roomManagementSource = source("apps/desktop-app/src/components/settings/RoomManagementSection.tsx");
const roomFolioIpcSource = source("apps/desktop-app/electron/room-folio-ipc.ts");
const roomProfileSource = source("apps/desktop-app/electron/room-profile.ts");

assert.match(
  roomManagementSource,
  /runtimeHasCapability\([\s\S]{0,180}BUSINESS_CAPABILITIES\.ACCOMMODATION_ROOMS/,
  "room settings must use the persisted accommodation.rooms capability"
);
assert.match(
  roomManagementSource,
  /if \(!roomsEnabled\)[\s\S]{0,220}return[\s\S]{0,120}getRoomFolioData/,
  "room settings must not issue hidden bridge reads while accommodation.rooms is disabled"
);
assert.match(
  roomManagementSource,
  /if \(!roomsEnabled\) \{\s*return null;\s*\}/,
  "room settings must disappear when accommodation.rooms is disabled"
);

assert.match(
  roomFolioIpcSource,
  /roomFolio:getData[\s\S]{0,500}if \(!hasFolioCapability\(\)\)[\s\S]{0,220}assertRoomAccess\(\)[\s\S]{0,160}roomProfileData\(\)/,
  "historical roomFolio read bridge must return a room-only projection when folio is disabled"
);
assert.match(
  roomFolioIpcSource,
  /roomFolio:setRoomNightlyPrice[\s\S]{0,220}assertRoomAccess\(\)/,
  "room profile writes must require accommodation.rooms instead of accommodation.folio"
);
assert.match(
  roomFolioIpcSource,
  /roomProfileData[\s\S]{0,300}activeStays:\s*\[\][\s\S]{0,100}folios:\s*\[\][\s\S]{0,100}menuCategories:\s*\[\][\s\S]{0,100}menuItems:\s*\[\]/,
  "room-only compatibility projection must not expose stays, folios or menu data"
);
assert.match(
  roomProfileSource,
  /export function listRoomProfiles[\s\S]{0,500}FROM rooms[\s\S]{0,180}deleted_at = '' AND is_active = 1/,
  "room profile reads must come directly from active room records"
);

console.log("room-management-capability-contract-smoke-ok");
