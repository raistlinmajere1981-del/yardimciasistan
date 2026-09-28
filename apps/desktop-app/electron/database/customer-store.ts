import { parseStoredStringArray } from "./string-array-utils.js";
import type { DatabaseSync } from "node:sqlite";
import { createId } from "@yardimci-asistan/shared";
import type {
  DesktopCustomer,
  SaveCustomerInput
} from "../database-types.js";
import { insertDatabaseEvent } from "./event-store.js";
import {
  normalizeCustomerGender,
  normalizeCustomerIdentityType,
  normalizeCustomerInput
} from "./customer-utils.js";
import { normalizeBoolean } from "./request-utils.js";

export function getCustomers(db: DatabaseSync): DesktopCustomer[] {
  const rows = db
    .prepare(`
        SELECT
          customers.id,
          customers.full_name,
          customers.phone,
          customers.email,
          customers.source,
          customers.notes,
          customers.tags_json,
          customers.last_contact_at,
          customers.identity_type,
          customers.identity_number,
          customers.nationality,
          customers.birth_date,
          customers.gender,
          customers.birthday_message_enabled,
          customers.document_serial_number,
          customers.document_expiry_date,
          customers.birth_place,
          customers.mother_name,
          customers.father_name,
          customers.issuing_authority,
          customers.address,
          customers.updated_at,
          COUNT(DISTINCT requests.id) AS request_count,
          COUNT(DISTINCT reservations.id) AS reservation_count,
          COUNT(DISTINCT customer_room_stays.id) AS stay_count
        FROM customers
        LEFT JOIN requests ON requests.customer_id = customers.id AND requests.deleted_at = ''
        LEFT JOIN reservations ON reservations.customer_id = customers.id AND reservations.deleted_at = ''
        LEFT JOIN stay_guests ON stay_guests.customer_id = customers.id
        LEFT JOIN customer_room_stays ON customer_room_stays.id = stay_guests.stay_id AND customer_room_stays.deleted_at = ''
        WHERE customers.deleted_at = ''
        GROUP BY customers.id
        ORDER BY
          COALESCE(NULLIF(customers.last_contact_at, ''), customers.updated_at) DESC,
          customers.full_name ASC
        LIMIT 500
      `)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => mapCustomerRow(row));
}

