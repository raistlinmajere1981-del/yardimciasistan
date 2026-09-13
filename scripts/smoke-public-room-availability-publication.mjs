import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createPublicRoomAvailabilityPublication,
  roomStatusCanBeOffered
} = require("../apps/desktop-app/dist-electron/public-room-availability-publication.js");
const { BUSINESS_CAPABILITIES } = require("../packages/shared/dist/index.js");

const now = new Date("2026-09-13T09:00:00.000Z");
const dashboard = {
  rooms: [
    {
      id: "room-1",
      name: "Bahçe Oda",
      number: "1",
      capacity: 2,
      status: "available",
      isActive: true
    },
    {
      id: "room-2",
      name: "Aile Oda",
      number: "2",
      capacity: 4,
      status: "mystery_internal_status",
      isActive: true
    },
    {
      id: "room-inactive",
      name: "Eski Oda",
      number: "99",
      capacity: 2,
      status: "available",
      isActive: false
    }
  ],
  reservations: [
    {
      id: "reservation-secret-1",
      customerId: "customer-secret-1",
      customerName: "Gizli Müşteri",
      customerPhone: "+905551112233",
      status: "approved",
      title: "Gizli rezervasyon başlığı",
      startDate: "2026-09-20",
      endDate: "2026-09-22",
      roomIds: ["room-1"],
      notes: "Gizli rezervasyon notu"
    },
    {
      id: "reservation-secret-2",
      customerName: "İptal Müşteri",
      customerPhone: "+905559999999",
      status: "cancelled",
      startDate: "2026-09-18",
      endDate: "2026-09-30",
      roomIds: ["room-1"]
    }
  ],
  customerRoomStays: [
    {
      id: "stay-secret-1",
      customerId: "customer-secret-2",
      customerName: "Başka Gizli Müşteri",
      customerPhone: "+905550001122",
      roomId: "room-1",
      status: "planned",
      checkInDate: "2026-09-21",
      checkOutDate: "2026-09-24",
      notes: "Gizli konaklama notu"
    },
    {
      id: "stay-secret-2",
      customerName: "Çıkmış Müşteri",
      roomId: "room-1",
      status: "checked_out",
      checkInDate: "2026-09-10",
      checkOutDate: "2026-09-30"
    }
  ]
};

const capabilities = [
  BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS,
  BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS,
  BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS
];

const publication = createPublicRoomAvailabilityPublication(dashboard, capabilities, now);
assert.equal(publication.schema_version, 1);
assert.equal(publication.enabled, true);
assert.equal(publication.generated_at, now.toISOString());
assert.deepEqual(publication.rooms, [
  { id: "room-1", name: "Bahçe Oda", number: "1", capacity: 2, status: "available" },
  { id: "room-2", name: "Aile Oda", number: "2", capacity: 4, status: "out_of_service" }
]);
assert.deepEqual(publication.blocks, [
  { room_id: "room-1", start_date: "2026-09-20", end_date: "2026-09-24" }
]);

const serialized = JSON.stringify(publication);
for (const forbidden of [
  "Gizli Müşteri",
  "Başka Gizli Müşteri",
  "+905551112233",
  "+905550001122",
  "reservation-secret-1",
  "stay-secret-1",
  "Gizli rezervasyon notu",
  "Gizli konaklama notu"
]) {
  assert.equal(serialized.includes(forbidden), false, `PII/internal field leaked into public availability: ${forbidden}`);
}

assert.equal(roomStatusCanBeOffered("available"), true);
assert.equal(roomStatusCanBeOffered("reserved"), true);
assert.equal(roomStatusCanBeOffered("occupied"), true);
assert.equal(roomStatusCanBeOffered("cleaning"), false);
assert.equal(roomStatusCanBeOffered("maintenance"), false);
assert.equal(roomStatusCanBeOffered("out_of_service"), false);
assert.equal(roomStatusCanBeOffered("unexpected"), false);

const disabled = createPublicRoomAvailabilityPublication(
  dashboard,
  [BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS],
  now
);
assert.deepEqual(disabled, {
  schema_version: 1,
  enabled: false,
  generated_at: now.toISOString(),
  rooms: [],
  blocks: []
});

console.log("public-room-availability-publication-smoke-ok");
