import { DatabaseSync } from "node:sqlite";
import {
  BUSINESS_CAPABILITIES,
  ROOM_PUBLIC_DETAIL_LIMITS,
  createId,
  normalizeRoomPublicFeatures,
  normalizeTableCategoryInputs,
  type BusinessCapability,
  type RoomPublicFeatureId
} from "@yardimci-asistan/shared";
import {
  normalizeTableCategoryName,
  reconcileTableName,
  tableCategoryKey,
  type NormalizedTableCategoryInput
} from "./database/table-category-utils.js";
import { getTableCategories } from "./database/table-store.js";

export interface BusinessLayoutRoom {
  id: string;
  name: string;
  number: string;
  capacity: number;
  bedInfo: string;
  floor: string;
  features: RoomPublicFeatureId[];
  description: string;
  priceNote: string;
  nightlyPriceMinor: number;
  currency: string;
  sortOrder: number;
  canRemove: boolean;
  removeBlockReason: string;
}

export interface BusinessLayoutTableCategory {
  name: string;
  tableCount: number;
}

export interface BusinessLayoutSnapshot {
  rooms: BusinessLayoutRoom[];
  tableCategories: BusinessLayoutTableCategory[];
  capabilities: {
    rooms: boolean;
    tables: boolean;
  };
}

export interface BusinessLayoutRoomInput {
  id?: string;
  clientKey?: string;
  name: string;
  number: string;
  capacity: number;
  bedInfo: string;
  floor: string;
  features: readonly string[];
  description: string;
  priceNote: string;
  nightlyPriceMinor: number;
  currency: string;
}

export interface BusinessLayoutTableCategoryInput {
  sourceName?: string;
  name: string;
  tableCount: number;
}

export interface SaveBusinessLayoutInput {
  rooms?: BusinessLayoutRoomInput[];
  tableCategories?: BusinessLayoutTableCategoryInput[];
}

export type BusinessLayoutSaveResult =
  | { ok: true; message: string; layout: BusinessLayoutSnapshot }
  | { ok: false; message: string };

interface NormalizedRoomInput {
  id: string;
  name: string;
  number: string;
  capacity: number;
  bedInfo: string;
  floor: string;
  features: RoomPublicFeatureId[];
  description: string;
  priceNote: string;
  nightlyPriceMinor: number;
  currency: string;
}

export function getBusinessLayout(databasePath: string): BusinessLayoutSnapshot {
  const db = openDatabase(databasePath);
  try {
    return getBusinessLayoutFromDb(db);
  } finally {
    db.close();
  }
}

export function saveBusinessLayout(
  databasePath: string,
  input: SaveBusinessLayoutInput
): BusinessLayoutSaveResult {
  const roomResolution = normalizeRoomInputs(input?.rooms);
  if (!roomResolution.ok) return roomResolution;

  const tableResolution = normalizeTableCategoryInputs(input?.tableCategories);
  if (!tableResolution.ok) return tableResolution;

  const db = openDatabase(databasePath);
  let transactionStarted = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;

    const roomsEnabled = hasCapability(db, BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS);
    const tablesEnabled = hasCapability(db, BUSINESS_CAPABILITIES.FOOD_TABLES);

    if (roomResolution.rooms !== undefined && !roomsEnabled) {
      db.exec("ROLLBACK");
      transactionStarted = false;
      return { ok: false, message: "Oda yönetimi bu işletme profilinde etkin değil." };
    }
    if (tableResolution.categories !== undefined && !tablesEnabled) {
      db.exec("ROLLBACK");
      transactionStarted = false;
      return { ok: false, message: "Masa yönetimi bu işletme profilinde etkin değil." };
    }

    if (roomResolution.rooms !== undefined) {
      const roomCheck = validateRoomTargets(db, roomResolution.rooms);
      if (!roomCheck.ok) {
        db.exec("ROLLBACK");
        transactionStarted = false;
        return roomCheck;
      }
    }

    if (tableResolution.categories !== undefined) {
      const protectedTableIds = getProtectedTableIds(db);
      const targetCount = tableResolution.categories.reduce((sum, category) => sum + category.tableCount, 0);
      if (protectedTableIds.size > targetCount) {
        db.exec("ROLLBACK");
        transactionStarted = false;
        return {
          ok: false,
          message: "Aktif adisyon veya rezervasyona bağlı masalar nedeniyle toplam masa sayısı bu kadar azaltılamaz."
        };
      }
    }

    const now = new Date().toISOString();
    if (roomResolution.rooms !== undefined) {
      reconcileRooms(db, roomResolution.rooms, now);
    }
    if (tableResolution.categories !== undefined) {
      reconcileTableCategories(db, tableResolution.categories, now, getProtectedTableIds(db));
    }

    db.exec("COMMIT");
    transactionStarted = false;
    return {
      ok: true,
      message: "İşletme düzeni kaydedildi.",
      layout: getBusinessLayoutFromDb(db)
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
    }
    return {
      ok: false,
      message: error instanceof Error && error.message
        ? error.message
        : "İşletme düzeni kaydedilemedi."
    };
  } finally {
    db.close();
  }
}

