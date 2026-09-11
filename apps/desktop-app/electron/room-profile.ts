import { DatabaseSync } from "node:sqlite";
import {
  ROOM_PUBLIC_DETAIL_LIMITS,
  normalizeRoomPublicFeatures,
  type SaveRoomPublicDetailsInput
} from "@yardimci-asistan/shared";

export interface RoomProfile {
  id: string;
  name: string;
  number: string;
  capacity: number;
  nightlyPriceMinor: number;
  currency: string;
}

export interface SaveRoomProfileInput {
  roomId: string;
  name: string;
  amountMinor: number;
  currency?: string;
  publicDetails?: SaveRoomPublicDetailsInput;
}

export type SaveRoomProfileResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export function listRoomProfiles(databasePath: string): RoomProfile[] {
  const db = new DatabaseSync(databasePath);
  try {
    const rows = db.prepare(`
      SELECT id, name, number, capacity, nightly_price_minor, price_currency
      FROM rooms
      WHERE deleted_at = '' AND is_active = 1
      ORDER BY sort_order, name
    `).all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      number: String(row.number ?? ""),
      capacity: Math.max(0, Number(row.capacity ?? 0) || 0),
      nightlyPriceMinor: Math.max(0, Number(row.nightly_price_minor ?? 0) || 0),
      currency: normalizeCurrency(row.price_currency)
    }));
  } finally {
    db.close();
  }
}

export function saveRoomProfile(databasePath: string, input: SaveRoomProfileInput): SaveRoomProfileResult {
  const roomId = cleanSingleLine(input?.roomId, 180);
  const name = cleanSingleLine(input?.name, ROOM_PUBLIC_DETAIL_LIMITS.name);
  const amountMinor = Number(input?.amountMinor);
  const currency = normalizeCurrency(input?.currency);

  if (!roomId) {
    return { ok: false, message: "Oda bulunamadı." };
  }
  if (!name) {
    return { ok: false, message: "Oda adı boş bırakılamaz." };
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    return { ok: false, message: "Gecelik oda fiyatı geçersiz." };
  }

  const publicDetails = input.publicDetails;
  if (publicDetails && String(publicDetails.roomId ?? "").trim() !== roomId) {
    return { ok: false, message: "Oda bilgileri geçersiz." };
  }

  const publicProfile = publicDetails ? normalizePublicDetails(publicDetails) : null;
  if (publicProfile && !publicProfile.ok) {
    return publicProfile;
  }

  const db = new DatabaseSync(databasePath);
  try {
    const now = new Date().toISOString();
    const result = publicProfile?.ok
      ? db.prepare(`
          UPDATE rooms
          SET name = ?, number = ?, capacity = ?, bed_info = ?, floor = ?, features_json = ?,
              description = ?, price_note = ?, nightly_price_minor = ?, price_currency = ?,
              updated_at = ?, sync_status = 'local_only'
          WHERE id = ? AND deleted_at = '' AND is_active = 1
        `).run(
          publicProfile.data.name,
          publicProfile.data.number,
          publicProfile.data.capacity,
          publicProfile.data.bedInfo,
          publicProfile.data.floor,
          JSON.stringify(publicProfile.data.features),
          publicProfile.data.description,
          publicProfile.data.priceNote,
          amountMinor,
          currency,
          now,
          roomId
        )
      : db.prepare(`
          UPDATE rooms
          SET name = ?, nightly_price_minor = ?, price_currency = ?, updated_at = ?, sync_status = 'local_only'
          WHERE id = ? AND deleted_at = '' AND is_active = 1
        `).run(name, amountMinor, currency, now, roomId);

    if (Number(result.changes) <= 0) {
      return { ok: false, message: "Oda bulunamadı." };
    }
  } catch {
    return { ok: false, message: "Oda bilgileri kaydedilemedi." };
  } finally {
    db.close();
  }

  return { ok: true, message: publicProfile ? "Müşteriye açık oda bilgileri güncellendi." : "Oda bilgileri güncellendi." };
}

type NormalizedPublicDetails = {
  name: string;
  number: string;
  capacity: number;
  bedInfo: string;
  floor: string;
  features: ReturnType<typeof normalizeRoomPublicFeatures>;
  description: string;
  priceNote: string;
};

type NormalizePublicDetailsResult =
  | { ok: true; data: NormalizedPublicDetails }
  | { ok: false; message: string };

function normalizePublicDetails(input: SaveRoomPublicDetailsInput): NormalizePublicDetailsResult {
  const name = normalizeSingleLine(input.name);
  const number = normalizeSingleLine(input.number);
  const bedInfo = normalizeSingleLine(input.bedInfo);
  const floor = normalizeSingleLine(input.floor);
  const description = normalizeMultiline(input.description);
  const priceNote = normalizeMultiline(input.priceNote);
  const capacity = Number(input.capacity);

  if (!name) {
    return { ok: false, message: "Oda adı boş bırakılamaz." };
  }
  if (name.length > ROOM_PUBLIC_DETAIL_LIMITS.name
      || number.length > ROOM_PUBLIC_DETAIL_LIMITS.number
      || bedInfo.length > ROOM_PUBLIC_DETAIL_LIMITS.bedInfo
      || floor.length > ROOM_PUBLIC_DETAIL_LIMITS.floor
      || description.length > ROOM_PUBLIC_DETAIL_LIMITS.description
      || priceNote.length > ROOM_PUBLIC_DETAIL_LIMITS.priceNote) {
    return { ok: false, message: "Oda bilgilerinden biri izin verilen uzunluğu aşıyor." };
  }
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100) {
    return { ok: false, message: "Kapasite 1 ile 100 arasında olmalı." };
  }

  return {
    ok: true,
    data: {
      name,
      number,
      capacity,
      bedInfo,
      floor,
      features: normalizeRoomPublicFeatures(input.features ?? []),
      description,
      priceNote
    }
  };
}

function cleanSingleLine(value: unknown, maxLength: number): string {
  return normalizeSingleLine(value).slice(0, maxLength);
}

function normalizeSingleLine(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeMultiline(value: unknown): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function normalizeCurrency(value: unknown): string {
  const normalized = String(value ?? "TRY").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "TRY";
}
