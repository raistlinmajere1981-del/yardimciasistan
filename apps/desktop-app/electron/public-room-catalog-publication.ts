import { PublicTranslationStore } from "./database/public-translation-store";
import { DatabaseSync } from "node:sqlite";
import { getRoomPublishedMedia } from "./room-media-service";
import {
  BUSINESS_CAPABILITIES,
  hasBusinessCapability,
  normalizeRoomPublicFeatures,
  type BusinessCapability,
  type RoomPublicCatalog
} from "@yardimci-asistan/shared";

export function createPublicRoomCatalog(
  databasePath: string,
  capabilities: Iterable<BusinessCapability>,
  userDataPath = ""
): RoomPublicCatalog {
  const enabled = capabilities instanceof Set ? capabilities : new Set(capabilities);
  if (!hasBusinessCapability(enabled, BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS)) {
    return { version: 1, enabled: false, updatedAt: "", rooms: [] };
  }

  const db = new DatabaseSync(databasePath);
  try {
    const publication = db.prepare(
      "SELECT publish_rooms_web FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1"
    ).get() as { publish_rooms_web?: unknown } | undefined;
    const publicationEnabled = Number(publication?.publish_rooms_web ?? 1) === 1;
    if (!publicationEnabled) {
      return { version: 1, enabled: false, updatedAt: "", rooms: [] };
    }
    const rows = db.prepare(`
      SELECT id, name, number, capacity, bed_info, floor, features_json,
             description, price_note, nightly_price_minor, price_currency,
             sort_order, updated_at
      FROM rooms
      WHERE deleted_at = '' AND is_active = 1
      ORDER BY sort_order ASC, number ASC, name ASC
    `).all() as Array<Record<string, unknown>>;

    const rooms = rows.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      number: text(row.number),
      capacity: Math.max(1, Math.trunc(Number(row.capacity ?? 1) || 1)),
      bedInfo: text(row.bed_info),
      floor: text(row.floor),
      features: normalizeRoomPublicFeatures(parseArray(row.features_json)),
      description: text(row.description),
      priceNote: text(row.price_note),
      nightlyPriceMinor: Math.max(0, Math.trunc(Number(row.nightly_price_minor ?? 0) || 0)),
      currency: normalizeCurrency(row.price_currency),
      sortOrder: Math.max(0, Math.trunc(Number(row.sort_order ?? 0) || 0)),
      media: userDataPath ? getRoomPublishedMedia(userDataPath, text(row.id)) : [],
      updatedAt: text(row.updated_at)
    })).filter((room) => room.id && room.name);

    const updatedAt = rooms.reduce(
      (latest, room) => room.updatedAt > latest ? room.updatedAt : latest,
      ""
    );

    return {
      version: 1,
      enabled: true,
      localization: new PublicTranslationStore(db).localization(rows.map(r => ({kind: "room", id: String(r.id), fields: {name: String(r.name), bed_info: String(r.bed_info), description: String(r.description), price_note: String(r.price_note)}}))),
      updatedAt,
      rooms: rooms.map(({ updatedAt: _updatedAt, ...room }) => room)
    };
  } finally {
    db.close();
  }
}

function parseArray(value: unknown): unknown[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed as unknown[] : [];
  } catch {
    return [];
  }
}

function normalizeCurrency(value: unknown): string {
  const currency = String(value ?? "TRY").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "TRY";
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}
