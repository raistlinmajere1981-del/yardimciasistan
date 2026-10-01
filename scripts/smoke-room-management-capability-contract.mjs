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
const businessLayoutSource = source("apps/desktop-app/electron/business-layout.ts");
const roomFolioIpcSource = source("apps/desktop-app/electron/room-folio-ipc.ts");
const roomProfileSource = source("apps/desktop-app/electron/room-profile.ts");

assert.match(
  roomManagementSource,
  /const roomsEnabled = draft\.capabilities\.rooms/,
  "room settings must consume the persisted BusinessLayout room capability"
);
assert.match(
  roomManagementSource,
  /if \(!roomsEnabled\) return null;/,
  "room settings must disappear when accommodation.rooms is disabled"
);

const layoutProjection = section(
  businessLayoutSource,
  "function getBusinessLayoutFromDb",
  "function hasCapability"
);
assert.match(
  layoutProjection,
  /hasCapability\(db, BUSINESS_CAPABILITIES\.ACCOMMODATION_ROOMS\)/
);
assert.match(
  layoutProjection,
  /rooms: roomsEnabled \? listRooms\(db\) : \[\]/
);

const layoutSave = section(
  businessLayoutSource,
  "export function saveBusinessLayout",
  "function openDatabase"
);
assert.match(
  layoutSave,
  /roomResolution\.rooms !== undefined && !roomsEnabled/
);
assert.match(
  layoutSave,
  /Oda yönetimi bu işletme profilinde etkin değil\./,
  "room layout writes must fail closed when the persisted room capability is disabled"
);

const getDataHandler = section(
  roomFolioIpcSource,
  'ipcMain.handle("roomFolio:getData"',
  'ipcMain.handle("roomFolio:open"'
);
assert.match(getDataHandler, /if \(!hasRoomCapability\(\)\)/);
assert.match(getDataHandler, /return unavailableRoomData\(\)/);
assert.match(getDataHandler, /if \(!hasFolioCapability\(\)\)/);
assert.match(getDataHandler, /return roomProfileData\(\)/);

const unavailableProjection = section(roomFolioIpcSource, "const unavailableRoomData", "const roomProfileData");
for (const emptyDomain of ["rooms: []", "activeStays: []", "folios: []", "menuCategories: []", "menuItems: []"]) {
  assert.ok(unavailableProjection.includes(emptyDomain), `disabled room projection leaked domain data: ${emptyDomain}`);
}

const roomProjection = section(roomFolioIpcSource, "const roomProfileData", "const folioData");
for (const emptyDomain of ["activeStays: []", "folios: []", "menuCategories: []", "menuItems: []"]) {
  assert.ok(roomProjection.includes(emptyDomain), `room-only projection leaked domain data: ${emptyDomain}`);
}
assert.match(
  roomProfileSource,
  /export function listRoomProfiles[\s\S]{0,700}FROM rooms[\s\S]{0,220}deleted_at = '' AND is_active = 1/,
  "room profile reads must come directly from active room records"
);
assert.doesNotMatch(
  roomFolioIpcSource,
  /roomFolio:setRoomNightlyPrice/,
  "room profile writes must belong to BusinessLayout, not RoomFolio"
);

console.log("room-management-capability-contract-smoke-ok");