function openDatabase(databasePath: string): DatabaseSync {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function getBusinessLayoutFromDb(db: DatabaseSync): BusinessLayoutSnapshot {
  const roomsEnabled = hasCapability(db, BUSINESS_CAPABILITIES.ACCOMMODATION_ROOMS);
  const tablesEnabled = hasCapability(db, BUSINESS_CAPABILITIES.FOOD_TABLES);
  return {
    rooms: roomsEnabled ? listRooms(db) : [],
    tableCategories: tablesEnabled
      ? getTableCategories(db).map((category) => ({ name: category.name, tableCount: category.tableCount }))
      : [],
    capabilities: {
      rooms: roomsEnabled,
      tables: tablesEnabled
    }
  };
}

function hasCapability(db: DatabaseSync, capability: BusinessCapability): boolean {
  return Boolean(db.prepare(
    "SELECT 1 FROM business_capabilities " +
    "INNER JOIN business ON business.id = business_capabilities.business_id " +
    "WHERE business.deleted_at = '' AND business_capabilities.capability_id = ? " +
    "AND business_capabilities.is_enabled = 1 LIMIT 1"
  ).get(capability));
}

function listRooms(db: DatabaseSync): BusinessLayoutRoom[] {
  const rows = db.prepare(
    "SELECT id, name, number, capacity, bed_info, floor, status, features_json, description, price_note, " +
    "nightly_price_minor, price_currency, sort_order " +
    "FROM rooms WHERE deleted_at = '' AND is_active = 1 " +
    "ORDER BY sort_order ASC, number ASC, name ASC"
  ).all() as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const id = text(row.id);
    const removeBlockReason = getRoomRemovalBlockReason(db, id, text(row.status));
    return {
      id,
      name: text(row.name),
      number: text(row.number),
      capacity: Math.max(1, Number(row.capacity ?? 1) || 1),
      bedInfo: text(row.bed_info),
      floor: text(row.floor),
      features: normalizeRoomPublicFeatures(parseStringArray(row.features_json)),
      description: text(row.description),
      priceNote: text(row.price_note),
      nightlyPriceMinor: Math.max(0, Number(row.nightly_price_minor ?? 0) || 0),
      currency: normalizeCurrency(row.price_currency),
      sortOrder: Math.max(0, Number(row.sort_order ?? 0) || 0),
      canRemove: !removeBlockReason,
      removeBlockReason
    };
  });
}

