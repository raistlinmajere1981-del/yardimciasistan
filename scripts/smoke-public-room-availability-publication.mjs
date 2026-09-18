import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createPublicRoomAvailabilityPublication
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
      id: "room-3",
      name: "Tutarsız Dolu Oda",
      number: "3",
      capacity: 2,
      status: "occupied",
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
  { id: "room-2", name: "Aile Oda", number: "2", capacity: 4, status: "out_of_service" },
  { id: "room-3", name: "Tutarsız Dolu Oda", number: "3", capacity: 2, status: "out_of_service" }
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

const statusDashboard = {
  rooms: [
    { id: "s-available", name: "Müsait Oda", number: "10", capacity: 2, status: "available", isActive: true },
    { id: "s-reserved-good", name: "Rezerve Dolu", number: "11", capacity: 2, status: "reserved", isActive: true },
    { id: "s-occupied-good", name: "Dolu Oda", number: "12", capacity: 2, status: "occupied", isActive: true },
    { id: "s-cleaning", name: "Temizlikte Oda", number: "13", capacity: 2, status: "cleaning", isActive: true },
    { id: "s-maintenance", name: "Bakımda Oda", number: "14", capacity: 2, status: "maintenance", isActive: true },
    { id: "s-oos", name: "Servis Dışı Oda", number: "15", capacity: 2, status: "out_of_service", isActive: true },
    { id: "s-mystery", name: "Bilinmeyen Oda", number: "16", capacity: 2, status: "unexpected_mystery_status", isActive: true },
    { id: "s-reserved-bad", name: "Bloksuz Rezerve", number: "17", capacity: 2, status: "reserved", isActive: true },
    { id: "s-occupied-bad", name: "Bloksuz Dolu", number: "18", capacity: 2, status: "occupied", isActive: true }
  ],
  reservations: [
    {
      id: "reservation-good-1",
      status: "approved",
      startDate: "2026-09-20",
      endDate: "2026-09-22",
      roomIds: ["s-reserved-good"]
    }
  ],
  customerRoomStays: [
    {
      id: "stay-good-1",
      status: "planned",
      roomId: "s-occupied-good",
      checkInDate: "2026-09-21",
      checkOutDate: "2026-09-24"
    }
  ]
};

const statusPublication = createPublicRoomAvailabilityPublication(statusDashboard, capabilities, now);
assert.equal(statusPublication.enabled, true);
assert.deepEqual(statusPublication.rooms, [
  { id: "s-available", name: "Müsait Oda", number: "10", capacity: 2, status: "available" },
  { id: "s-reserved-good", name: "Rezerve Dolu", number: "11", capacity: 2, status: "reserved" },
  { id: "s-occupied-good", name: "Dolu Oda", number: "12", capacity: 2, status: "occupied" },
  { id: "s-cleaning", name: "Temizlikte Oda", number: "13", capacity: 2, status: "cleaning" },
  { id: "s-maintenance", name: "Bakımda Oda", number: "14", capacity: 2, status: "maintenance" },
  { id: "s-oos", name: "Servis Dışı Oda", number: "15", capacity: 2, status: "out_of_service" },
  { id: "s-mystery", name: "Bilinmeyen Oda", number: "16", capacity: 2, status: "out_of_service" },
  { id: "s-reserved-bad", name: "Bloksuz Rezerve", number: "17", capacity: 2, status: "out_of_service" },
  { id: "s-occupied-bad", name: "Bloksuz Dolu", number: "18", capacity: 2, status: "out_of_service" }
]);
assert.deepEqual(statusPublication.blocks, [
  { room_id: "s-occupied-good", start_date: "2026-09-21", end_date: "2026-09-24" },
  { room_id: "s-reserved-good", start_date: "2026-09-20", end_date: "2026-09-22" }
]);

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
