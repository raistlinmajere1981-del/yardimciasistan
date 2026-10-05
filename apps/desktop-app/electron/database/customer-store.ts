import { parseStoredStringArray } from "./string-array-utils.js";
import type { DatabaseSync } from "node:sqlite";
import {
  createId,
  type CommercePriceGroup,
  type CustomerDealerStatus
} from "@yardimci-asistan/shared";
import type {
  DesktopCustomer,
  SaveCustomerInput
} from "../database-types.js";
import { insertDatabaseEvent, type DomainMutationContext } from "./event-store.js";
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
          commercial.customer_id AS commercial_customer_id,
          commercial.business_id AS commercial_business_id,
          commercial.company_name AS commercial_company_name,
          commercial.tax_office AS commercial_tax_office,
          commercial.tax_number AS commercial_tax_number,
          commercial.authorized_person AS commercial_authorized_person,
          commercial.dealer_status AS commercial_dealer_status,
          commercial.price_group AS commercial_price_group,
          commercial.payment_term_days AS commercial_payment_term_days,
          commercial.notes AS commercial_notes,
          commercial.created_at AS commercial_created_at,
          commercial.updated_at AS commercial_updated_at,
          COUNT(DISTINCT requests.id) AS request_count,
          COUNT(DISTINCT reservations.id) AS reservation_count,
          COUNT(DISTINCT customer_room_stays.id) AS stay_count
        FROM customers
        LEFT JOIN customer_commercial_profiles commercial ON commercial.customer_id = customers.id
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
    commercialProfile: row.commercial_customer_id ? {
      customerId: String(row.commercial_customer_id ?? ""),
      businessId: String(row.commercial_business_id ?? ""),
      companyName: String(row.commercial_company_name ?? ""),
      taxOffice: String(row.commercial_tax_office ?? ""),
      taxNumber: String(row.commercial_tax_number ?? ""),
      authorizedPerson: String(row.commercial_authorized_person ?? ""),
      dealerStatus: String(row.commercial_dealer_status ?? "candidate") as CustomerDealerStatus,
      priceGroup: String(row.commercial_price_group ?? "retail") as CommercePriceGroup,
      paymentTermDays: Number(row.commercial_payment_term_days ?? 0),
      notes: String(row.commercial_notes ?? ""),
      createdAt: String(row.commercial_created_at ?? ""),
      updatedAt: String(row.commercial_updated_at ?? "")
    } : null,
    requestCount: Number(row.request_count ?? 0),
    reservationCount: Number(row.reservation_count ?? 0),
    stayCount: Number(row.stay_count ?? 0),
    updatedAt: String(row.updated_at ?? "")
  };
}

const DEALER_STATUSES = new Set<CustomerDealerStatus>(["candidate", "active", "inactive"]);
const PRICE_GROUPS = new Set<CommercePriceGroup>(["retail", "dealer_a", "dealer_b"]);