function normalizeRoomInputs(
  input: BusinessLayoutRoomInput[] | undefined
): { ok: true; rooms: NormalizedRoomInput[] | undefined } | { ok: false; message: string } {
  if (input === undefined) return { ok: true, rooms: undefined };
  if (!Array.isArray(input)) return { ok: false, message: "Oda düzeni geçerli bir liste olmalı." };
  if (input.length > 200) return { ok: false, message: "En fazla 200 oda tanımlanabilir." };

  const ids = new Set<string>();
  const rooms: NormalizedRoomInput[] = [];

  for (const candidate of input) {
    const id = cleanSingleLine(candidate?.id, 180);
    if (id && ids.has(id)) {
      return { ok: false, message: "Aynı oda birden fazla kez düzenlenemez." };
    }
    if (id) ids.add(id);

    const name = normalizeSingleLine(candidate?.name);
    const number = normalizeSingleLine(candidate?.number);
    const bedInfo = normalizeSingleLine(candidate?.bedInfo);
    const floor = normalizeSingleLine(candidate?.floor);
    const description = normalizeMultiline(candidate?.description);
    const priceNote = normalizeMultiline(candidate?.priceNote);
    const capacity = Number(candidate?.capacity);
    const nightlyPriceMinor = Number(candidate?.nightlyPriceMinor);
    const currency = String(candidate?.currency ?? "TRY").trim().toUpperCase();

    if (!name) return { ok: false, message: "Oda adı boş bırakılamaz." };
    if (
      name.length > ROOM_PUBLIC_DETAIL_LIMITS.name
      || number.length > ROOM_PUBLIC_DETAIL_LIMITS.number
      || bedInfo.length > ROOM_PUBLIC_DETAIL_LIMITS.bedInfo
      || floor.length > ROOM_PUBLIC_DETAIL_LIMITS.floor
      || description.length > ROOM_PUBLIC_DETAIL_LIMITS.description
      || priceNote.length > ROOM_PUBLIC_DETAIL_LIMITS.priceNote
    ) {
      return { ok: false, message: "Oda bilgilerinden biri izin verilen uzunluğu aşıyor." };
    }
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100) {
      return { ok: false, message: "Oda kapasitesi 1 ile 100 arasında olmalı." };
    }
    if (!Number.isSafeInteger(nightlyPriceMinor) || nightlyPriceMinor < 0) {
      return { ok: false, message: "Gecelik oda fiyatı geçersiz." };
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      return { ok: false, message: "Oda para birimi geçersiz." };
    }

    rooms.push({
      id,
      name,
      number,
      capacity,
      bedInfo,
      floor,
      features: normalizeRoomPublicFeatures(candidate?.features ?? []),
      description,
      priceNote,
      nightlyPriceMinor,
      currency
    });
  }

  return { ok: true, rooms };
}

function validateRoomTargets(
  db: DatabaseSync,
  rooms: NormalizedRoomInput[]
): { ok: true } | { ok: false; message: string } {
  const currentRows = db.prepare(
    "SELECT id, status FROM rooms WHERE deleted_at = '' AND is_active = 1"
  ).all() as Array<{ id?: string; status?: string }>;
  const current = new Map(
    currentRows.map((row) => [text(row.id), text(row.status)] as const)
  );
  const requestedIds = new Set(rooms.map((room) => room.id).filter(Boolean));

  for (const room of rooms) {
    if (room.id && !current.has(room.id)) {
      return { ok: false, message: "Düzenlenecek odalardan biri artık mevcut değil." };
    }
  }

  for (const [roomId, status] of current) {
    if (requestedIds.has(roomId)) continue;
    const reason = getRoomRemovalBlockReason(db, roomId, status);
    if (reason) {
      const room = db.prepare("SELECT name, number FROM rooms WHERE id = ? LIMIT 1")
        .get(roomId) as { name?: string; number?: string } | undefined;
      const label = text(room?.name) || (text(room?.number) ? `Oda ${text(room?.number)}` : "Oda");
      return { ok: false, message: `${label} kaldırılamaz: ${reason}` };
    }
  }

  return { ok: true };
}

