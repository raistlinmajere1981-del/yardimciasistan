import { DatabaseSync } from "node:sqlite";

export interface SaveRoomProfileInput {
  roomId: string;
  name: string;
  amountMinor: number;
  currency?: string;
}

export type SaveRoomProfileResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export function saveRoomProfile(databasePath: string, input: SaveRoomProfileInput): SaveRoomProfileResult {
  const roomId = cleanText(input?.roomId, 180);
  const name = cleanText(input?.name, 120);
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

  const db = new DatabaseSync(databasePath);
  try {
    const now = new Date().toISOString();
    const result = db.prepare(`
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

  return { ok: true, message: "Oda bilgileri güncellendi." };
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeCurrency(value: unknown): string {
  const normalized = String(value ?? "TRY").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "TRY";
}
