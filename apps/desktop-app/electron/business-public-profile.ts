import { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_PUBLIC_PROFILE_LIMITS,
  hasCompleteBusinessPublicMapPoint,
  isBusinessPublicClockTime,
  normalizeBusinessPublicFeatures,
  normalizeBusinessPublicLanguages,
  type BusinessPublicProfile,
  type SaveBusinessPublicProfileInput
} from "@yardimci-asistan/shared";

const EMPTY_BUSINESS_PUBLIC_PROFILE: BusinessPublicProfile = {
  description: "",
  latitude: null,
  longitude: null,
  directionsNote: "",
  checkInTime: "",
  checkOutTime: "",
  breakfastStartTime: "",
  breakfastEndTime: "",
  features: [],
  policyNote: "",
  paymentNote: "",
  languages: []
};

export type BusinessPublicProfileSaveResult =
  | { ok: true; message: string; profile: BusinessPublicProfile }
  | { ok: false; message: string };

interface BusinessPublicProfileRow {
  description?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  directions_note?: unknown;
  check_in_time?: unknown;
  check_out_time?: unknown;
  breakfast_start_time?: unknown;
  breakfast_end_time?: unknown;
  features_json?: unknown;
  policy_note?: unknown;
  payment_note?: unknown;
  languages_json?: unknown;
}

export function getBusinessPublicProfile(databasePath: string): BusinessPublicProfile {
  const db = new DatabaseSync(databasePath);
  try {
    const businessId = getActiveBusinessId(db);
    if (!businessId) return { ...EMPTY_BUSINESS_PUBLIC_PROFILE };

    const row = db.prepare(`
      SELECT description, latitude, longitude, directions_note,
             check_in_time, check_out_time, breakfast_start_time, breakfast_end_time,
             features_json, policy_note, payment_note, languages_json
      FROM business_public_profile
      WHERE business_id = ?
      LIMIT 1
    `).get(businessId) as BusinessPublicProfileRow | undefined;

    return row ? mapProfileRow(row) : { ...EMPTY_BUSINESS_PUBLIC_PROFILE };
  } finally {
    db.close();
  }
}

export function saveBusinessPublicProfile(
  databasePath: string,
  input: SaveBusinessPublicProfileInput
): BusinessPublicProfileSaveResult {
  const normalized = normalizeProfileInput(input);
  if (!normalized.ok) return normalized;

  const db = new DatabaseSync(databasePath);
  try {
    const businessId = getActiveBusinessId(db);
    if (!businessId) {
      return { ok: false, message: "İşletme profili henüz oluşturulmamış." };
    }

    const now = new Date().toISOString();
    const profile = normalized.profile;
    db.prepare(`
      INSERT INTO business_public_profile (
        business_id, description, latitude, longitude, directions_note,
        check_in_time, check_out_time, breakfast_start_time, breakfast_end_time,
        features_json, policy_note, payment_note, languages_json,
        created_at, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only')
      ON CONFLICT(business_id) DO UPDATE SET
        description = excluded.description,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        directions_note = excluded.directions_note,
        check_in_time = excluded.check_in_time,
        check_out_time = excluded.check_out_time,
        breakfast_start_time = excluded.breakfast_start_time,
        breakfast_end_time = excluded.breakfast_end_time,
        features_json = excluded.features_json,
        policy_note = excluded.policy_note,
        payment_note = excluded.payment_note,
        languages_json = excluded.languages_json,
        updated_at = excluded.updated_at,
        sync_status = 'local_only'
    `).run(
      businessId,
      profile.description,
      profile.latitude,
      profile.longitude,
      profile.directionsNote,
      profile.checkInTime,
      profile.checkOutTime,
      profile.breakfastStartTime,
      profile.breakfastEndTime,
      JSON.stringify(profile.features),
      profile.policyNote,
      profile.paymentNote,
      JSON.stringify(profile.languages),
      now,
      now
    );

    return { ok: true, message: "Müşteriye açık işletme bilgileri kaydedildi.", profile };
  } catch {
    return { ok: false, message: "Müşteriye açık işletme bilgileri kaydedilemedi." };
  } finally {
    db.close();
  }
}

