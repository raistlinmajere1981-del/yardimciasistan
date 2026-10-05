import type { DatabaseSync } from "node:sqlite";
import type { UpdateRoomStatusInput } from "./database-types.js";
import { normalizeStatus } from "./database/request-utils.js";
import { updateRoomStatus } from "./database/room-store.js";
import type { DomainMutationContext } from "./database/event-store.js";

export type RoomStatusMutationResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export function updateRoomStatusWithStayGuard(
  db: DatabaseSync,
  input: UpdateRoomStatusInput,
  context: DomainMutationContext = {}
): RoomStatusMutationResult {
  const roomId = input.roomId.trim();
  const status = normalizeStatus(
    input.status,
    ["available", "reserved", "occupied", "cleaning", "maintenance"]
  );

  if (!roomId || !status) {
    return {
      ok: false,
      message: "Oda durumu için geçerli kayıt ve durum seçilmeli."
    };
  }

  const room = db
    .prepare("SELECT status FROM rooms WHERE id = ? AND deleted_at = ''")
    .get(roomId) as { status?: string } | undefined;
  if (!room) {
    return {
      ok: false,
      message: "Oda bulunamadı."
    };
  }

  const activeStay = db
    .prepare(`
      SELECT status
      FROM customer_room_stays
      WHERE room_id = ?
        AND status IN ('checked_in', 'planned')
        AND deleted_at = ''
      ORDER BY CASE status WHEN 'checked_in' THEN 0 ELSE 1 END
      LIMIT 1
    `)
    .get(roomId) as { status?: string } | undefined;

  const expectedStatus =
    activeStay?.status === "checked_in"
      ? "occupied"
      : activeStay?.status === "planned"
        ? "reserved"
        : "";

  if (expectedStatus && status !== expectedStatus) {
    return {
      ok: false,
      message:
        "Odanın aktif müşteri kaydı var. Durumu konaklama kartındaki giriş, çıkış veya iptal işlemiyle değiştirin."
    };
  }

  return updateRoomStatus(
    db,
    roomId,
    status,
    String(room.status ?? ""),
    context.now ?? new Date().toISOString(),
    context.androidAction
  );
}