function reconcileRooms(db: DatabaseSync, rooms: NormalizedRoomInput[], now: string) {
  const currentIds = new Set(
    (db.prepare("SELECT id FROM rooms WHERE deleted_at = '' AND is_active = 1").all() as Array<{ id?: string }>)
      .map((row) => text(row.id))
      .filter(Boolean)
  );
  const retainedIds = new Set<string>();

  const updateRoom = db.prepare(
    "UPDATE rooms SET name = ?, number = ?, capacity = ?, bed_info = ?, floor = ?, features_json = ?, " +
    "description = ?, price_note = ?, nightly_price_minor = ?, price_currency = ?, sort_order = ?, " +
    "is_active = 1, updated_at = ?, deleted_at = '', sync_status = 'local_only' " +
    "WHERE id = ? AND deleted_at = ''"
  );
  const insertRoom = db.prepare(
    "INSERT INTO rooms (" +
    "id, name, number, capacity, bed_info, floor, status, features_json, description, price_note, " +
    "is_active, sort_order, created_at, updated_at, deleted_at, sync_status, nightly_price_minor, price_currency" +
    ") VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, 1, ?, ?, ?, '', 'local_only', ?, ?)"
  );

  rooms.forEach((room, index) => {
    const sortOrder = index + 1;
    if (room.id) {
      retainedIds.add(room.id);
      updateRoom.run(
        room.name,
        room.number,
        room.capacity,
        room.bedInfo,
        room.floor,
        JSON.stringify(room.features),
        room.description,
        room.priceNote,
        room.nightlyPriceMinor,
        room.currency,
        sortOrder,
        now,
        room.id
      );
      return;
    }

    const id = createId("room_");
    retainedIds.add(id);
    insertRoom.run(
      id,
      room.name,
      room.number,
      room.capacity,
      room.bedInfo,
      room.floor,
      JSON.stringify(room.features),
      room.description,
      room.priceNote,
      sortOrder,
      now,
      now,
      room.nightlyPriceMinor,
      room.currency
    );
  });

  const archiveRoom = db.prepare(
    "UPDATE rooms SET is_active = 0, deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?"
  );
  for (const roomId of currentIds) {
    if (!retainedIds.has(roomId)) {
      archiveRoom.run(now, now, roomId);
    }
  }
}

function getRoomRemovalBlockReason(db: DatabaseSync, roomId: string, status = ""): string {
  if (!roomId) return "oda kimliği geçersiz.";

  const activeStay = db.prepare(
    "SELECT 1 FROM customer_room_stays WHERE room_id = ? AND deleted_at = '' " +
    "AND status IN ('planned', 'checked_in') LIMIT 1"
  ).get(roomId);
  if (activeStay) return "aktif veya planlanmış konaklama kaydı var.";

  const activeReservations = db.prepare(
    "SELECT room_ids_json FROM reservations WHERE deleted_at = '' AND status IN ('pending', 'approved')"
  ).all() as Array<{ room_ids_json?: string }>;
  if (activeReservations.some((row) => parseStringArray(row.room_ids_json).includes(roomId))) {
    return "aktif rezervasyona bağlı.";
  }

  const openFolio = db.prepare(
    "SELECT 1 FROM room_folios WHERE room_id = ? AND deleted_at = '' AND status = 'open' LIMIT 1"
  ).get(roomId);
  if (openFolio) return "açık oda hesabı var.";

  const activeTask = db.prepare(
    "SELECT 1 FROM daily_tasks WHERE related_type = 'room' AND related_id = ? AND deleted_at = '' " +
    "AND status NOT IN ('done', 'cancelled', 'archived') LIMIT 1"
  ).get(roomId);
  if (activeTask) return "tamamlanmamış oda görevi var.";

  if (status === "occupied" || status === "reserved") {
    return "oda durumu aktif kullanım gösteriyor.";
  }
  return "";
}

function getProtectedTableIds(db: DatabaseSync): Set<string> {
  const protectedIds = new Set<string>();
  const activeOrders = db.prepare(
    "SELECT table_id FROM table_orders WHERE status IN ('open', 'preparing', 'served', 'payment')"
  ).all() as Array<{ table_id?: string }>;
  for (const row of activeOrders) {
    const id = text(row.table_id);
    if (id) protectedIds.add(id);
  }

  const reservations = db.prepare(
    "SELECT table_ids_json FROM reservations WHERE deleted_at = '' AND status IN ('pending', 'approved')"
  ).all() as Array<{ table_ids_json?: string }>;
  for (const row of reservations) {
    for (const id of parseStringArray(row.table_ids_json)) protectedIds.add(id);
  }

  const unavailable = db.prepare(
    "SELECT id FROM tables WHERE deleted_at = '' AND (" +
    "status != 'available' OR current_customer_id != '' OR current_reservation_id != '')"
  ).all() as Array<{ id?: string }>;
  for (const row of unavailable) {
    const id = text(row.id);
    if (id) protectedIds.add(id);
  }

  const existing = new Set(
    (db.prepare("SELECT id FROM tables WHERE deleted_at = ''").all() as Array<{ id?: string }>)
      .map((row) => text(row.id))
      .filter(Boolean)
  );
  return new Set([...protectedIds].filter((id) => existing.has(id)));
}

