import type { DatabaseSync } from "node:sqlite";
import { BUSINESS_CAPABILITIES } from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "./business-capability-store.js";
import { DesktopRoomFolioService } from "./room-folio.js";
import { assignCustomerToRoom, createStayFromReservation, updateCustomerRoomStayStatus } from "./stay-reservation-service.js";
import type { AssignCustomerRoomInput, CreateStayFromReservationInput } from "./database-types.js";
import type { DomainMutationContext } from "./database/event-store.js";

type StayEntryResult = { ok: true; message: string; savedId: string } | { ok: false; message: string };

/** One arrival coordinator for desktop and action-transaction callers, on their connection. */
function completeStayEntry(db: DatabaseSync, databasePath: string,
  operation: () => StayEntryResult, checkIn: boolean,
  input?: AssignCustomerRoomInput | CreateStayFromReservationInput): StayEntryResult {
  db.exec("SAVEPOINT hospitality_entry");
  try {
    const receipt = input?.requestId ? db.prepare("SELECT stay_id, input_json FROM hospitality_entry_receipts WHERE request_id = ?")
      .get(input.requestId) as { stay_id: string; input_json: string } | undefined : undefined;
    let result: StayEntryResult;
    if (receipt && receipt.input_json !== JSON.stringify(input)) result = { ok: false, message: "Giriş isteği değişti; yeni işlem başlatın." };
    else if (receipt) result = { ok: true, savedId: receipt.stay_id, message: "Bu giriş daha önce tamamlandı." };
    else {
      result = operation();
      if (result.ok && checkIn && readEnabledBusinessCapabilities(db).includes(BUSINESS_CAPABILITIES.ACCOMMODATION_FOLIO)) {
        const folio = new DesktopRoomFolioService(databasePath).openFolio(result.savedId, db);
        if (!folio.ok) result = folio;
      }
      if (result.ok && input?.requestId) db.prepare("INSERT INTO hospitality_entry_receipts (request_id, input_json, stay_id) VALUES (?, ?, ?)")
        .run(input.requestId, JSON.stringify(input), result.savedId);
    }
    if (!result.ok) db.exec("ROLLBACK TO hospitality_entry");
    db.exec("RELEASE hospitality_entry");
    return result;
  } catch {
    db.exec("ROLLBACK TO hospitality_entry; RELEASE hospitality_entry");
    return { ok: false, message: "Giriş tamamlanamadı; konaklama, misafir ve hesap değişiklikleri geri alındı." };
  }
}

export function assignHospitalityStay(db: DatabaseSync, databasePath: string, input: AssignCustomerRoomInput,
  context: DomainMutationContext & { newStayId?: string; allowExtraCapacity?: boolean } = {}) {
  return completeStayEntry(db, databasePath, () => assignCustomerToRoom(db, input, context), input.status === "checked_in", input);
}

export function enterReservedHospitalityStay(db: DatabaseSync, databasePath: string, input: CreateStayFromReservationInput) {
  return completeStayEntry(db, databasePath, () => createStayFromReservation(db, input), input.status === "checked_in", input);
}

export function checkInHospitalityStay(db: DatabaseSync, databasePath: string, stayId: string, context: DomainMutationContext = {}) {
  return completeStayEntry(db, databasePath, () => updateCustomerRoomStayStatus(db, { stayId, status: "checked_in" }, context), true);
}