function mapCustomerRow(row: Record<string, unknown>): DesktopCustomer {
  return {
    id: String(row.id ?? ""),
    fullName: String(row.full_name ?? ""),
    phone: String(row.phone ?? ""),
    email: String(row.email ?? ""),
    source: String(row.source ?? "manual"),
    notes: String(row.notes ?? ""),
    tags: parseStoredStringArray(row.tags_json),
    lastContactAt: String(row.last_contact_at ?? ""),
    identityType: normalizeCustomerIdentityType(row.identity_type),
    identityNumber: String(row.identity_number ?? ""),
    nationality: String(row.nationality ?? ""),
    birthDate: String(row.birth_date ?? ""),
    gender: normalizeCustomerGender(row.gender),
    birthdayMessageEnabled: normalizeBoolean(row.birthday_message_enabled, true),
    documentSerialNumber: String(row.document_serial_number ?? ""),
    documentExpiryDate: String(row.document_expiry_date ?? ""),
    birthPlace: String(row.birth_place ?? ""),
    motherName: String(row.mother_name ?? ""),
    fatherName: String(row.father_name ?? ""),
    issuingAuthority: String(row.issuing_authority ?? ""),
    address: String(row.address ?? ""),
    requestCount: Number(row.request_count ?? 0),
    reservationCount: Number(row.reservation_count ?? 0),
    stayCount: Number(row.stay_count ?? 0),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function saveCustomer(db: DatabaseSync, input: SaveCustomerInput): { ok: true; message: string; savedId: string } | { ok: false; message: string } {
  const normalized = normalizeCustomerInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  const requestedId = String(input?.id ?? "").trim();
  const existing = requestedId
    ? db.prepare("SELECT id, source, created_at, birthday_message_enabled FROM customers WHERE id = ? AND deleted_at = ''").get(requestedId) as Record<string, unknown> | undefined
    : undefined;
  if (requestedId && !existing) {
    return { ok: false, message: "Düzenlenecek müşteri bulunamadı." };
  }

  const duplicateIdentity = normalized.customer.identityNumber
    ? db
      .prepare("SELECT id FROM customers WHERE identity_number = ? AND id != ? AND deleted_at = '' LIMIT 1")
      .get(normalized.customer.identityNumber, requestedId)
    : undefined;
  if (duplicateIdentity) {
    return { ok: false, message: "Bu kimlik numarası başka bir müşteri kartında kayıtlı." };
  }
  const duplicatePhone = normalized.customer.phone
    ? db
      .prepare("SELECT id FROM customers WHERE phone = ? AND id != ? AND deleted_at = '' LIMIT 1")
      .get(normalized.customer.phone, requestedId)
    : undefined;
  if (duplicatePhone) {
    return { ok: false, message: "Bu telefon numarasıyla kayıtlı bir müşteri zaten var." };
  }

  const id = requestedId || createId("customer_");
  const now = new Date().toISOString();
  const source = String(existing?.source ?? "manual") || "manual";
  const createdAt = String(existing?.created_at ?? now) || now;
  const customer = normalized.customer;
  const birthdayMessageEnabled = input.birthdayMessageEnabled === undefined
    ? normalizeBoolean(existing?.birthday_message_enabled, true)
    : normalizeBoolean(input.birthdayMessageEnabled, true);

  db.exec("BEGIN IMMEDIATE");
  try {
    db
      .prepare(`
          INSERT INTO customers (
            id, full_name, phone, email, source, notes, tags_json, last_contact_at,
            identity_type, identity_number, nationality, birth_date, gender,
            birthday_message_enabled,
            document_serial_number, document_expiry_date, birth_place, mother_name,
            father_name, issuing_authority, address, created_at, updated_at,
            deleted_at, sync_status
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, '',
            ?, ?, ?, ?, ?,
            ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            '', 'local_only'
          )
          ON CONFLICT(id) DO UPDATE SET
            full_name = excluded.full_name,
            phone = excluded.phone,
            email = excluded.email,
            notes = excluded.notes,
            tags_json = excluded.tags_json,
            identity_type = excluded.identity_type,
            identity_number = excluded.identity_number,
            nationality = excluded.nationality,
            birth_date = excluded.birth_date,
            gender = excluded.gender,
            birthday_message_enabled = excluded.birthday_message_enabled,
            document_serial_number = excluded.document_serial_number,
            document_expiry_date = excluded.document_expiry_date,
            birth_place = excluded.birth_place,
            mother_name = excluded.mother_name,
            father_name = excluded.father_name,
            issuing_authority = excluded.issuing_authority,
            address = excluded.address,
            updated_at = excluded.updated_at,
            deleted_at = '',
            sync_status = 'local_only'
        `)
      .run(
        id,
        customer.fullName,
        customer.phone,
        customer.email,
        source,
        customer.notes,
        JSON.stringify(customer.tags),
        customer.identityType,
        customer.identityNumber,
        customer.nationality,
        customer.birthDate,
        customer.gender,
        birthdayMessageEnabled ? 1 : 0,
        customer.documentSerialNumber,
        customer.documentExpiryDate,
        customer.birthPlace,
        customer.motherName,
        customer.fatherName,
        customer.issuingAuthority,
        customer.address,
        createdAt,
        now
      );
    insertDatabaseEvent(db, {
      type: requestedId ? "customer.updated" : "customer.created",
      entityType: "customer",
      entityId: id,
      payload: {
        source: requestedId ? "desktop_edit" : "desktop_manual",
        identity_type: customer.identityType,
        has_identity_number: Boolean(customer.identityNumber)
      },
      now
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    return { ok: false, message: "Müşteri kartı kaydedilemedi. Kimlik ve iletişim alanlarını kontrol edin." };
  }

  return {
    ok: true,
    message: requestedId ? "Müşteri kartı güncellendi." : "Müşteri kartı oluşturuldu.",
    savedId: id
  };
}