function reconcileTableCategories(
  db: DatabaseSync,
  categories: NormalizedTableCategoryInput[],
  now: string,
  protectedIds: Set<string>
) {
  const tables = db.prepare(
    "SELECT id, name, area, capacity, status, is_active, sort_order " +
    "FROM tables WHERE deleted_at = '' ORDER BY sort_order ASC, name ASC"
  ).all() as Array<Record<string, unknown>>;
  const remaining = [...tables];
  const assignments = categories.map((category) => ({
    category,
    tables: [] as Array<Record<string, unknown>>
  }));

  const takeFromRemaining = (
    assignment: (typeof assignments)[number],
    predicate: (table: Record<string, unknown>) => boolean
  ) => {
    for (let index = 0; index < remaining.length && assignment.tables.length < assignment.category.tableCount;) {
      if (predicate(remaining[index])) {
        assignment.tables.push(remaining.splice(index, 1)[0]);
      } else {
        index += 1;
      }
    }
  };

  for (const assignment of assignments) {
    const sourceKey = assignment.category.sourceKey || assignment.category.nameKey;
    takeFromRemaining(
      assignment,
      (table) => protectedIds.has(text(table.id))
        && tableCategoryKey(normalizeTableCategoryName(table.area)) === sourceKey
    );
  }

  const assignFromPool = (protectedOnly: boolean) => {
    for (const assignment of assignments) {
      while (assignment.tables.length < assignment.category.tableCount) {
        const candidateIndex = remaining.findIndex(
          (table) => protectedIds.has(text(table.id)) === protectedOnly
        );
        if (candidateIndex < 0) break;
        assignment.tables.push(remaining.splice(candidateIndex, 1)[0]);
      }
    }
  };

  assignFromPool(true);

  for (const assignment of assignments) {
    const sourceKey = assignment.category.sourceKey || assignment.category.nameKey;
    takeFromRemaining(
      assignment,
      (table) => !protectedIds.has(text(table.id))
        && tableCategoryKey(normalizeTableCategoryName(table.area)) === sourceKey
    );
  }

  assignFromPool(false);
  for (const assignment of assignments) {
    assignment.tables.sort(
      (left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0)
        || text(left.name).localeCompare(text(right.name), "tr")
    );
  }

  const updateTable = db.prepare(
    "UPDATE tables SET name = ?, area = ?, is_active = 1, sort_order = ?, updated_at = ?, " +
    "deleted_at = '', sync_status = 'local_only' WHERE id = ?"
  );
  const insertTable = db.prepare(
    "INSERT INTO tables (" +
    "id, name, area, capacity, status, notes, is_active, sort_order, created_at, updated_at, sync_status" +
    ") VALUES (?, ?, ?, 4, 'available', '', 1, ?, ?, ?, 'local_only')"
  );

  let sortOrder = 1;
  for (const assignment of assignments) {
    for (let index = 0; index < assignment.category.tableCount; index += 1) {
      const table = assignment.tables[index];
      const position = index + 1;
      if (table) {
        const nextName = reconcileTableName(table.name, table.area, assignment.category.name, position);
        if (
          nextName !== text(table.name)
          || assignment.category.name !== text(table.area)
          || sortOrder !== Number(table.sort_order ?? 0)
          || Number(table.is_active ?? 0) !== 1
        ) {
          updateTable.run(nextName, assignment.category.name, sortOrder, now, text(table.id));
        }
      } else {
        insertTable.run(
          createId("table_"),
          `${assignment.category.name} ${position}`,
          assignment.category.name,
          sortOrder,
          now,
          now
        );
      }
      sortOrder += 1;
    }
  }

  const archiveTable = db.prepare(
    "UPDATE tables SET is_active = 0, deleted_at = ?, updated_at = ?, sync_status = 'local_only' WHERE id = ?"
  );
  for (const table of remaining) {
    archiveTable.run(now, now, text(table.id));
  }
}

function parseStringArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => text(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeSingleLine(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeMultiline(value: unknown): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function cleanSingleLine(value: unknown, maxLength: number): string {
  return normalizeSingleLine(value).slice(0, maxLength);
}

function normalizeCurrency(value: unknown): string {
  const normalized = String(value ?? "TRY").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "TRY";
}
