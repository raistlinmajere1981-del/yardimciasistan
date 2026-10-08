import {
  BUSINESS_CAPABILITIES,
  hasBusinessCapability,
  type BusinessCapability
} from "@yardimci-asistan/shared";
import type { DesktopRoom, DesktopReservation, DesktopCustomerRoomStay } from "./database-types";

export interface PublicRoomAvailabilityInput {
  rooms: Pick<DesktopRoom, "id" | "name" | "number" | "capacity" | "status" | "isActive">[];
  reservations: Pick<DesktopReservation, "status" | "startDate" | "endDate" | "roomIds">[];
  customerRoomStays: Pick<DesktopCustomerRoomStay, "status" | "roomId" | "checkInDate" | "checkOutDate">[];
}

interface PublicRoomAvailabilityRoom {
  id: string;
  name: string;
  number: string;
  capacity: number;
  status: string;
}

interface PublicRoomAvailabilityBlock {
  room_id: string;
  start_date: string;
  end_date: string;
}

export interface PublicRoomAvailabilityPublication {
  schema_version: 1;
  enabled: boolean;
  generated_at: string;
  rooms: PublicRoomAvailabilityRoom[];
  blocks: PublicRoomAvailabilityBlock[];
}

const RESERVATION_BLOCKING_STATUSES = new Set(["pending", "approved"]);
const STAY_BLOCKING_STATUSES = new Set(["planned", "checked_in"]);

/**
 * Builds the only accommodation payload that the public availability endpoint
 * needs. Customer identities, reservation ids/titles, notes, prices and stay
 * metadata are intentionally excluded from this contract.
 */
export function createPublicRoomAvailabilityPublication(
  input: PublicRoomAvailabilityInput,
  capabilities: readonly BusinessCapability[],
  now = new Date()
): PublicRoomAvailabilityPublication {
  const roomsEnabled = hasBusinessCapability(capabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS);
  const sourceEnabled = hasBusinessCapability(capabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_RESERVATIONS)
    || hasBusinessCapability(capabilities, BUSINESS_CAPABILITIES.ACCOMMODATION_STAYS);
  const enabled = roomsEnabled && sourceEnabled;
  const generatedAt = now.toISOString();

  if (!enabled) {
    return {
      schema_version: 1,
      enabled: false,
      generated_at: generatedAt,
      rooms: [],
      blocks: []
    };
  }

  const rooms = input.rooms
    .filter((room) => room.isActive)
    .map((room) => ({
      id: room.id,
      name: room.name,
      number: room.number,
      capacity: Math.max(0, Math.trunc(room.capacity)),
      status: normalizeRoomStatus(room.status)
    }))
    .filter((room) => room.id !== "");
  const roomIds = new Set(rooms.map((room) => room.id));
  const blocks: PublicRoomAvailabilityBlock[] = [];

  for (const reservation of input.reservations) {
    if (!RESERVATION_BLOCKING_STATUSES.has(reservation.status)) continue;
    const startDate = normalizeDate(reservation.startDate || reservation.endDate);
    const endDate = normalizeDate(reservation.endDate || reservation.startDate);
    if (!isUsableRange(startDate, endDate)) continue;
    for (const roomId of reservation.roomIds) {
      if (!roomIds.has(roomId)) continue;
      blocks.push({ room_id: roomId, start_date: startDate, end_date: endDate });
    }
  }

  for (const stay of input.customerRoomStays) {
    if (!STAY_BLOCKING_STATUSES.has(stay.status) || !roomIds.has(stay.roomId)) continue;
    const startDate = normalizeDate(stay.checkInDate);
    const endDate = normalizeDate(stay.checkOutDate) || "9999-12-31";
    if (!isUsableRange(startDate, endDate)) continue;
    blocks.push({ room_id: stay.roomId, start_date: startDate, end_date: endDate });
  }

  const mergedBlocks = mergeAvailabilityBlocks(blocks);
  const today = localDateKey(now);
  const roomsWithCurrentOrFutureBlock = new Set(
    mergedBlocks
      .filter((block) => block.end_date > today)
      .map((block) => block.room_id)
  );
  const safeRooms = rooms.map((room) => {
    if (["reserved", "occupied"].includes(room.status)
        && !roomsWithCurrentOrFutureBlock.has(room.id)) {
      return { ...room, status: "out_of_service" };
    }
    return room;
  });

  return {
    schema_version: 1,
    enabled: true,
    generated_at: generatedAt,
    rooms: safeRooms,
    blocks: mergedBlocks
  };
}

function normalizeRoomStatus(value: string): string {
  const status = value.trim().toLowerCase();
  if (["available", "reserved", "occupied", "cleaning", "maintenance", "out_of_service"].includes(status)) {
    return status;
  }
  return "out_of_service";
}

function normalizeDate(value: string): string {
  const candidate = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return "";
  const [year = 0, month = 0, day = 0] = candidate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return candidate;
}

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isUsableRange(startDate: string, endDate: string): boolean {
  return startDate !== "" && endDate !== "" && startDate < endDate;
}

function mergeAvailabilityBlocks(blocks: PublicRoomAvailabilityBlock[]): PublicRoomAvailabilityBlock[] {
  const sorted = [...blocks].sort((left, right) =>
    left.room_id.localeCompare(right.room_id)
      || left.start_date.localeCompare(right.start_date)
      || left.end_date.localeCompare(right.end_date)
  );
  const merged: PublicRoomAvailabilityBlock[] = [];

  for (const block of sorted) {
    const previous = merged[merged.length - 1];
    if (previous
        && previous.room_id === block.room_id
        && block.start_date <= previous.end_date) {
      if (block.end_date > previous.end_date) previous.end_date = block.end_date;
      continue;
    }
    merged.push({ ...block });
  }

  return merged;
}
