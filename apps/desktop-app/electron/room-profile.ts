import { DatabaseSync } from "node:sqlite";

export interface RoomProfile {
  id: string;
  name: string;
  number: string;
  capacity: number;
  nightlyPriceMinor: number;
  currency: string;
}

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

function normalizeCurrency(value: unknown): string {
  const normalized = String(value ?? "TRY").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "TRY";
}