function activeBusinessId(db: DatabaseSync): string {
  const row = db.prepare(`
    SELECT id
    FROM business
    WHERE deleted_at = ''
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id?: unknown } | undefined;
  return String(row?.id ?? "").trim();
}

function normalizeCommercialProfile(input: SaveCustomerInput["commercialProfile"]) {
  if (input === undefined || input === null) {
    return { ok: true as const, profile: input };
  }

  const companyName = String(input.companyName ?? "").trim().replace(/\s+/g, " ");
  const taxOffice = String(input.taxOffice ?? "").trim().replace(/\s+/g, " ");
  const taxNumber = String(input.taxNumber ?? "").trim().replace(/\s+/g, "");
  const authorizedPerson = String(input.authorizedPerson ?? "").trim().replace(/\s+/g, " ");
  const dealerStatus = String(input.dealerStatus ?? "candidate") as CustomerDealerStatus;
  const priceGroup = String(input.priceGroup ?? "retail") as CommercePriceGroup;
  const paymentTermDays = Number(input.paymentTermDays ?? 0);
  const notes = String(input.notes ?? "").trim();

  if (!companyName) return { ok: false as const, message: "Ticari profil için firma / unvan gerekli." };
  if (companyName.length > 180) return { ok: false as const, message: "Firma / unvan en fazla 180 karakter olabilir." };
  if (taxOffice.length > 120) return { ok: false as const, message: "Vergi dairesi en fazla 120 karakter olabilir." };
  if (taxNumber.length > 32) return { ok: false as const, message: "Vergi numarası en fazla 32 karakter olabilir." };
  if (authorizedPerson.length > 160) return { ok: false as const, message: "Yetkili kişi en fazla 160 karakter olabilir." };
  if (!DEALER_STATUSES.has(dealerStatus)) return { ok: false as const, message: "Bayi durumu geçersiz." };
  if (!PRICE_GROUPS.has(priceGroup)) return { ok: false as const, message: "Fiyat grubu geçersiz." };
  if (!Number.isInteger(paymentTermDays) || paymentTermDays < 0 || paymentTermDays > 3650) {
    return { ok: false as const, message: "Ödeme vadesi 0 ile 3650 gün arasında olmalı." };
  }
  if (notes.length > 2000) return { ok: false as const, message: "Ticari not en fazla 2000 karakter olabilir." };

  return {
    ok: true as const,
    profile: {
      companyName,
      taxOffice,
      taxNumber,
      authorizedPerson,
      dealerStatus,
      priceGroup,
      paymentTermDays,
      notes
    }
  };
}

export function saveCustomer(db: DatabaseSync, input: SaveCustomerInput, context: DomainMutationContext & { newCustomerId?: string } = {}): { ok: true; message: string; savedId: string } | { ok: false; message: string } {
  const normalized = normalizeCustomerInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  const commercial = normalizeCommercialProfile(input.commercialProfile);
  if (!commercial.ok) return commercial;

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

  let businessId = "";
  if (commercial.profile !== undefined && commercial.profile !== null) {
    businessId = activeBusinessId(db);
    if (!businessId) {
      return { ok: false, message: "Aktif işletme bulunamadı." };
    }
    if (commercial.profile.taxNumber) {
      const duplicateTaxNumber = db.prepare(`
        SELECT customer_id
        FROM customer_commercial_profiles
        WHERE business_id = ? AND tax_number = ? AND customer_id != ?
        LIMIT 1
      `).get(businessId, commercial.profile.taxNumber, requestedId);
      if (duplicateTaxNumber) {
        return { ok: false, message: "Bu vergi numarası başka bir ticari müşteri profilinde kayıtlı." };
      }
    }
  }

  const id = requestedId || context.newCustomerId || createId("customer_");
  const now = context.now ?? new Date().toISOString();
  const source = String(existing?.source ?? (context.androidAction ? "android" : "manual")) || "manual";
  const createdAt = String(existing?.created_at ?? now) || now;
  const customer = normalized.customer;
  const birthdayMessageEnabled = input.birthdayMessageEnabled === undefined
    ? normalizeBoolean(existing?.birthday_message_enabled, true)
    : normalizeBoolean(input.birthdayMessageEnabled, true);

  db.exec("SAVEPOINT customer_save");
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
    if (commercial.profile === null) {
      db.prepare("DELETE FROM customer_commercial_profiles WHERE customer_id = ?").run(id);
    } else if (commercial.profile !== undefined) {
      const existingProfile = db.prepare(
        "SELECT created_at FROM customer_commercial_profiles WHERE customer_id = ? LIMIT 1"
      ).get(id) as { created_at?: unknown } | undefined;
      const commercialCreatedAt = String(existingProfile?.created_at ?? now) || now;
      db.prepare(`
        INSERT INTO customer_commercial_profiles (
          customer_id, business_id, company_name, tax_office, tax_number,
          authorized_person, dealer_status, price_group, payment_term_days, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(customer_id) DO UPDATE SET
          business_id = excluded.business_id,
          company_name = excluded.company_name,
          tax_office = excluded.tax_office,
          tax_number = excluded.tax_number,
          authorized_person = excluded.authorized_person,
          dealer_status = excluded.dealer_status,
          price_group = excluded.price_group,
          payment_term_days = excluded.payment_term_days,
          notes = excluded.notes,
          updated_at = excluded.updated_at
      `).run(
        id,
        businessId,
        commercial.profile.companyName,
        commercial.profile.taxOffice,
        commercial.profile.taxNumber,
        commercial.profile.authorizedPerson,
        commercial.profile.dealerStatus,
        commercial.profile.priceGroup,
        commercial.profile.paymentTermDays,
        commercial.profile.notes,
        commercialCreatedAt,
        now
      );
    }

    insertDatabaseEvent(db, {
      type: requestedId ? "customer.updated" : "customer.created",
      androidAction: context.androidAction,
      entityType: "customer",
      entityId: id,
      payload: {
        source: context.androidAction ? "android" : requestedId ? "desktop_edit" : "desktop_manual",
        identity_type: customer.identityType,
        has_identity_number: Boolean(customer.identityNumber),
        commercial_profile_changed: input.commercialProfile !== undefined,
        dealer_status: commercial.profile && typeof commercial.profile === "object"
          ? commercial.profile.dealerStatus
          : ""
      },
      now
    });
    db.exec("RELEASE customer_save");
  } catch (error) {
    db.exec("ROLLBACK TO customer_save; RELEASE customer_save");
    return { ok: false, message: "Müşteri kartı kaydedilemedi. Kimlik ve iletişim alanlarını kontrol edin." };
  }

  return {
    ok: true,
    message: requestedId ? "Müşteri kartı güncellendi." : "Müşteri kartı oluşturuldu.",
    savedId: id
  };
}