function normalizeProfileInput(
  input: SaveBusinessPublicProfileInput
): { ok: true; profile: BusinessPublicProfile } | { ok: false; message: string } {
  const latitude = normalizeNullableNumber(input?.latitude);
  const longitude = normalizeNullableNumber(input?.longitude);
  const hasAnyMapValue = latitude !== null || longitude !== null;
  if (hasAnyMapValue && !hasCompleteBusinessPublicMapPoint(latitude, longitude)) {
    return { ok: false, message: "Harita konumu için enlem ve boylam birlikte ve geçerli olmalı." };
  }

  const times = [
    ["Giriş saati", input?.checkInTime],
    ["Çıkış saati", input?.checkOutTime],
    ["Kahvaltı başlangıç saati", input?.breakfastStartTime],
    ["Kahvaltı bitiş saati", input?.breakfastEndTime]
  ] as const;
  for (const [label, value] of times) {
    if (!isBusinessPublicClockTime(value)) {
      return { ok: false, message: `${label} HH:MM biçiminde olmalı.` };
    }
  }

  return {
    ok: true,
    profile: {
      description: cleanText(input?.description, BUSINESS_PUBLIC_PROFILE_LIMITS.description),
      latitude,
      longitude,
      directionsNote: cleanText(input?.directionsNote, BUSINESS_PUBLIC_PROFILE_LIMITS.directionsNote),
      checkInTime: input?.checkInTime ?? "",
      checkOutTime: input?.checkOutTime ?? "",
      breakfastStartTime: input?.breakfastStartTime ?? "",
      breakfastEndTime: input?.breakfastEndTime ?? "",
      features: normalizeBusinessPublicFeatures(input?.features ?? []),
      policyNote: cleanText(input?.policyNote, BUSINESS_PUBLIC_PROFILE_LIMITS.policyNote),
      paymentNote: cleanText(input?.paymentNote, BUSINESS_PUBLIC_PROFILE_LIMITS.paymentNote),
      languages: normalizeBusinessPublicLanguages(input?.languages ?? [])
    }
  };
}

function mapProfileRow(row: BusinessPublicProfileRow): BusinessPublicProfile {
  const latitude = normalizeNullableNumber(row.latitude);
  const longitude = normalizeNullableNumber(row.longitude);
  const mapPoint = hasCompleteBusinessPublicMapPoint(latitude, longitude);
  return {
    description: String(row.description ?? ""),
    latitude: mapPoint ? latitude : null,
    longitude: mapPoint ? longitude : null,
    directionsNote: String(row.directions_note ?? ""),
    checkInTime: isBusinessPublicClockTime(row.check_in_time) ? String(row.check_in_time) : "",
    checkOutTime: isBusinessPublicClockTime(row.check_out_time) ? String(row.check_out_time) : "",
    breakfastStartTime: isBusinessPublicClockTime(row.breakfast_start_time) ? String(row.breakfast_start_time) : "",
    breakfastEndTime: isBusinessPublicClockTime(row.breakfast_end_time) ? String(row.breakfast_end_time) : "",
    features: normalizeBusinessPublicFeatures(parseJsonArray(row.features_json)),
    policyNote: String(row.policy_note ?? ""),
    paymentNote: String(row.payment_note ?? ""),
    languages: normalizeBusinessPublicLanguages(parseJsonArray(row.languages_json))
  };
}

function getActiveBusinessId(db: DatabaseSync): string {
  const row = db.prepare(`
    SELECT id
    FROM business
    WHERE deleted_at = ''
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id?: unknown } | undefined;
  return String(row?.id ?? "").trim();
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return Number.NaN;
  return value;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
